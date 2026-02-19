#!/usr/bin/env python3
"""
Build Groene Straten datasets for SlimShady using administrative overview units.

Default behavior matches policy use-case:
- Base 15m buffer around GROENE_STRATEN lines
- Select full sidewalks (no clipping) that intersect the policy buffer
- Aggregate to Gebied units (dissolved from geojson_lnglat.json)
- Adaptive outskirts expansion (optional, enabled by default)
"""

from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path
from typing import Iterable

import geopandas as gpd
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

GREEN_STREETS_FILE = DATA_DIR / "GROENE_STRATEN.mif"
ADMIN_BOUNDARIES_FILE = DATA_DIR / "geojson_lnglat.json"

DEFAULT_SIDEWALK_SOURCE = Path("../Shady_politics/results/output/sidewalks_sai_filtered.gpkg")
FALLBACK_SIDEWALK_SOURCE = DATA_DIR / "sidewalks_with_functions.geojson"

OUTPUT_STATS_FILE = DATA_DIR / "groene_straten_with_shade_stats.geojson"
OUTPUT_DETAIL_DIR = DATA_DIR / "GroeneStraat_data"
OUTPUT_LINES_FILE = DATA_DIR / "groene_straten_lines.geojson"

METRIC_CRS = "EPSG:28992"
WEB_CRS = "EPSG:4326"

INDEX_FIELD = "shade_availability_index_30"
DETAIL_FILENAME_PATTERN = "groene_straat_{id}.geojson"

ADMIN_LEVEL_MAP = {
    "gebied": "Gebied",
    "stadsdeel": "Stadsdeel",
}

DETAIL_FIELDS = [
    "Guid",
    "Gebruiksfunctie",
    "Jaar_van_aanleg",
    "Jaar_laatste_conservering",
    "Jaar_uitgevoerd_onderhoud",
    "shade_availability_index_30",
    "shade_availability_index_40",
    "shade_availability_index_50",
    "shade_percent_at_1000",
    "shade_percent_at_1300",
    "shade_percent_at_1530",
    "shade_percent_at_1800",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Groene Straten administrative datasets for the SlimShady website."
    )
    parser.add_argument(
        "--buffer-meters",
        type=float,
        default=15.0,
        help="Base buffer distance around green street centerlines in meters (default: 15).",
    )
    parser.add_argument(
        "--admin-level",
        type=str,
        choices=sorted(ADMIN_LEVEL_MAP.keys()),
        default="gebied",
        help="Administrative level for overview units (default: gebied).",
    )
    parser.add_argument(
        "--selection-mode",
        type=str,
        choices=["adaptive", "fixed"],
        default="adaptive",
        help="Selection strategy for wide roads (default: adaptive).",
    )
    parser.add_argument(
        "--adaptive-max-buffer-meters",
        type=float,
        default=22.5,
        help="Maximum adaptive buffer in meters when selection-mode=adaptive (default: 22.5).",
    )
    parser.add_argument(
        "--adaptive-growth-threshold",
        type=float,
        default=0.15,
        help="Minimum relative growth from base to max buffer per unit for adaptive expansion (default: 0.15).",
    )
    parser.add_argument(
        "--adaptive-p90-threshold",
        type=float,
        default=21.5,
        help="Minimum p90 distance (meters) in indicator band for adaptive expansion (default: 21.5).",
    )
    parser.add_argument(
        "--adaptive-indicator-distance",
        type=float,
        default=35.0,
        help="Distance band (meters) used to diagnose wide-road units (default: 35).",
    )
    parser.add_argument(
        "--adaptive-force-unit",
        action="append",
        default=[],
        help=(
            "Unit name to always expand to adaptive max buffer. "
            "Can be provided multiple times."
        ),
    )
    parser.add_argument(
        "--sidewalk-source",
        type=Path,
        default=None,
        help=(
            "Path to source sidewalks dataset. "
            "If omitted, tries ../Shady_politics/results/output/sidewalks_sai_filtered.gpkg "
            "and then data/sidewalks_with_functions.geojson."
        ),
    )
    parser.add_argument(
        "--clip",
        action="store_true",
        help=(
            "Clip sidewalk geometry to green-street buffers. "
            "Default is no clipping (full sidewalk segments)."
        ),
    )
    return parser.parse_args()


def pick_sidewalk_source(user_source: Path | None) -> Path:
    if user_source is not None:
        path = (BASE_DIR / user_source).resolve() if not user_source.is_absolute() else user_source
        if path.exists():
            return path
        raise FileNotFoundError(f"Provided --sidewalk-source not found: {path}")

    default_path = (BASE_DIR / DEFAULT_SIDEWALK_SOURCE).resolve()
    if default_path.exists():
        return default_path
    if FALLBACK_SIDEWALK_SOURCE.exists():
        return FALLBACK_SIDEWALK_SOURCE

    raise FileNotFoundError(
        "Could not find a sidewalks source. "
        "Provide --sidewalk-source or place one at "
        f"{default_path} / {FALLBACK_SIDEWALK_SOURCE}."
    )


def ensure_valid_line_geometries(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    fixed = gdf.copy()
    fixed = fixed[fixed.geometry.notna() & ~fixed.geometry.is_empty]
    try:
        fixed.geometry = fixed.geometry.make_valid()
    except Exception:
        pass
    fixed = fixed[fixed.geometry.notna() & ~fixed.geometry.is_empty]
    return fixed


def ensure_valid_surface_geometries(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    fixed = gdf.copy()
    fixed = fixed[fixed.geometry.notna() & ~fixed.geometry.is_empty]
    try:
        fixed.geometry = fixed.geometry.make_valid()
    except Exception:
        pass
    fixed.geometry = fixed.geometry.buffer(0)
    fixed = fixed[fixed.geometry.notna() & ~fixed.geometry.is_empty]
    return fixed


def quantile_index(values: list[float], q: float) -> float:
    if not values:
        return float("nan")
    pos = (len(values) - 1) * q
    low = int(pos)
    high = min(low + 1, len(values) - 1)
    if low == high:
        return values[low]
    return values[low] + (values[high] - values[low]) * (pos - low)


def available_columns(columns: Iterable[str], desired: Iterable[str]) -> list[str]:
    colset = set(columns)
    return [c for c in desired if c in colset]


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_value).strip("_").lower()
    return slug or "unit"


def build_unique_unit_ids(values: Iterable[str]) -> list[str]:
    counts: dict[str, int] = {}
    ids: list[str] = []
    for value in values:
        base = slugify(value)
        n = counts.get(base, 0)
        counts[base] = n + 1
        unit_id = base if n == 0 else f"{base}_{n+1}"
        ids.append(unit_id)
    return ids


def assign_sidewalks_to_units(
    sidewalks: gpd.GeoDataFrame,
    units: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    pts = sidewalks[["geometry"]].copy()
    pts.geometry = pts.geometry.representative_point()

    assign = gpd.sjoin(
        pts,
        units[["unit_id", "unit_name", "admin_level", "geometry"]],
        how="left",
        predicate="within",
    )
    assign = assign[~assign.index.duplicated(keep="first")]
    assign = assign[["unit_id", "unit_name", "admin_level"]]

    missing_idx = assign[assign["unit_id"].isna()].index
    if len(missing_idx) > 0:
        nearest = gpd.sjoin_nearest(
            pts.loc[missing_idx],
            units[["unit_id", "unit_name", "admin_level", "geometry"]],
            how="left",
            distance_col="distance_to_unit",
        )
        nearest = nearest[~nearest.index.duplicated(keep="first")]
        nearest = nearest[["unit_id", "unit_name", "admin_level"]]
        assign.loc[nearest.index, ["unit_id", "unit_name", "admin_level"]] = nearest[
            ["unit_id", "unit_name", "admin_level"]
        ]

    return sidewalks.join(assign[["unit_id", "unit_name", "admin_level"]])


def choose_adaptive_units(
    sidewalks: gpd.GeoDataFrame,
    base_buffer: float,
    max_buffer: float,
    indicator_distance: float,
    growth_threshold: float,
    p90_threshold: float,
) -> tuple[set[str], pd.DataFrame]:
    indicator = sidewalks[sidewalks["dist_to_green_m"] <= indicator_distance]

    rows = []
    for unit_name, group in indicator.groupby("unit_name"):
        c_base = int((group["dist_to_green_m"] <= base_buffer).sum())
        c_max = int((group["dist_to_green_m"] <= max_buffer).sum())
        growth = (c_max - c_base) / max(c_base, 1)
        p90 = float(group["dist_to_green_m"].quantile(0.9))
        rows.append(
            {
                "unit_name": unit_name,
                "count_base": c_base,
                "count_max": c_max,
                "growth": growth,
                "p90_indicator": p90,
            }
        )

    summary = pd.DataFrame(rows)
    if summary.empty:
        return set(), summary

    expanded = summary[
        (summary["growth"] >= growth_threshold)
        & (summary["p90_indicator"] >= p90_threshold)
        & (summary["count_max"] > summary["count_base"])
    ]
    return set(expanded["unit_name"].astype(str)), summary


def main() -> None:
    args = parse_args()
    if args.buffer_meters <= 0:
        raise ValueError("--buffer-meters must be > 0")

    base_buffer = float(args.buffer_meters)
    max_buffer = max(base_buffer, float(args.adaptive_max_buffer_meters))
    indicator_distance = max(max_buffer, float(args.adaptive_indicator_distance))
    admin_field = ADMIN_LEVEL_MAP[args.admin_level]

    print("=" * 80)
    print("PROCESSING AMSTERDAM GROENE STRATEN FOR WEBSITE")
    print("=" * 80)
    print(f"\nBase buffer: {base_buffer:.1f}m")
    print(f"Admin level: {admin_field}")
    print(f"Selection mode: {args.selection_mode}")
    if args.selection_mode == "adaptive":
        print(
            f"Adaptive max buffer: {max_buffer:.1f}m | "
            f"growth >= {args.adaptive_growth_threshold:.2f} | "
            f"p90 >= {args.adaptive_p90_threshold:.1f}m"
        )
    print(f"Clip geometry: {'yes' if args.clip else 'no (full sidewalks)'}")

    if not GREEN_STREETS_FILE.exists():
        raise FileNotFoundError(f"Missing source file: {GREEN_STREETS_FILE}")
    if not ADMIN_BOUNDARIES_FILE.exists():
        raise FileNotFoundError(f"Missing source file: {ADMIN_BOUNDARIES_FILE}")

    sidewalk_source = pick_sidewalk_source(args.sidewalk_source)
    print(f"Sidewalk source: {sidewalk_source}")

    print("\n1) Loading Groene Straten lines...")
    green_lines = gpd.read_file(GREEN_STREETS_FILE).to_crs(METRIC_CRS)
    green_lines = ensure_valid_line_geometries(green_lines)
    print(f"   Loaded {len(green_lines):,} valid line features")

    # Export line overlay for frontend guidance
    line_cols = available_columns(
        green_lines.columns,
        [
            "OBJECTNUMMER",
            "Objectnummer_1",
            "Soort_verbinding",
            "Mate_van_ingrijpen",
            "Groot_onderhoud",
            "Inrichting_noodzakelijk",
            "OK",
            "Beschrijving",
        ],
    )
    line_export = green_lines[line_cols + ["geometry"]].copy()
    line_export["line_id"] = range(1, len(line_export) + 1)
    line_export.to_crs(WEB_CRS).to_file(OUTPUT_LINES_FILE, driver="GeoJSON")
    print(f"   Saved {OUTPUT_LINES_FILE}")

    green_union = green_lines.geometry.unary_union

    print("\n2) Loading sidewalks...")
    sidewalks = gpd.read_file(sidewalk_source).to_crs(METRIC_CRS)
    sidewalks = ensure_valid_surface_geometries(sidewalks)
    print(f"   Loaded {len(sidewalks):,} valid sidewalk features")
    if INDEX_FIELD not in sidewalks.columns:
        raise KeyError(f"Sidewalks source is missing required '{INDEX_FIELD}' field")

    print("\n3) Building administrative overview units...")
    buurten = gpd.read_file(ADMIN_BOUNDARIES_FILE).to_crs(METRIC_CRS)
    if admin_field not in buurten.columns:
        raise KeyError(f"Admin boundary source missing required '{admin_field}' field")

    unit_names = buurten[admin_field].fillna("").astype(str).str.strip()
    if admin_field == "Gebied" and "Stadsdeel" in buurten.columns:
        fallback = buurten["Stadsdeel"].fillna("").astype(str).str.strip()
        unit_names = unit_names.mask(unit_names == "", fallback)
    unit_names = unit_names.mask(unit_names == "", "Onbekend")

    units = buurten[["geometry"]].copy()
    units["unit_name"] = unit_names
    units = units.dissolve(by="unit_name", as_index=False)
    units = ensure_valid_surface_geometries(units)
    units["unit_name"] = units["unit_name"].astype(str)
    units["unit_id"] = build_unique_unit_ids(units["unit_name"].tolist())
    units["admin_level"] = admin_field
    print(f"   Built {len(units):,} dissolved {admin_field} units")

    print("\n4) Assigning sidewalks to overview units...")
    sidewalks = assign_sidewalks_to_units(sidewalks, units)
    missing_units = int(sidewalks["unit_id"].isna().sum())
    if missing_units:
        print(f"   Warning: {missing_units} sidewalks still unassigned to units")

    print("\n5) Selecting sidewalks intersecting Groene Straten policy buffer...")
    sidewalks["dist_to_green_m"] = sidewalks.geometry.distance(green_union)

    expanded_units: set[str] = set()
    adaptive_summary = pd.DataFrame()
    if args.selection_mode == "adaptive":
        expanded_units, adaptive_summary = choose_adaptive_units(
            sidewalks=sidewalks,
            base_buffer=base_buffer,
            max_buffer=max_buffer,
            indicator_distance=indicator_distance,
            growth_threshold=float(args.adaptive_growth_threshold),
            p90_threshold=float(args.adaptive_p90_threshold),
        )
        if args.adaptive_force_unit:
            valid_unit_names = set(sidewalks["unit_name"].dropna().astype(str).unique())
            forced_units = {u for u in args.adaptive_force_unit if u in valid_unit_names}
            expanded_units |= forced_units
        selected_mask = (sidewalks["dist_to_green_m"] <= base_buffer) | (
            (sidewalks["dist_to_green_m"] <= max_buffer)
            & sidewalks["unit_name"].isin(expanded_units)
        )
    else:
        selected_mask = sidewalks["dist_to_green_m"] <= base_buffer

    selected = sidewalks[selected_mask].copy()
    selected_for_stats = selected.dropna(subset=["unit_id"]).copy()

    print(f"   Selected sidewalks: {len(selected):,}")
    print(f"   Selected + assigned sidewalks: {len(selected_for_stats):,}")
    if args.selection_mode == "adaptive":
        print(f"   Adaptive expanded units: {len(expanded_units)}")
        if args.adaptive_force_unit:
            print(f"   Forced expanded units requested: {len(args.adaptive_force_unit)}")
        if expanded_units:
            expanded_names = sorted(expanded_units)
            preview = ", ".join(expanded_names[:8])
            suffix = " ..." if len(expanded_names) > 8 else ""
            print(f"   Expanded unit sample: {preview}{suffix}")

    print("\n6) Aggregating unit statistics...")
    stats = (
        selected_for_stats.dropna(subset=[INDEX_FIELD])
        .groupby("unit_id")[INDEX_FIELD]
        .agg(["mean", "std", "count", "min", "max"])
        .reset_index()
        .rename(
            columns={
                "mean": f"{INDEX_FIELD}_mean",
                "std": f"{INDEX_FIELD}_std",
                "count": f"{INDEX_FIELD}_count",
                "min": f"{INDEX_FIELD}_min",
                "max": f"{INDEX_FIELD}_max",
            }
        )
    )

    coverage = (
        selected_for_stats.dropna(subset=[INDEX_FIELD])
        .groupby("unit_id")[INDEX_FIELD]
        .apply(
            lambda s: pd.Series(
                {
                    "coverage_poor": (s < 0.5).mean() * 100,
                    "coverage_acceptable": ((s >= 0.5) & (s < 0.7)).mean() * 100,
                    "coverage_good": ((s >= 0.7) & (s < 0.9)).mean() * 100,
                    "coverage_excellent": (s >= 0.9).mean() * 100,
                }
            )
        )
        .reset_index()
    )
    if not coverage.empty:
        coverage = coverage.pivot(index="unit_id", columns="level_1", values=INDEX_FIELD).reset_index()
        coverage.columns.name = None

    units = units.merge(stats, on="unit_id", how="left")
    if not coverage.empty:
        units = units.merge(coverage, on="unit_id", how="left")

    count_col = f"{INDEX_FIELD}_count"
    units[count_col] = units[count_col].fillna(0).astype(int)
    units["buffer_m"] = base_buffer
    units["selection_mode"] = args.selection_mode
    units["max_buffer_m"] = max_buffer if args.selection_mode == "adaptive" else base_buffer
    units["geometry_mode"] = "clipped" if args.clip else "full_sidewalk"
    units["has_sidewalk_data"] = units[count_col] > 0
    units["expanded_buffer_unit"] = units["unit_name"].isin(expanded_units)

    if args.selection_mode == "adaptive":
        units["adaptive_growth_threshold"] = float(args.adaptive_growth_threshold)
        units["adaptive_p90_threshold"] = float(args.adaptive_p90_threshold)

    mean_col = f"{INDEX_FIELD}_mean"
    valid_means = sorted(units.loc[units[count_col] > 0, mean_col].dropna().tolist())
    if valid_means:
        units["p10_threshold"] = quantile_index(valid_means, 0.10)
        units["p90_threshold"] = quantile_index(valid_means, 0.90)
    else:
        units["p10_threshold"] = None
        units["p90_threshold"] = None

    units_web = units.to_crs(WEB_CRS)
    units_web.to_file(OUTPUT_STATS_FILE, driver="GeoJSON")
    stats_size_mb = OUTPUT_STATS_FILE.stat().st_size / (1024 * 1024)
    print(f"   Saved {OUTPUT_STATS_FILE} ({stats_size_mb:.2f} MB)")

    print("\n7) Writing unit detail files...")
    OUTPUT_DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT_DETAIL_DIR.glob("*.geojson"):
        old.unlink()

    detail_cols = available_columns(selected_for_stats.columns, DETAIL_FIELDS)

    created = 0
    total_mb = 0.0
    for _, unit in units.iterrows():
        unit_id = unit["unit_id"]
        unit_name = unit["unit_name"]
        unit_rows = selected_for_stats[selected_for_stats["unit_id"] == unit_id]
        if unit_rows.empty:
            continue

        detail = unit_rows[detail_cols + ["dist_to_green_m", "geometry"]].copy()
        if args.clip:
            # Clip only if explicitly requested. Default policy behavior keeps full polygons.
            detail.geometry = detail.geometry.intersection(green_union)
            detail = detail[detail.geometry.notna() & ~detail.geometry.is_empty]
            if detail.empty:
                continue

        detail["unit_id"] = unit_id
        detail["unit_name"] = unit_name
        detail["admin_level"] = admin_field
        detail["buffer_m"] = base_buffer
        detail["selection_mode"] = args.selection_mode

        detail_web = detail.to_crs(WEB_CRS)
        out_file = OUTPUT_DETAIL_DIR / DETAIL_FILENAME_PATTERN.format(id=unit_id)
        detail_web.to_file(out_file, driver="GeoJSON")
        total_mb += out_file.stat().st_size / (1024 * 1024)
        created += 1

    print(f"   Created {created:,} detail files ({total_mb:.1f} MB total)")

    print(f"\n{'=' * 80}")
    print("DONE")
    print(f"{'=' * 80}")
    print(f"Units total: {len(units):,}")
    print(f"Units with sidewalk data: {int(units['has_sidewalk_data'].sum()):,}")
    print(f"Selected sidewalks: {len(selected):,}")
    print(f"Overview file: {OUTPUT_STATS_FILE}")
    print(f"Line file: {OUTPUT_LINES_FILE}")
    print(f"Detail folder: {OUTPUT_DETAIL_DIR}")


if __name__ == "__main__":
    main()
