#!/usr/bin/env python3
"""
Convert all data to WGS84 and create larger main dataset
"""

import geopandas as gpd
import pandas as pd
import numpy as np
import os
from pathlib import Path

def main():
    print("Converting data to WGS84 and creating larger main dataset...")
    
    # Load the original data from the other project
    source_path = "../Shady_politics/results/output/sidewalks_sai_filtered.gpkg"
    if not os.path.exists(source_path):
        print(f"Error: Source file not found: {source_path}")
        return
    
    print("Loading original sidewalks data...")
    sidewalks = gpd.read_file(source_path)
    print(f"Loaded {len(sidewalks)} sidewalk records")
    print(f"Original CRS: {sidewalks.crs}")
    
    # Convert to WGS84
    print("Converting to WGS84...")
    sidewalks_wgs84 = sidewalks.to_crs("EPSG:4326")
    print(f"Converted CRS: {sidewalks_wgs84.crs}")
    
    # Clean dataset with essential columns
    essential_columns = [
        'Gebruiksfunctie', 'Jaar_van_aanleg', 'Jaar_laatste_conservering',
        'Jaar_uitgevoerd_onderhoud', 'Guid', 'shade_availability_index_30',
        'shade_availability_index_40', 'shade_availability_index_50',
        'shade_percent_at_1000', 'shade_percent_at_1300', 
        'shade_percent_at_1530', 'shade_percent_at_1800', 'geometry'
    ]
    
    available_columns = [col for col in essential_columns if col in sidewalks_wgs84.columns]
    sidewalks_clean = sidewalks_wgs84[available_columns].copy()
    
    # Round float columns
    float_columns = ['shade_availability_index_30', 'shade_availability_index_40', 
                    'shade_availability_index_50', 'shade_percent_at_1000',
                    'shade_percent_at_1300', 'shade_percent_at_1530', 'shade_percent_at_1800']
    
    for col in float_columns:
        if col in sidewalks_clean.columns:
            sidewalks_clean[col] = sidewalks_clean[col].round(2)
    
    print(f"Cleaned dataset: {len(available_columns)} columns")
    
    # Analyze distribution for larger main dataset
    shade_col = 'shade_availability_index_30'
    total_records = len(sidewalks_clean)
    
    extreme_low = sidewalks_clean[sidewalks_clean[shade_col] == 0.0]
    extreme_high = sidewalks_clean[sidewalks_clean[shade_col] == 1.0]
    non_extreme = sidewalks_clean[(sidewalks_clean[shade_col] > 0.0) & (sidewalks_clean[shade_col] < 1.0)]
    
    print(f"\nDistribution analysis:")
    print(f"Records with 0.0 shade: {len(extreme_low)} ({len(extreme_low)/total_records*100:.1f}%)")
    print(f"Records with 1.0 shade: {len(extreme_high)} ({len(extreme_high)/total_records*100:.1f}%)")
    print(f"Records with middle values: {len(non_extreme)} ({len(non_extreme)/total_records*100:.1f}%)")
    
    # Create larger main dataset - aim for 3-5k records instead of 1.2k
    # Conservative increase while keeping file size manageable
    target_sizes = [
        (1000, 1000, 1000),  # 3k total
        (1500, 1500, 1500),  # 4.5k total
        (2000, 2000, 2000),  # 6k total
    ]
    
    for low_n, high_n, mid_n in target_sizes:
        print(f"\n--- Testing {low_n} low + {high_n} high + {mid_n} middle = {low_n + high_n + mid_n} total ---")
        
        # Sample from each group
        sampled_low = extreme_low.sample(n=min(low_n, len(extreme_low)), random_state=42)
        sampled_high = extreme_high.sample(n=min(high_n, len(extreme_high)), random_state=42)
        sampled_middle = non_extreme.sample(n=min(mid_n, len(non_extreme)), random_state=42)
        
        # For main dataset, use minimal columns
        minimal_columns = ['Guid', 'shade_availability_index_30', 'geometry']
        
        main_data = pd.concat([
            sampled_low[minimal_columns],
            sampled_high[minimal_columns], 
            sampled_middle[minimal_columns]
        ])
        
        print(f"Main dataset samples: {len(sampled_low)} + {len(sampled_high)} + {len(sampled_middle)} = {len(main_data)}")
        
        # Test file size
        temp_file = f"temp_main_{len(main_data)}.geojson"
        main_data.to_file(temp_file, driver='GeoJSON')
        
        file_size = os.path.getsize(temp_file) / (1024 * 1024)
        print(f"File size: {file_size:.2f} MB")
        
        if file_size <= 3:  # Conservative 3MB limit
            print("✓ Good size! Saving as main dataset")
            main_data.to_file("data/sidewalks_web_minimal.geojson", driver='GeoJSON')
            os.remove(temp_file)
            break
        elif file_size <= 5:  # Acceptable but warn
            print("✓ Acceptable size, saving")
            main_data.to_file("data/sidewalks_web_minimal.geojson", driver='GeoJSON')
            os.remove(temp_file)
            break
        else:
            print("✗ Too large, trying smaller")
            os.remove(temp_file)
    
    print(f"\n=== Re-creating Buurt Files in WGS84 ===")
    
    # Load buurt boundaries
    buurt_path = "data/geojson_lnglat.json"
    if not os.path.exists(buurt_path):
        print(f"Error: Buurt file not found: {buurt_path}")
        return
        
    buurten = gpd.read_file(buurt_path)
    print(f"Loaded {len(buurten)} buurt boundaries")
    
    # Clean up old buurt data
    buurt_dir = Path("data/Buurt_data")
    if buurt_dir.exists():
        import shutil
        shutil.rmtree(buurt_dir)
    buurt_dir.mkdir(exist_ok=True)
    
    # Create spatial index for faster processing
    sidewalks_sindex = sidewalks_clean.sindex
    
    print("Creating new buurt intersection files...")
    successful = 0
    
    for idx, buurt in buurten.iterrows():
        try:
            buurtcode = buurt.get('Buurtcode', buurt.get('CBS_Buurtcode', f'buurt_{idx}'))
            buurt_name = buurt.get('Buurt', 'Unknown')
            
            if idx % 50 == 0:  # Progress indicator
                print(f"Processing buurt {idx+1}/{len(buurten)}: {buurtcode}")
            
            # Use spatial index for pre-filtering
            possible_matches_index = list(sidewalks_sindex.intersection(buurt.geometry.bounds))
            if not possible_matches_index:
                continue
                
            possible_matches = sidewalks_clean.iloc[possible_matches_index]
            
            # Perform intersection
            buurt_geom = gpd.GeoDataFrame([buurt], crs=buurten.crs)
            intersected = gpd.overlay(possible_matches, buurt_geom, how='intersection', keep_geom_type=False)
            
            if len(intersected) > 0:
                # Save with WGS84 coordinates
                output_file = buurt_dir / f"{buurtcode}_sidewalks.geojson"
                intersected.to_file(output_file, driver='GeoJSON')
                successful += 1
                
        except Exception as e:
            print(f"  Error processing {buurtcode}: {e}")
    
    print(f"\n✓ Successfully created {successful} buurt files in WGS84")
    
    # Final summary
    main_file = "data/sidewalks_web_minimal.geojson"
    if os.path.exists(main_file):
        main_size = os.path.getsize(main_file) / (1024 * 1024)
        main_data_check = gpd.read_file(main_file)
        print(f"✓ Main dataset: {main_size:.2f} MB ({len(main_data_check)} records)")
    
    total_buurt_size = sum(f.stat().st_size for f in buurt_dir.glob("*.geojson")) / (1024 * 1024)
    buurt_count = len(list(buurt_dir.glob("*.geojson")))
    print(f"✓ Buurt files: {buurt_count} files, {total_buurt_size:.2f} MB total")
    print(f"✓ All data now in WGS84 format - ready for deployment!")

if __name__ == "__main__":
    main()
