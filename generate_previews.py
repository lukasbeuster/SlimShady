#!/usr/bin/env python
# Generate static SVG previews for overview and a sample neighborhood
# Uses only Python stdlib; reads GeoJSON from data/

import json
import os
import math

WIDTH, HEIGHT = 1200, 750
PADDING = 20

# Colors consistent with map.js
SCL_GREEN = '#95C11F'
SCL_DARK_GREEN = '#5B7026'
SCL_GRAY = '#6E6E6E'
SCL_TEAL = '#4FA3B6'

# Palette definitions
PALETTE_A = {
    'poor': '#D9A441',     # amber
    'ok':   '#4FA3B6',     # teal
    'good': SCL_GREEN,     # SCL green
    'best': SCL_DARK_GREEN # dark green
}

PALETTE_B = {
    'poor': '#C89D3D',     # muted gold
    'ok':   '#6E78B7',     # slate blue
    'good': SCL_GREEN,
    'best': '#4C5F1D'      # deeper olive
}

def get_shade_color(val, palette=PALETTE_A):
    if val is None:
        return '#666666'
    if val < 0.5:
        return palette['poor']
    if val < 0.7:
        return palette['ok']
    if val < 0.9:
        return palette['good']
    return palette['best']

def iter_coords(geom):
    t = geom['type']
    c = geom['coordinates']
    if t == 'Polygon':
        for ring in c:
            for x, y in ring:
                yield x, y
    elif t == 'MultiPolygon':
        for poly in c:
            for ring in poly:
                for x, y in ring:
                    yield x, y
    elif t == 'LineString':
        for x, y in c:
            yield x, y
    elif t == 'MultiLineString':
        for line in c:
            for x, y in line:
                yield x, y

def project_builder(bounds, lat_avg=None):
    minx, miny, maxx, maxy = bounds
    # Approximate Web Mercator horizontal scaling using cos(latitude)
    kx = 1.0
    if lat_avg is not None:
        try:
            kx = math.cos(lat_avg * math.pi / 180.0)
        except Exception:
            kx = 1.0
    # Expand bounds slightly to avoid edge clipping
    dx = maxx - minx
    dy = maxy - miny
    if dx == 0:
        dx = 1e-6
    if dy == 0:
        dy = 1e-6
    inner_w = WIDTH - 2 * PADDING
    inner_h = HEIGHT - 2 * PADDING
    # Apply horizontal scale factor for longitude
    sdx = dx * kx
    sx = inner_w / sdx if sdx != 0 else inner_w
    sy = inner_h / dy
    s = min(sx, sy)
    offset_x = PADDING + (inner_w - s * sdx) / 2.0
    offset_y = PADDING + (inner_h - s * dy) / 2.0

    def proj(pt):
        x, y = pt
        px = offset_x + ((x - minx) * kx) * s
        py = HEIGHT - (offset_y + (y - miny) * s)  # invert y for SVG
        return px, py

    return proj

def svg_header():
    return ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet">' % (WIDTH, HEIGHT, WIDTH, HEIGHT),
            '<rect width="100%" height="100%" fill="#0a0a0a"/>']

def svg_footer():
    return ['</svg>']

def path_from_rings(rings, proj):
    # Build a single path with evenodd fill to support holes
    d = []
    for ring in rings:
        for i, (x, y) in enumerate(ring):
            px, py = proj((x, y))
            cmd = 'M' if i == 0 else 'L'
            d.append('%s%.2f,%.2f' % (cmd, px, py))
        d.append('Z')
    return ' '.join(d)

def overview_svg(in_path, out_path, palette=PALETTE_A):
    with open(in_path, 'r') as f:
        data = json.load(f)
    # compute bounds
    xs, ys = [], []
    for feat in data['features']:
        for x, y in iter_coords(feat['geometry']):
            xs.append(x); ys.append(y)
    lat_avg = sum(ys) / float(len(ys)) if ys else 0.0
    bounds = (min(xs), min(ys), max(xs), max(ys))
    proj = project_builder(bounds, lat_avg)

    parts = svg_header()
    # draw polygons
    for feat in data['features']:
        geom = feat['geometry']
        props = feat.get('properties', {})
        mean_val = props.get('shade_availability_index_30_mean', 0)
        fill = get_shade_color(mean_val, palette)
        if geom['type'] == 'Polygon':
            rings = geom['coordinates']
            d = path_from_rings(rings, proj)
            parts.append('<path d="%s" fill="%s" fill-opacity="0.6" stroke="#333333" stroke-opacity="0.8" stroke-width="0.6" fill-rule="evenodd"/>' % (d, fill))
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                d = path_from_rings(poly, proj)
                parts.append('<path d="%s" fill="%s" fill-opacity="0.6" stroke="#333333" stroke-opacity="0.8" stroke-width="0.6" fill-rule="evenodd"/>' % (d, fill))

    parts.extend(svg_footer())
    with open(out_path, 'w') as f:
        f.write('\n'.join(parts))

def neighborhood_svg(buurt_file, out_path, palette=PALETTE_A):
    with open(buurt_file, 'r') as f:
        data = json.load(f)
    # bounds from lines
    xs, ys = [], []
    for feat in data['features']:
        for x, y in iter_coords(feat['geometry']):
            xs.append(x); ys.append(y)
    lat_avg = sum(ys) / float(len(ys)) if ys else 0.0
    bounds = (min(xs), min(ys), max(xs), max(ys))
    proj = project_builder(bounds, lat_avg)

    parts = svg_header()
    # optional faint background grid of neighborhood bbox
    # draw sidewalks (polygons or lines)
    for feat in data['features']:
        geom = feat['geometry']
        props = feat.get('properties', {})
        val = props.get('shade_availability_index_30', None)
        color = get_shade_color(val, palette)
        if geom['type'] == 'Polygon':
            d = path_from_rings(geom['coordinates'], proj)
            parts.append('<path d="%s" fill="%s" fill-opacity="0.7" stroke="#222222" stroke-width="0.6" stroke-opacity="0.9" fill-rule="evenodd"/>' % (d, color))
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                d = path_from_rings(poly, proj)
                parts.append('<path d="%s" fill="%s" fill-opacity="0.7" stroke="#222222" stroke-width="0.6" stroke-opacity="0.9" fill-rule="evenodd"/>' % (d, color))
        elif geom['type'] == 'LineString':
            pts = [proj(p) for p in geom['coordinates']]
            if not pts:
                continue
            d = ' '.join(['M%.2f,%.2f' % pts[0]] + ['L%.2f,%.2f' % p for p in pts[1:]])
            parts.append('<path d="%s" stroke="%s" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-opacity="0.9"/>' % (d, color))
        elif geom['type'] == 'MultiLineString':
            for line in geom['coordinates']:
                pts = [proj(p) for p in line]
                if not pts:
                    continue
                d = ' '.join(['M%.2f,%.2f' % pts[0]] + ['L%.2f,%.2f' % p for p in pts[1:]])
                parts.append('<path d="%s" stroke="%s" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-opacity="0.9"/>' % (d, color))

    parts.extend(svg_footer())
    with open(out_path, 'w') as f:
        f.write('\n'.join(parts))

def main():
    base = os.path.dirname(__file__)
    data_dir = os.path.join(base, 'data')
    overview_in = os.path.join(data_dir, 'neighborhoods_with_shade_stats.geojson')
    overview_out = os.path.join(data_dir, 'overview_preview.svg')
    # pick buurt with max segment count
    with open(overview_in, 'r') as f:
        neigh = json.load(f)
    features = [f for f in neigh['features'] if f['properties'].get('shade_availability_index_30_count')]
    best = max(features, key=lambda f: f['properties']['shade_availability_index_30_count'])
    code = best['properties'].get('Buurtcode') or best['properties'].get('CBS_Buurtcode')
    buurt_in = os.path.join(data_dir, 'Buurt_data', '%s_sidewalks.geojson' % code)
    buurt_out = os.path.join(data_dir, 'neighborhood_preview.svg')

    # Default current palette (A) for backwards compatibility
    overview_svg(overview_in, overview_out, PALETTE_A)
    neighborhood_svg(buurt_in, buurt_out, PALETTE_A)
    print('Wrote:', overview_out)
    print('Wrote:', buurt_out)

    # Also write explicit A/B variants for comparison
    overview_out_a = os.path.join(data_dir, 'overview_preview_A.svg')
    neigh_out_a = os.path.join(data_dir, 'neighborhood_preview_A.svg')
    overview_out_b = os.path.join(data_dir, 'overview_preview_B.svg')
    neigh_out_b = os.path.join(data_dir, 'neighborhood_preview_B.svg')

    overview_svg(overview_in, overview_out_a, PALETTE_A)
    neighborhood_svg(buurt_in, neigh_out_a, PALETTE_A)
    overview_svg(overview_in, overview_out_b, PALETTE_B)
    neighborhood_svg(buurt_in, neigh_out_b, PALETTE_B)

    print('Wrote:', overview_out_a)
    print('Wrote:', neigh_out_a)
    print('Wrote:', overview_out_b)
    print('Wrote:', neigh_out_b)

if __name__ == '__main__':
    main()
