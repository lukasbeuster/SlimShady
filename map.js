// SCL Color scheme for shade visualization
const SCL_COLORS = {
  green: '#95C11F',
  darkGreen: '#5B7026',
  text: '#ffffff',
  background: '#000000'
};

// Shade categories with professional color mapping
function getShadeColor(shadeIndex) {
  if (shadeIndex === undefined || shadeIndex === null) return '#666666';
  
  // Professional color scale aligned with shade categories
  if (shadeIndex < 0.5) return '#B71C1C';        // Deep red - Poor Shading
  if (shadeIndex < 0.7) return '#FF9800';        // Orange - Acceptable
  if (shadeIndex < 0.9) return SCL_COLORS.green; // SCL Green - Very Good
  return SCL_COLORS.darkGreen;                   // SCL Dark Green - Excellent
}

// Neighborhood color mapping
function getNeighborhoodColor(quality, shadeIndex) {
  if (quality === 'No Data') return '#333333';
  if (quality === 'Poor') return '#B71C1C';
  if (quality === 'Acceptable') return '#FF9800';
  if (quality === 'Very Good') return SCL_COLORS.green;
  if (quality === 'Excellent') return SCL_COLORS.darkGreen;
  return '#666666';
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
let mainDataLayer = null;
let buurtenLayer = null;
let currentBuurtLayer = null;
let loadedBuurten = new Map();
let mapInitialized = false;

// Layer control variables
let visibleLayers = {
  'Sidewalk': true,
  'Road': false,
  'Cycle lane': false
};

// Initialize map only when section becomes visible
function initializeMap() {
  if (mapInitialized) return;
  
  console.log('Initializing SlimShady map...');
  
  // Initialize map centered on Amsterdam
  map = L.map('map', {
    zoomControl: false,
    minZoom: 10, // Prevent zooming out too far
    maxZoom: 18
  }).setView([52.3676, 4.9041], 11);

  // Add custom zoom control in bottom right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);

  // Add sophisticated dark tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://carto.com">CARTO</a> | © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  // Add layer control
  createLayerControl();
  
  mapInitialized = true;
  
  // Load data
  loadMapData();
}

// Create layer control panel
function createLayerControl() {
  const layerControl = L.control({ position: 'topleft' });
  
  layerControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'layer-control');
    div.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px;
      min-width: 200px;
      font-family: Inter, sans-serif;
      font-size: 12px;
    `;
    
    div.innerHTML = `
      <div style="color: #95C11F; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
        Infrastructure Layers
      </div>
      <div class="layer-options">
        <label style="display: block; margin-bottom: 6px; color: #fff; cursor: pointer;">
          <input type="checkbox" id="layer-sidewalk" checked style="margin-right: 8px;">
          <span style="color: #95C11F;">●</span> Sidewalks
        </label>
        <label style="display: block; margin-bottom: 6px; color: #fff; cursor: pointer;">
          <input type="checkbox" id="layer-road" style="margin-right: 8px;">
          <span style="color: #B71C1C;">●</span> Roads
        </label>
        <label style="display: block; color: #fff; cursor: pointer;">
          <input type="checkbox" id="layer-cycle" style="margin-right: 8px;">
          <span style="color: #FF9800;">●</span> Cycle Lanes
        </label>
      </div>
      <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #333; font-size: 10px; color: #888;">
        Note: Statistics based on sidewalk data only
      </div>
    `;
    
    // Add event listeners
    div.querySelector('#layer-sidewalk').addEventListener('change', () => toggleLayer('Sidewalk'));
    div.querySelector('#layer-road').addEventListener('change', () => toggleLayer('Road'));
    div.querySelector('#layer-cycle').addEventListener('change', () => toggleLayer('Cycle lane'));
    
    // Prevent map interactions when clicking control
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    
    return div;
  };
  
  layerControl.addTo(map);
}

// Toggle layer visibility
function toggleLayer(layerType) {
  visibleLayers[layerType] = !visibleLayers[layerType];
  
  if (mainDataLayer) {
    mainDataLayer.eachLayer(layer => {
      const feature = layer.feature;
      if (feature.properties.Gebruiksfunctie === layerType) {
        if (visibleLayers[layerType]) {
          layer.addTo(map);
        } else {
          map.removeLayer(layer);
        }
      }
    });
  }
}

// Loading indicator functions
function showLoading() {
  document.getElementById('loadingIndicator').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingIndicator').classList.remove('show');
}

// Info panel functions
function showInfoPanel(content) {
  document.getElementById('infoPanel').classList.add('active');
  document.getElementById('buurtInfo').innerHTML = content;
}

function hideInfoPanel() {
  document.getElementById('infoPanel').classList.remove('active');
}

// Styling functions
function styleMainData(feature) {
  const shadeIndex = feature.properties.shade_availability_index_30;
  const funcType = feature.properties.Gebruiksfunctie;
  
  let color = getShadeColor(shadeIndex);
  let weight = 1.5;
  let opacity = 0.8;
  
  // Adjust styling based on function type
  if (funcType === 'Road') {
    weight = 2;
    opacity = 0.6;
  } else if (funcType === 'Cycle lane') {
    weight = 1;
    opacity = 0.7;
  }
  
  return {
    color: color,
    weight: weight,
    opacity: opacity,
    fillColor: color,
    fillOpacity: 0.6
  };
}

function styleDetailedSidewalks(feature) {
  const shadeIndex = feature.properties.shade_availability_index_30;
  
  return {
    color: getShadeColor(shadeIndex),
    weight: 2,
    opacity: 0.9,
    fillColor: getShadeColor(shadeIndex),
    fillOpacity: 0.75
  };
}

function styleBuurten(feature) {
  const quality = feature.properties.shade_quality;
  const shadeIndex = feature.properties.shade_availability_index_30_mean;
  
  return {
    color: getNeighborhoodColor(quality, shadeIndex),
    weight: 1.5,
    opacity: 0.8,
    fillColor: getNeighborhoodColor(quality, shadeIndex),
    fillOpacity: 0.3
  };
}

// Load main data with filtering capability
async function loadMainData() {
  showLoading();
  
  try {
    console.log('Loading infrastructure data...');
    const response = await fetch('data/sidewalks_with_functions.geojson');
    const mainData = await response.json();
    
    console.log('Main data loaded:', mainData.features.length, 'features');
    
    // Create layer group
    mainDataLayer = L.layerGroup();
    
    // Process each feature
    mainData.features.forEach(feature => {
      const funcType = feature.properties.Gebruiksfunctie;
      const shadeIndex = feature.properties.shade_availability_index_30;
      const guid = feature.properties.Guid;
      const category = getShadeCategory(shadeIndex);
      
      const layer = L.geoJSON(feature, {
        style: styleMainData,
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(`
            <div style="font-family: Inter, sans-serif;">
              <div style="font-weight: 500; color: #95C11F; margin-bottom: 4px;">Shade Analysis</div>
              <div>Type: <strong>${funcType}</strong></div>
              <div>Category: <strong>${category}</strong></div>
              <div>Index: <strong>${shadeIndex?.toFixed(2) || 'N/A'}</strong></div>
              <div style="font-size: 11px; color: #888; margin-top: 4px;">ID: ${guid || 'N/A'}</div>
            </div>
          `, { 
            permanent: false, 
            direction: 'top',
            className: 'custom-tooltip'
          });
        }
      });
      
      // Add to main layer group
      layer.addTo(mainDataLayer);
      
      // Initially show only sidewalks
      if (funcType === 'Sidewalk' && visibleLayers[funcType]) {
        layer.addTo(map);
      }
    });
    
    console.log('Infrastructure layers created');
    
    // Fit map to data bounds
    if (mainDataLayer.getBounds && Object.keys(mainDataLayer._layers).length > 0) {
      map.fitBounds(mainDataLayer.getBounds(), { padding: [20, 20] });
      
      // Set max bounds to prevent infinite scroll
      const bounds = mainDataLayer.getBounds();
      const extendedBounds = bounds.pad(0.1); // Add 10% padding
      map.setMaxBounds(extendedBounds);
    }
    
  } catch (error) {
    console.error('Error loading main data:', error);
  } finally {
    hideLoading();
  }
}

// Load neighborhood boundaries with statistics
async function loadBuurten() {
  try {
    console.log('Loading neighborhood boundaries with statistics...');
    const response = await fetch('data/neighborhoods_with_shade_stats.geojson');
    const buurtenData = await response.json();
    
    console.log('Neighborhood data loaded:', buurtenData.features.length, 'features');
    
    buurtenLayer = L.geoJSON(buurtenData, {
      style: styleBuurten,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const buurtName = props.Buurt || 'Unknown';
        const buurtCode = props.Buurtcode || props.CBS_Buurtcode || 'N/A';
        const quality = props.shade_quality || 'No Data';
        const meanShade = props.shade_availability_index_30_mean || 0;
        const segmentCount = props.shade_availability_index_30_count || 0;
        const coverage = props.coverage_excellent || 0;
        
        layer.bindTooltip(`
          <div style="font-family: Inter, sans-serif;">
            <div style="font-weight: 500; color: #95C11F; margin-bottom: 4px;">${buurtName}</div>
            <div>Quality: <strong style="color: ${getNeighborhoodColor(quality, meanShade)};">${quality}</strong></div>
            <div>Avg. Index: <strong>${meanShade.toFixed(2)}</strong></div>
            <div>Coverage: <strong>${coverage.toFixed(1)}%</strong></div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">
              ${segmentCount} sidewalk segments | Click for details
            </div>
          </div>
        `, { 
          permanent: false, 
          direction: 'top',
          className: 'custom-tooltip'
        });

        layer.on('mouseover', (e) => {
          layer.setStyle({ 
            fillOpacity: 0.6, 
            opacity: 1.0,
            weight: 2
          });
        });
        
        layer.on('mouseout', (e) => {
          buurtenLayer.resetStyle(e.target);
        });
        
        layer.on('click', (e) => {
          loadBuurtDetails(buurtCode, buurtName, e.target);
        });
      }
    }).addTo(map);
    
    console.log('Neighborhood boundaries added successfully');
    
  } catch (error) {
    console.error('Error loading neighborhood boundaries:', error);
  }
}

// Load detailed neighborhood data (unchanged from previous implementation)
async function loadBuurtDetails(buurtCode, buurtName, buurtLayer) {
  showLoading();
  
  try {
    if (loadedBuurten.has(buurtCode)) {
      console.log('Using cached data for', buurtCode);
      displayBuurtData(loadedBuurten.get(buurtCode), buurtName, buurtLayer);
      return;
    }
    
    console.log('Loading detailed data for neighborhood:', buurtCode);
    const response = await fetch(`data/Buurt_data/${buurtCode}_sidewalks.geojson`);
    
    if (!response.ok) {
      throw new Error(`No detailed data available for ${buurtName} (${buurtCode})`);
    }
    
    const detailedData = await response.json();
    console.log(`Loaded ${detailedData.features.length} detailed features for ${buurtName}`);
    
    loadedBuurten.set(buurtCode, detailedData);
    displayBuurtData(detailedData, buurtName, buurtLayer);
    
  } catch (error) {
    console.error('Error loading neighborhood details:', error);
    showInfoPanel(`
      <div class="info-title">${buurtName}</div>
      <div style="color: #FF5722; margin: 12px 0;">
        <strong>Detailed Data Unavailable</strong>
      </div>
      <div style="color: #888888; font-size: 12px;">
        Neighborhood-level statistics are available, but detailed segment analysis is not provided for this area.
        <br><br>
        <em>This may be due to data processing constraints or the area being outside the detailed analysis scope.</em>
      </div>
    `);
  } finally {
    hideLoading();
  }
}

// Display detailed neighborhood analysis (same as before)
function displayBuurtData(buurtData, buurtName, buurtLayer) {
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
  }
  
  if (mainDataLayer) {
    map.removeLayer(mainDataLayer);
  }
  if (buurtenLayer) {
    map.removeLayer(buurtenLayer);
  }
  
  currentBuurtLayer = L.geoJSON(buurtData, {
    style: styleDetailedSidewalks,
    onEachFeature: (feature, layer) => {
      const shadeIndex = feature.properties.shade_availability_index_30;
      const guid = feature.properties.Guid;
      const category = getShadeCategory(shadeIndex);
      
      layer.bindTooltip(`
        <div style="font-family: Inter, sans-serif;">
          <div style="font-weight: 500; color: #95C11F; margin-bottom: 4px;">Detailed Analysis</div>
          <div>Category: <strong>${category}</strong></div>
          <div>Index: <strong>${shadeIndex?.toFixed(2) || 'N/A'}</strong></div>
          <div>Neighborhood: <strong>${buurtName}</strong></div>
          <div style="font-size: 11px; color: #888; margin-top: 4px;">Segment: ${guid || 'N/A'}</div>
        </div>
      `, { 
        permanent: false, 
        direction: 'top',
        className: 'custom-tooltip'
      });
    }
  }).addTo(map);
  
  map.fitBounds(buurtLayer.getBounds(), { padding: [50, 50] });

  const features = buurtData.features;
  const shadeValues = features
    .map(f => f.properties.shade_availability_index_30)
    .filter(val => val !== null && val !== undefined);
  
  const avgShade = shadeValues.length > 0 ? 
    (shadeValues.reduce((sum, val) => sum + val, 0) / shadeValues.length) : 0;
  const maxShade = shadeValues.length > 0 ? Math.max(...shadeValues) : 0;
  const minShade = shadeValues.length > 0 ? Math.min(...shadeValues) : 0;
  const stdDev = shadeValues.length > 1 ? 
    Math.sqrt(shadeValues.reduce((sum, val) => sum + Math.pow(val - avgShade, 2), 0) / shadeValues.length) : 0;
  
  const poorShade = shadeValues.filter(val => val < 0.5).length;
  const acceptableShade = shadeValues.filter(val => val >= 0.5 && val < 0.7).length;
  const veryGoodShade = shadeValues.filter(val => val >= 0.7 && val < 0.9).length;
  const excellentShade = shadeValues.filter(val => val >= 0.9).length;
  const excellentCoverage = shadeValues.length > 0 ? (excellentShade / shadeValues.length * 100) : 0;
  
  showInfoPanel(`
    <div class="info-title">${buurtName}</div>
    <div class="info-stats">
      <div style="margin-bottom: 16px; color: #cccccc;">
        <strong>Statistical Analysis</strong>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 11px; color: #888; text-transform: uppercase;">Segments</div>
          <div style="font-size: 16px; font-weight: 500; color: #95C11F;">${features.length}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #888; text-transform: uppercase;">Excellent Coverage</div>
          <div style="font-size: 16px; font-weight: 500; color: #95C11F;">${excellentCoverage.toFixed(1)}%</div>
        </div>
      </div>
      
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px;">Shade Metrics</div>
        <div style="font-size: 13px; color: #cccccc;">
          <div>Mean: <strong>${avgShade.toFixed(2)}</strong></div>
          <div>Range: <strong>${minShade.toFixed(2)}</strong> - <strong>${maxShade.toFixed(2)}</strong></div>
          <div>Std Dev: <strong>${stdDev.toFixed(2)}</strong></div>
        </div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px;">Category Distribution</div>
        <div style="font-size: 13px; color: #cccccc;">
          <div style="color: #B71C1C;">Poor Shading: <strong>${poorShade}</strong> segments</div>
          <div style="color: #FF9800;">Acceptable: <strong>${acceptableShade}</strong> segments</div>
          <div style="color: #95C11F;">Very Good: <strong>${veryGoodShade}</strong> segments</div>
          <div style="color: #5B7026;">Excellent: <strong>${excellentShade}</strong> segments</div>
        </div>
      </div>
      
      <button onclick="showMainView()" style="
        background: transparent;
        color: #95C11F;
        border: 1px solid #95C11F;
        padding: 8px 16px;
        font-family: Inter, sans-serif;
        font-size: 12px;
        font-weight: 300;
        cursor: pointer;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        width: 100%;
      " onmouseover="this.style.background='#95C11F'; this.style.color='#000000';" 
         onmouseout="this.style.background='transparent'; this.style.color='#95C11F';">
        ← Return to Overview
      </button>
    </div>
  `);
}

// Return to main overview
function showMainView() {
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
    currentBuurtLayer = null;
  }
  
  // Restore main layers
  if (buurtenLayer) {
    buurtenLayer.addTo(map);
  }
  if (mainDataLayer) {
    // Re-apply layer visibility filters
    mainDataLayer.eachLayer(layer => {
      const funcType = layer.feature.properties.Gebruiksfunctie;
      if (visibleLayers[funcType]) {
        layer.addTo(map);
      }
    });
  }
  
  // Reset bounds
  if (mainDataLayer && Object.keys(mainDataLayer._layers).length > 0) {
    map.fitBounds(mainDataLayer.getBounds(), { padding: [20, 20] });
  }
  
  hideInfoPanel();
}

// Load all map data
async function loadMapData() {
  try {
    await loadMainData();
    await loadBuurten();
    console.log('Map data loading complete');
  } catch (error) {
    console.error('Error initializing map data:', error);
  }
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

console.log('SlimShady enhanced map loaded');
