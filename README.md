# SlimShady - Amsterdam Shade Analysis

Interactive web map visualizing sidewalk shade availability across Amsterdam neighborhoods.

## 🌳 Features

- **Interactive Landing Page**: Animated sun rays demonstrating shade concepts
- **Two-Tier Data Loading**: Fast overview + detailed neighborhood views
- **Dark Mode Design**: SCL-themed interface optimized for visibility
- **Mobile Responsive**: Works across all device types

## 🗺️ How to Use

1. **Landing Page**: Visit the site to see the animated sun ray demo
2. **Overview Map**: Click "Explore the Map" to see Amsterdam-wide data
3. **Neighborhood Details**: Click any neighborhood boundary for detailed data
4. **Navigation**: Use "Back to Overview" to return to city view

## 📊 Data

- **Main Dataset**: 1,200 strategically sampled sidewalks (0.69 MB)
- **Neighborhood Data**: 512 detailed buurt files with full attributes
- **Groene Straten View**: Buffered green-street analysis aggregated to administrative units
- **Shade Index**: Values from 0.0 (no shade) to 1.0 (full shade)

### Groene Straten Processing

To build the Amsterdam Groene Straten administrative view:

```bash
source ../throwing_shade/.shade_env/bin/activate
python3 process_groene_straten_for_website.py
```

Outputs:
- `data/groene_straten_with_shade_stats.geojson` (overview administrative units)
- `data/GroeneStraat_data/groene_straat_{id}.geojson` (detail sidewalks per unit)
- `data/groene_straten_lines.geojson` (Groene Straten centerline overlay for map guidance)

Defaults:
- `--buffer-meters 15`
- `--admin-level gebied`
- `--selection-mode adaptive` with a controlled outskirts expansion:
  base 15m citywide + adaptive up to 22.5m only in wide-road units
- Full sidewalk geometry (no clipping), selected by buffer intersection logic

Useful options:
- `--admin-level stadsdeel` for a coarser overview
- `--selection-mode fixed` to disable adaptive outskirts expansion
- `--adaptive-force-unit \"IJburg, Zeeburgereiland\"` to force expansion for specific units
- `--clip` if you explicitly want clipped geometry instead of full sidewalk segments

## 🔧 Technical Details

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Mapping**: Leaflet.js with coordinate transformation (Proj4)
- **Data Format**: GeoJSON with Dutch RD → WGS84 transformation
- **Performance**: Geometry simplification and strategic data sampling


## Data Quality Notice

### Amsterdam
- **Source**: Actueel Hoogtebestand Nederland (AHN) LiDAR data
- **Resolution**: High-resolution 3D point cloud (8-10 points/m²)
- **Sidewalks**: Authoritative municipal dataset
- **Accuracy**: High confidence in tree detection and canopy segmentation

### Cape Town (Experimental)
- **Source**: Google Solar API
- **Resolution**: Lower spatial resolution
- **Sidewalks**: Derived from OpenStreetMap graph networks (non-authoritative)
- **Accuracy**: Reduced accuracy in tree detection and segmentation
- **Status**: Preliminary research data - interpret with caution

Direct comparison between cities should account for these methodological differences.
