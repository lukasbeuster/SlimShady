#!/usr/bin/env python3
"""
fetch_pois.py
Amsterdam Shade Intelligence — POI Fetch
Fetch POI data for target neighbourhoods and write to data/euroasis/.

Usage:
    pip install requests
    python scripts/fetch_pois.py

Outputs:
    data/euroasis/k_buurten_pois.geojson
    data/euroasis/jan_maijenbuurt_pois.geojson
    data/euroasis/vogelbuurt_pois.geojson
"""

import json
import os
import time
import requests

# ── Output directory ─────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'euroasis')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Neighbourhood bounding boxes ─────────────────────────────
# Derived from the actual polygon extents + a small buffer.
# Format: [south, west, north, east]

NEIGHBORHOODS = {
    'k_buurten': {
        'label': 'K-Buurten',
        'bbox': [52.290, 4.980, 52.320, 5.030],
    },
    'jan_maijenbuurt': {
        'label': 'Jan Maijenbuurt',
        'bbox': [52.365, 4.850, 52.385, 4.880],
    },
    'vogelbuurt': {
        'label': 'Vogelbuurt',
        'bbox': [52.385, 4.905, 52.410, 4.940],
    },
}

# ── OSM query tags → internal type ───────────────────────────

QUERIES = [
    {
        'type': 'bus_stop',
        'dwell': 'high',
        'overpass_filter': '["highway"="bus_stop"]',
    },
    {
        'type': 'bus_stop',
        'dwell': 'high',
        'overpass_filter': '["amenity"="bus_stop"]',
    },
    {
        'type': 'school',
        'dwell': 'high',
        'overpass_filter': '["amenity"="school"]',
    },
    {
        'type': 'playground',
        'dwell': 'medium',
        'overpass_filter': '["leisure"="playground"]',
    },
    {
        'type': 'community_centre',
        'dwell': 'high',
        'overpass_filter': '["amenity"="community_centre"]',
    },
    {
        'type': 'health_centre',
        'dwell': 'medium',
        'overpass_filter': '["amenity"="doctors"]',
    },
    {
        'type': 'health_centre',
        'dwell': 'medium',
        'overpass_filter': '["amenity"="clinic"]',
    },
    {
        'type': 'market',
        'dwell': 'medium',
        'overpass_filter': '["amenity"="marketplace"]',
    },
]

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'


def build_overpass_query(bbox, filters):
    """Build a single Overpass QL query for a bounding box and multiple filter strings."""
    s, w, n, e = bbox
    bbox_str = f'{s},{w},{n},{e}'
    parts = []
    for f in filters:
        parts.append(f'node{f}({bbox_str});')
        parts.append(f'way{f}({bbox_str});')
        parts.append(f'relation{f}({bbox_str});')
    body = '\n  '.join(parts)
    return f'[out:json][timeout:90];\n(\n  {body}\n);\nout center;'


def fetch_overpass(query, retries=4):
    """POST an Overpass query and return parsed JSON, with retry on 429/504."""
    for attempt in range(retries):
        try:
            resp = requests.post(OVERPASS_URL, data={'data': query}, timeout=120)
            if resp.status_code in (429, 504):
                wait = 10 * (attempt + 1)
                print(f'    [{resp.status_code}] Retrying in {wait}s (attempt {attempt+1}/{retries})...', end=' ', flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout:
            wait = 10 * (attempt + 1)
            print(f'    [Timeout] Retrying in {wait}s (attempt {attempt+1}/{retries})...', end=' ', flush=True)
            time.sleep(wait)
    raise RuntimeError(f'Failed after {retries} attempts')


def element_to_point(el):
    """Extract lat/lon from a node or way/relation (via center)."""
    if el['type'] == 'node':
        return el.get('lat'), el.get('lon')
    center = el.get('center', {})
    return center.get('lat'), center.get('lon')



def fetch_neighbourhood_pois(nh_id, nh_config):
    """Fetch all POI types for a neighbourhood in a single batched Overpass query."""
    bbox = nh_config['bbox']

    # Build a single query with all filters
    all_filters = [q['overpass_filter'] for q in QUERIES]
    query = build_overpass_query(bbox, all_filters)

    print(f'  Querying all POI types for {nh_config["label"]} (single request)...', end=' ', flush=True)
    try:
        result = fetch_overpass(query)
    except Exception as exc:
        print(f'ERROR: {exc}')
        return {'type': 'FeatureCollection', 'features': []}, {}

    elements = result.get('elements', [])
    print(f'{len(elements)} raw elements')

    # Map each element to a type using its OSM tags
    tag_to_type = {
        ('highway', 'bus_stop'):        ('bus_stop',         'high'),
        ('amenity', 'bus_stop'):        ('bus_stop',         'high'),
        ('amenity', 'school'):          ('school',           'high'),
        ('leisure', 'playground'):      ('playground',       'medium'),
        ('amenity', 'community_centre'):('community_centre', 'high'),
        ('amenity', 'doctors'):         ('health_centre',    'medium'),
        ('amenity', 'clinic'):          ('health_centre',    'medium'),
        ('amenity', 'marketplace'):     ('market',           'medium'),
    }

    all_features = []
    counts = {}
    seen_ids = set()

    for el in elements:
        eid = f"{el['type']}/{el['id']}"
        if eid in seen_ids:
            continue
        seen_ids.add(eid)

        lat, lon = element_to_point(el)
        if lat is None or lon is None:
            continue

        tags = el.get('tags', {})
        poi_type, dwell = None, None
        for (tag_key, tag_val), (t, d) in tag_to_type.items():
            if tags.get(tag_key) == tag_val:
                poi_type, dwell = t, d
                break
        if poi_type is None:
            continue

        name = (
            tags.get('name')
            or tags.get('name:en')
            or tags.get('ref')
            or 'unnamed'
        )

        all_features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'properties': {
                'name':            name,
                'type':            poi_type,
                'dwell_potential': dwell,
                'osm_id':          el.get('id'),
                'osm_type':        el.get('type'),
            },
        })
        counts[poi_type] = counts.get(poi_type, 0) + 1

    return {'type': 'FeatureCollection', 'features': all_features}, counts


def main():
    print('POI Fetch — Amsterdam Shade Intelligence')
    print('=' * 50)

    summary = {}

    for nh_id, nh_config in NEIGHBORHOODS.items():
        print(f'\n[{nh_config["label"]}]')
        fc, counts = fetch_neighbourhood_pois(nh_id, nh_config)

        out_path = os.path.join(OUT_DIR, f'{nh_id}_pois.geojson')
        with open(out_path, 'w', encoding='utf-8') as fh:
            json.dump(fc, fh, ensure_ascii=False, indent=2)

        total = len(fc['features'])
        print(f'  → Wrote {total} features to {out_path}')
        summary[nh_config['label']] = {'total': total, 'by_type': counts}

    print('\n' + '=' * 50)
    print('Summary:')
    for nh_label, data in summary.items():
        print(f'  {nh_label}: {data["total"]} total')
        for t, n in data['by_type'].items():
            if n > 0:
                print(f'    {t}: {n}')

    print('\nDone. Commit data/euroasis/ to the repo to enable the POI layer.')


if __name__ == '__main__':
    main()
