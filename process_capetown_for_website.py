#!/usr/bin/env python3
"""
Process Cape Town shade data for website display.
Includes time-series shade data (February 2024 only).
"""
import geopandas as gpd
import pandas as pd
from pathlib import Path
import numpy as np

# Paths
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
OUTPUT_WARDS = DATA_DIR / 'wards_with_shade_stats.geojson'
OUTPUT_SIDEWALKS = DATA_DIR / 'capetown_sidewalks_web_minimal.geojson'
WARD_DATA_DIR = DATA_DIR / 'Ward_data'

# Input files
WARD_BOUNDARIES = BASE_DIR / 'data' / 'Wards.geojson'
SIDEWALKS_WITH_STATS = Path('../throwing_shade/results/output/79604/79604_sidewalks_with_stats_multiple_dates.gpkg')

print("="*80)
print("PROCESSING CAPE TOWN DATA FOR WEBSITE (WITH TIME-SERIES)")
print("="*80)

# Load data
print("\n1. Loading Cape Town ward boundaries...")
wards = gpd.read_file(WARD_BOUNDARIES)
print(f"   ✓ Loaded {len(wards)} wards")
print(f"   Ward CRS: {wards.crs}")

print("\n2. Loading sidewalk segments with shade statistics...")
print("   (This will take a few minutes with pyogrio...)")
sidewalks = gpd.read_file(SIDEWALKS_WITH_STATS, engine='pyogrio')
print(f"   ✓ Loaded {len(sidewalks):,} sidewalk segments")
print(f"   Sidewalk CRS: {sidewalks.crs}")

# Align CRS if needed
if wards.crs != sidewalks.crs:
    print(f"\n3. Aligning CRS...")
    print(f"   Converting wards from {wards.crs} to {sidewalks.crs}")
    wards = wards.to_crs(sidewalks.crs)
    print(f"   ✓ CRS aligned")
else:
    print(f"\n3. CRS already aligned: {wards.crs}")

# Spatial join to assign wards to sidewalks
print("\n4. Performing spatial join (sidewalks -> wards)...")
sidewalks_with_wards = gpd.sjoin(sidewalks, wards[['WARD_NAME', 'geometry']], how='left', predicate='intersects')
if 'index_right' in sidewalks_with_wards.columns:
    sidewalks_with_wards = sidewalks_with_wards.drop(columns=['index_right'])

segments_with_ward = sidewalks_with_wards['WARD_NAME'].notna().sum()
print(f"   ✓ Assigned {segments_with_ward:,} segments to wards ({segments_with_ward/len(sidewalks)*100:.1f}%)")

# Calculate shade availability index (50% threshold, 8am-5pm)
print("\n5. Calculating shade availability index (50% threshold)...")
daylight_times = [f'0{h:02d}00' if h < 10 else f'{h:02d}00' for h in range(8, 17)]

# Use February 2024 data
date_prefix = '20240215'
building_cols = [f'{date_prefix}_building_shade_percent_at_{t}' for t in daylight_times]
tree_cols = [f'{date_prefix}_tree_shade_percent_at_{t}' for t in daylight_times]

# Calculate combined shade (max of building and tree)
shade_availability = []
for _, row in sidewalks_with_wards.iterrows():
    building_vals = [row.get(col) for col in building_cols]
    tree_vals = [row.get(col) for col in tree_cols]
    
    # Combine building and tree (take max at each time)
    combined = []
    for b, t in zip(building_vals, tree_vals):
        if pd.notna(b) and pd.notna(t):
            combined.append(max(b, t))
        elif pd.notna(b):
            combined.append(b)
        elif pd.notna(t):
            combined.append(t)
    
    if combined:
        # Fraction of times with shade >= 50%
        above_threshold = sum(1 for v in combined if v >= 50) / len(combined)
        shade_availability.append(above_threshold)
    else:
        shade_availability.append(np.nan)

sidewalks_with_wards['shade_availability_index_50'] = shade_availability
valid_indices = sidewalks_with_wards['shade_availability_index_50'].notna().sum()
print(f"   ✓ Calculated index for {valid_indices:,} segments")

# Aggregate by ward
print("\n6. Aggregating statistics by ward...")
ward_stats = sidewalks_with_wards.groupby('WARD_NAME').agg({
    'shade_availability_index_50': ['mean', 'std', 'count']
}).reset_index()

ward_stats.columns = ['WARD_NAME', 'shade_availability_index_50_mean', 
                      'shade_availability_index_50_std', 'shade_availability_index_50_count']

# Calculate coverage metrics
coverage_stats = sidewalks_with_wards[sidewalks_with_wards['shade_availability_index_50'].notna()].groupby('WARD_NAME').apply(
    lambda x: pd.Series({
        'coverage_poor': (x['shade_availability_index_50'] < 0.3).sum() / len(x) * 100,
        'coverage_acceptable': ((x['shade_availability_index_50'] >= 0.3) & (x['shade_availability_index_50'] < 0.5)).sum() / len(x) * 100,
        'coverage_good': ((x['shade_availability_index_50'] >= 0.5) & (x['shade_availability_index_50'] < 0.7)).sum() / len(x) * 100,
        'coverage_excellent': (x['shade_availability_index_50'] >= 0.7).sum() / len(x) * 100
    })
).reset_index()

ward_stats = ward_stats.merge(coverage_stats, on='WARD_NAME', how='left')
print(f"   ✓ Aggregated {len(ward_stats)} wards")

# Merge with ward geometries
wards_with_stats = wards.merge(ward_stats, on='WARD_NAME', how='left')

# Convert back to WGS84 for web display
print("\n7. Converting to WGS84 (EPSG:4326) for web...")
wards_with_stats = wards_with_stats.to_crs('EPSG:4326')
sidewalks_web = sidewalks_with_wards.to_crs('EPSG:4326')
print(f"   ✓ Converted to WGS84")

# Save ward statistics
print(f"\n8. Saving ward statistics to {OUTPUT_WARDS}...")
wards_with_stats.to_file(OUTPUT_WARDS, driver='GeoJSON')
file_size = OUTPUT_WARDS.stat().st_size / (1024 * 1024)
print(f"   ✓ Saved {len(wards_with_stats)} wards ({file_size:.1f}MB)")

# Prepare sidewalk data for web (minimal like Amsterdam)
print(f"\n9. Preparing sidewalk data for web...")

# Only include 4 key time points like Amsterdam (10:00, 13:00, 15:30, 18:00)
# Combine building and tree shade (max)
key_times = ['1000', '1300', '1530', '1800']
for time in key_times:
    building_col = f'20240215_building_shade_percent_at_{time}'
    tree_col = f'20240215_tree_shade_percent_at_{time}'
    combined_col = f'shade_percent_at_{time}'
    
    if building_col in sidewalks_web.columns and tree_col in sidewalks_web.columns:
        sidewalks_web[combined_col] = sidewalks_web[[building_col, tree_col]].max(axis=1)
    elif building_col in sidewalks_web.columns:
        sidewalks_web[combined_col] = sidewalks_web[building_col]
    elif tree_col in sidewalks_web.columns:
        sidewalks_web[combined_col] = sidewalks_web[tree_col]

print(f"   Created 4 combined shade columns for key times")

# Minimal columns for overview file (like Amsterdam: just index + GUID equivalent)
overview_cols = ['WARD_NAME', 'shade_availability_index_50'] + [f'shade_percent_at_{t}' for t in key_times]
available_cols = [col for col in overview_cols if col in sidewalks_web.columns]

# Sample heavily to keep file size reasonable (~1-2MB like Amsterdam's 670KB)
target_features = 1200
if len(sidewalks_web) > target_features:
    sampled = sidewalks_web.sample(n=target_features, random_state=42)
    sidewalks_minimal = gpd.GeoDataFrame(sampled[available_cols], geometry=sampled.geometry, crs=sidewalks_web.crs)
    print(f"   Sampled {target_features:,} features for overview file")
else:
    sidewalks_minimal = gpd.GeoDataFrame(sidewalks_web[available_cols], geometry=sidewalks_web.geometry, crs=sidewalks_web.crs)
    print(f"   Using all {len(sidewalks_minimal):,} features")

sidewalks_minimal.to_file(OUTPUT_SIDEWALKS, driver='GeoJSON')
file_size = OUTPUT_SIDEWALKS.stat().st_size / (1024 * 1024)
print(f"   ✓ Saved {len(sidewalks_minimal):,} sidewalk features ({file_size:.1f}MB)")

# Create individual ward files
print(f"\n10. Creating individual ward files in {WARD_DATA_DIR}/...")
WARD_DATA_DIR.mkdir(exist_ok=True)

# Clear existing ward files
for f in WARD_DATA_DIR.glob("ward_*.geojson"):
    if 'test' not in f.name and 'enriched' not in f.name:
        f.unlink()

# Prepare combined shade columns for ward files
for time in key_times:
    building_col = f'20240215_building_shade_percent_at_{time}'
    tree_col = f'20240215_tree_shade_percent_at_{time}'
    combined_col = f'shade_percent_at_{time}'
    
    if building_col in sidewalks_with_wards.columns and tree_col in sidewalks_with_wards.columns:
        sidewalks_with_wards[combined_col] = sidewalks_with_wards[[building_col, tree_col]].max(axis=1)

ward_cols = ['WARD_NAME', 'shade_availability_index_50'] + [f'shade_percent_at_{t}' for t in key_times]
ward_available_cols = [col for col in ward_cols if col in sidewalks_with_wards.columns]

created_files = 0
total_size = 0
for ward_name, group in sidewalks_with_wards.groupby('WARD_NAME'):
    if pd.isna(ward_name):
        continue
    
    ward_file = WARD_DATA_DIR / f"ward_{ward_name}.geojson"
    
    # Convert to WGS84 and select minimal columns
    ward_data = gpd.GeoDataFrame(group[ward_available_cols], geometry=group.geometry, crs=sidewalks_with_wards.crs).to_crs('EPSG:4326')
    ward_data.to_file(ward_file, driver='GeoJSON')
    
    file_size = ward_file.stat().st_size / (1024 * 1024)
    total_size += file_size
    created_files += 1
    
    if created_files % 10 == 0:
        print(f"   Processed {created_files} wards...")

print(f"   ✓ Created {created_files} ward files (Total: {total_size:.1f}MB)")

# Summary
print(f"\n{'='*80}")
print("✅ PROCESSING COMPLETE")
print(f"{'='*80}")
print(f"\nSummary:")
print(f"  - Ward boundaries: {len(wards_with_stats)} wards")
print(f"  - Sidewalk segments: {len(sidewalks):,} total, {valid_indices:,} with shade data")
print(f"  - Individual ward files: {created_files} files ({total_size:.1f}MB)")
print(f"  - Time-series data: {len(feb_shade_cols)} February 2024 shade columns")
print(f"\nOutput files:")
print(f"  - {OUTPUT_WARDS}")
print(f"  - {OUTPUT_SIDEWALKS}")
print(f"  - {WARD_DATA_DIR}/*.geojson")
