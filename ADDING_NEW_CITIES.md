# Adding New Cities to SlimShady

This guide explains how to integrate a new city into the SlimShady multi-city shade analysis website.

## Prerequisites

You need:
1. Sidewalk network data with shade statistics
2. Administrative boundaries (neighborhoods/wards/districts) as GeoJSON
3. Time-series shade data at multiple times of day

## Step 1: Prepare Your Data

### Required Files Structure
```
throwing_shade/results/output/{CITY_ID}/
  └── {CITY_ID}_sidewalks_with_stats_multiple_dates.gpkg
```

Your sidewalk data should include:
- Geometry (LineString features)
- Date-prefixed shade columns: `YYYYMMDD_building_shade_percent_at_HHMM`
- Date-prefixed shade columns: `YYYYMMDD_tree_shade_percent_at_HHMM`
- Time points covering daylight hours (e.g., 08:00-17:00)

### Administrative Boundaries
```
SlimShady/data/{CityName}_boundaries.geojson
```

Should include:
- Polygon geometries
- Unique identifier field (e.g., `DISTRICT_ID`, `WARD_NAME`)
- Name field for display

## Step 2: Create Processing Script

Copy and modify `process_capetown_for_website_v2.py`:

```python
# Key parameters to update:
WARD_BOUNDARIES = BASE_DIR / 'data' / 'YourCity_boundaries.geojson'
SIDEWALKS_WITH_STATS = Path('../throwing_shade/results/output/{CITY_ID}/{CITY_ID}_sidewalks_with_stats_multiple_dates.gpkg')
OUTPUT_WARDS = DATA_DIR / 'yourcity_districts_with_shade_stats.geojson'
OUTPUT_SIDEWALKS = DATA_DIR / 'yourcity_sidewalks_web_minimal.geojson'
DISTRICT_DATA_DIR = DATA_DIR / 'District_data'

# Update field names:
- idField: Your boundary ID field (e.g., 'DISTRICT_ID')
- nameField: Your boundary name field (e.g., 'DISTRICT_NAME')

# Update shade threshold:
threshold = 40  # Choose appropriate threshold for your climate
```

### Key Processing Steps
1. Load boundaries and sidewalks (align CRS!)
2. Spatial join to assign sidewalks to districts
3. Calculate shade availability index
4. Aggregate statistics by district
5. Create 4 combined shade columns (10:00, 13:00, 15:30, 18:00)
6. Sample overview file to ~1,200 features
7. Generate individual district files

### Run Processing
```bash
source ../throwing_shade/.shade_env/bin/activate
python3 process_yourcity_for_website.py
```

## Step 3: Add City Configuration

Edit `map.js` and add to `CITY_CONFIG`:

```javascript
yourcity: {
  name: 'Your City',
  displayName: 'Your City',
  center: [LAT, LNG],  // City center coordinates
  zoom: 11,
  bounds: [[SW_LAT, SW_LNG], [NE_LAT, NE_LNG]],  // Bounding box
  statsFile: 'data/yourcity_districts_with_shade_stats.geojson',
  sidewalksFile: 'data/yourcity_sidewalks_web_minimal.geojson',
  detailFolder: 'data/District_data/',
  detailFilePattern: 'district_{id}.geojson',
  idField: 'DISTRICT_ID',           // Must match your data
  nameField: 'DISTRICT_NAME',       // Must match your data
  indexField: 'shade_availability_index_40',  // Use your threshold
  threshold: 40,                    // Shade percentage threshold
  unit: 'district',
  unitPlural: 'districts',
  description: 'Description of your analysis parameters',
  colorScale: {
    poor: 0.3,        // Adjust based on local conditions
    acceptable: 0.5,
    veryGood: 0.7
  }
},
```

## Step 4: Add to City Selector

Edit `index.html` and add button:

```html
<button class="city-btn" data-city="yourcity">Your City</button>
```

## Step 5: Test

1. Hard refresh browser (Ctrl+Shift+R)
2. Click your city button
3. Verify:
   - Map loads and centers correctly
   - Districts display with colors
   - Click district → detail view loads
   - Tooltips show district names
   - Distribution chart populates
   - "Back to Overview" works

## Data Size Guidelines

Target file sizes:
- **District summary**: ~1-2 MB
- **Sidewalks overview**: ~700 KB - 1 MB (sample to 1,200 features)
- **Individual district files**: 1-3 MB each

If files are too large:
- Reduce number of sidewalk features (sampling)
- Simplify geometries
- Only include essential columns

## Troubleshooting

### "Unknown" in district names
- Check `nameField` matches actual field in your data
- Use browser console to inspect loaded GeoJSON properties

### Map doesn't center correctly
- Verify `center` coordinates are [latitude, longitude]
- Check `bounds` has SW corner first, NE corner second

### No data loads
- Check file paths in config
- Verify files exist in `data/` folder
- Check browser console for 404 errors

### CRS mismatch errors
- Ensure all outputs are in EPSG:4326 (WGS84)
- Processing script converts before saving

### Colors look wrong
- Adjust `colorScale` thresholds for local climate
- Lower thresholds for hotter climates (less shade expected)
- Higher thresholds for cooler climates (more shade expected)

## File Naming Conventions

- Use lowercase with underscores: `yourcity_stats.geojson`
- District files: `district_{id}.geojson` where `{id}` is the unique identifier
- Keep consistent with `detailFilePattern` in config

## Example: Cape Town vs Amsterdam

| Aspect | Amsterdam | Cape Town |
|--------|-----------|-----------|
| Threshold | 30% | 50% |
| Unit | neighborhood (buurt) | ward |
| ID Field | Buurtcode | WARD_NAME |
| Name Field | Buurt | WARD_NAME |
| Color Scale | 0.5, 0.7, 0.9 | 0.3, 0.5, 0.7 |

Cape Town uses higher threshold (50%) because of stronger sun requiring more shade.

## Questions?

Review these files:
- `process_capetown_for_website_v2.py` - Complete processing example
- `map.js` lines 1-100 - CITY_CONFIG examples
- `index.html` - City selector buttons

