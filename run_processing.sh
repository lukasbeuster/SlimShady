#!/bin/bash
cd /data2/lukas/projects/SlimShady
source ../throwing_shade/.shade_env/bin/activate
nohup python3 -u process_capetown_for_website_v2.py > processing_capetown.log 2>&1 &
PID=$!
echo "Processing started in background. PID: $PID"
echo "Monitor with: tail -f processing_capetown.log"
