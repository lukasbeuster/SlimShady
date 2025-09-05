// SCL Color scheme (colorblind-friendly adaptation)
const SCL_COLORS = {
  gray: '#D9A441',      // Poor (amber)
  teal: '#4FA3B6',      // Acceptable (teal)
  green: '#95C11F',     // Very Good (SCL Green)
  darkGreen: '#5B7026', // Excellent (SCL Dark Green)
  text: '#ffffff',
  background: '#000000'
};

// Shade categories with professional color mapping
function getShadeColor(shadeIndex) {
  if (shadeIndex === undefined || shadeIndex === null) return '#666666';
  if (shadeIndex < 0.5) return SCL_COLORS.gray;      // Poor (neutral gray)
  if (shadeIndex < 0.7) return SCL_COLORS.teal;      // Acceptable (teal-blue)
  if (shadeIndex < 0.9) return SCL_COLORS.green;     // Very Good (SCL green)
  return SCL_COLORS.darkGreen;                        // Excellent (dark green)
}

// Get shade category label
function getShadeCategory(shadeIndex) {
  if (shadeIndex === undefined || shadeIndex === null) return 'Unknown';
  if (shadeIndex < 0.5) return 'Poor Shading';
  if (shadeIndex < 0.7) return 'Acceptable';
  if (shadeIndex < 0.9) return 'Very Good';
  return 'Excellent';
}

// Global variables
let map = null;
let buurtenLayer = null;
let currentBuurtLayer = null;
let loadedBuurten = new Map();
let mapInitialized = false;
let isDetailView = false;

// Initialize map when section becomes visible
function initializeMap() {
  if (mapInitialized) return;
  
  console.log("Leaflet available:", typeof L !== "undefined", "Version:", typeof L !== "undefined" ? L.version : "N/A");
  console.log('Initializing SlimShady map...');
  const mapDiv = document.getElementById("map");
  console.log("Map div found:", !!mapDiv, mapDiv);
  if (!mapDiv) {
    console.error("Map div not found!");
    return;
  }
  
  map = L.map('map', {
    zoomControl: false,
    minZoom: 10,
    maxZoom: 18
  }).setView([52.3676, 4.9041], 11);

  // Add zoom control in bottom right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);

  // Add dark tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://carto.com">CARTO</a> | © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);
  
  mapInitialized = true;
  loadMapData();
}

// Loading functions
function showLoading() {
  document.getElementById('loadingIndicator').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingIndicator').classList.remove('show');
}

// Info panel functions
function showInfoPanel(title, content) {
  const titleElement = document.querySelector('#infoPanel .info-title');
  const contentElement = document.getElementById('buurtInfo');
  if (titleElement) titleElement.textContent = title;
  if (contentElement) contentElement.innerHTML = content;
  document.getElementById('infoPanel').classList.add('active');
}

function hideInfoPanel() {
  document.getElementById('infoPanel').classList.remove('active');
}

// Style neighborhoods based on average shade
function styleNeighborhoods(feature) {
  const meanShade = feature.properties.shade_availability_index_30_mean || 0;
  const color = getShadeColor(meanShade);
  
  return {
    fillColor: color,
    weight: 1,
    opacity: 0.8,
    color: '#333',
    fillOpacity: 0.6
  };
}

// Style detailed sidewalks
function styleDetailedSidewalks(feature) {
  const shadeIndex = feature.properties.shade_availability_index_30;
  
  return {
    color: getShadeColor(shadeIndex),
    weight: 2,
    opacity: 0.9,
    fillColor: getShadeColor(shadeIndex),
    fillOpacity: 0.7
  };
}

// Load neighborhood boundaries with shade statistics
async function loadMapData() {
  showLoading();
  
  try {
    console.log('Loading neighborhood data with shade statistics...');
  console.log("mapInitialized:", mapInitialized, "map object:", !!map);
    const response = await fetch('data/neighborhoods_with_shade_stats.geojson');
    const buurtenData = await response.json();
    
    console.log('Neighborhood data loaded:', buurtenData.features.length, 'features');
    
    buurtenLayer = L.geoJSON(buurtenData, {
      style: styleNeighborhoods,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const buurtName = props.Buurt || 'Unknown';
        const buurtCode = props.Buurtcode || props.CBS_Buurtcode || 'N/A';
        const meanShade = props.shade_availability_index_30_mean || 0;
        const segmentCount = props.shade_availability_index_30_count || 0;
        const coverage = props.coverage_excellent || 0;
        const category = getShadeCategory(meanShade);
        const color = getShadeColor(meanShade);
        
        layer.bindTooltip(`
          <strong>${buurtName}</strong><br>
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border:1px solid #555;"></span>
            <span>Shade Quality: ${category}</span>
          </span><br>
          Average Index: ${meanShade.toFixed(2)}<br>
          ${segmentCount} sidewalk segments
        `, { 
          permanent: false, 
          direction: 'top',
          className: 'custom-tooltip'
        });

        layer.on('mouseover', (e) => {
          layer.setStyle({ 
            fillOpacity: 0.8,
            weight: 2
          });
        });
        
        layer.on('mouseout', (e) => {
          if (!isDetailView) {
            buurtenLayer.resetStyle(e.target);
          }
        });
        
        layer.on('click', (e) => {
          loadNeighborhoodDetails(buurtCode, buurtName, meanShade, segmentCount, coverage, e.target);
        });
      }
    }).addTo(map);
    
    // Set map bounds
    map.fitBounds(buurtenLayer.getBounds(), { padding: [20, 20] });
    map.setMaxBounds(buurtenLayer.getBounds().pad(0.1));
    
    console.log('Map initialization complete');
    
  } catch (error) {
    console.error('Error loading map data:', error);
  } finally {
    hideLoading();
  }
}

// Load detailed neighborhood data with filtering
async function loadNeighborhoodDetails(buurtCode, buurtName, meanShade, segmentCount, coverage, buurtLayer) {
  showLoading();
  
  try {
    // Check cache first
    if (loadedBuurten.has(buurtCode)) {
      console.log('Using cached data for', buurtCode);
      displayNeighborhoodDetails(loadedBuurten.get(buurtCode), buurtName, meanShade, segmentCount, coverage, buurtLayer);
      return;
    }
    
    console.log('Loading detailed data for neighborhood:', buurtCode);
    const response = await fetch(`data/Buurt_data/${buurtCode}_sidewalks.geojson`);
    
    if (!response.ok) {
      showNeighborhoodOverview(buurtName, meanShade, segmentCount, coverage);
      return;
    }
    
    const detailedData = await response.json();
    console.log(`Loaded ${detailedData.features.length} detailed features for ${buurtName}`);
    
    // Cache the data
    loadedBuurten.set(buurtCode, detailedData);
    
    displayNeighborhoodDetails(detailedData, buurtName, meanShade, segmentCount, coverage, buurtLayer);
    
  } catch (error) {
    console.error('Error loading neighborhood details:', error);
    showNeighborhoodOverview(buurtName, meanShade, segmentCount, coverage);
  } finally {
    hideLoading();
  }
}

// Show neighborhood overview when no detailed data available
function showNeighborhoodOverview(buurtName, meanShade, segmentCount, coverage) {
  const category = getShadeCategory(meanShade);
  
  showInfoPanel(buurtName, `
    <div style="margin-bottom: 16px;">
      <div class="info-stat">
        <span class="info-stat-label">Shade Quality:</span>
        <span class="info-stat-value"><span style="display:inline-block;width:10px;height:10px;background:${color};border:1px solid #555;margin-right:6px;"></span>${category}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Average Index:</span>
        <span class="info-stat-value">${meanShade.toFixed(2)}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Sidewalk Segments:</span>
        <span class="info-stat-value">${segmentCount}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Excellent Coverage:</span>
        <span class="info-stat-value">${coverage.toFixed(1)}%</span>
      </div>
    </div>
    <div style="font-size: 11px; color: #888; font-style: italic;">
      Detailed segment analysis not available for this neighborhood.
    </div>
  `);
}

// Display detailed neighborhood analysis with sidewalk filtering
function displayNeighborhoodDetails(buurtData, buurtName, meanShade, segmentCount, coverage, buurtLayer) {
  // Switch to detail view
  isDetailView = true;
  
  // Hide neighborhood layer
  if (buurtenLayer) {
    buurtenLayer.setStyle({ fillOpacity: 0.1, opacity: 0.3 });
  }
  
  // Remove previous detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
  }
  
  // Filter only sidewalks from the detailed data
  const sidewalksOnly = buurtData.features.filter(feature => 
    feature.properties.Gebruiksfunctie === 'Sidewalk'
  );
  
  const sidewalkGeoJSON = {
    type: 'FeatureCollection',
    features: sidewalksOnly
  };
  
  // Create detailed layer with only sidewalks
  currentBuurtLayer = L.geoJSON(sidewalkGeoJSON, {
    style: styleDetailedSidewalks,
    onEachFeature: (feature, layer) => {
      const shadeIndex = feature.properties.shade_availability_index_30;
      const guid = feature.properties.Guid;
      const category = getShadeCategory(shadeIndex);
      const chip = getShadeColor(shadeIndex);
      
      layer.bindTooltip(`
        <strong>Sidewalk Segment</strong><br>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;background:${chip};border:1px solid #555;"></span>
          <span>Shade Category: ${category}</span>
        </span><br>
        Index: ${shadeIndex?.toFixed(2) || 'N/A'}<br>
        ID: ${guid || 'N/A'}
      `, { 
        permanent: false, 
        direction: 'top',
        className: 'custom-tooltip'
      });
    }
  }).addTo(map);
  
  // Zoom to neighborhood
  map.fitBounds(buurtLayer.getBounds(), { padding: [50, 50] });

  // Calculate statistics for sidewalks only
  const sidewalkShadeValues = sidewalksOnly
    .map(f => f.properties.shade_availability_index_30)
    .filter(val => val !== null && val !== undefined);
  
  const avgShade = sidewalkShadeValues.length > 0 ? 
    (sidewalkShadeValues.reduce((sum, val) => sum + val, 0) / sidewalkShadeValues.length) : 0;
  const maxShade = sidewalkShadeValues.length > 0 ? Math.max(...sidewalkShadeValues) : 0;
  const minShade = sidewalkShadeValues.length > 0 ? Math.min(...sidewalkShadeValues) : 0;
  
  // Category counts
  const poorCount = sidewalkShadeValues.filter(val => val < 0.5).length;
  const acceptableCount = sidewalkShadeValues.filter(val => val >= 0.5 && val < 0.7).length;
  const veryGoodCount = sidewalkShadeValues.filter(val => val >= 0.7 && val < 0.9).length;
  const excellentCount = sidewalkShadeValues.filter(val => val >= 0.9).length;
  const excellentPercentage = sidewalkShadeValues.length > 0 ? (excellentCount / sidewalkShadeValues.length * 100) : 0;
  
  showInfoPanel(buurtName + ' - Detail View', `
    <div style="margin-bottom: 16px;">
      <div class="info-stat">
        <span class="info-stat-label">Sidewalk Segments:</span>
        <span class="info-stat-value">${sidewalksOnly.length}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Average Shade:</span>
        <span class="info-stat-value">${avgShade.toFixed(2)}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Range:</span>
        <span class="info-stat-value">${minShade.toFixed(2)} - ${maxShade.toFixed(2)}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Excellent Coverage:</span>
        <span class="info-stat-value">${excellentPercentage.toFixed(1)}%</span>
      </div>
    </div>
    
    <div style="margin-bottom: 16px;">
      <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 8px;">Distribution</div>
      <div class="info-stat">
        <span style="color: #D9A441;">Poor:</span>
        <span>${poorCount}</span>
      </div>
      <div class="info-stat">
        <span style="color: #4FA3B6;">Acceptable:</span>
        <span>${acceptableCount}</span>
      </div>
      <div class="info-stat">
        <span style="color: #95C11F;">Very Good:</span>
        <span>${veryGoodCount}</span>
      </div>
      <div class="info-stat">
        <span style="color: #5B7026;">Excellent:</span>
        <span>${excellentCount}</span>
      </div>
    </div>
    
    <button onclick="returnToOverview()" style="
      background: transparent;
      color: #95C11F;
      border: 1px solid #95C11F;
      padding: 8px 16px;
      font-family: Inter, sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    " onmouseover="this.style.background='#95C11F'; this.style.color='#000';" 
       onmouseout="this.style.background='transparent'; this.style.color='#95C11F';">
      ← Return to Overview
    </button>
  `);
}

// Return to overview mode
function returnToOverview() {
  isDetailView = false;
  
  // Remove detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
    currentBuurtLayer = null;
  }
  
  // Restore neighborhood layer
  if (buurtenLayer) {
    buurtenLayer.setStyle((feature) => styleNeighborhoods(feature));
    map.fitBounds(buurtenLayer.getBounds(), { padding: [20, 20] });
  }
  
  hideInfoPanel();
}

// Check if map section is visible and initialize
function checkMapVisibility() {
  const mapSection = document.getElementById('map-section');
  const rect = mapSection.getBoundingClientRect();
  
  if (rect.top < window.innerHeight && rect.bottom > 0 && !mapInitialized) {
    initializeMap();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Also try immediate initialization in case visibility check fails
  initializeMap();
  setTimeout(checkMapVisibility, 100);
  
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(checkMapVisibility, 50);
  });
  
  const mapSectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !mapInitialized) {
        setTimeout(initializeMap, 200);
      }
    });
  }, { threshold: 0.1 });
  
  const mapSection = document.getElementById('map-section');
  if (mapSection) {
    mapSectionObserver.observe(mapSection);
  }
});

console.log('SlimShady map loaded - clean and minimal version');
