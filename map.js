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
let mainSidewalksLayer = null;
let buurtenLayer = null;
let currentBuurtLayer = null;
let loadedBuurten = new Map();
let mapInitialized = false;

// Initialize map only when section becomes visible
function initializeMap() {
  if (mapInitialized) return;
  
  console.log('Initializing SlimShady map...');
  
  // Initialize map centered on Amsterdam
  map = L.map('map', {
    zoomControl: false // We'll add custom controls
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
  
  mapInitialized = true;
  
  // Load data
  loadMapData();
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

// Sophisticated styling functions
function styleMainSidewalks(feature) {
  const shadeIndex = feature.properties.shade_availability_index_30;
  
  return {
    color: getShadeColor(shadeIndex),
    weight: 1.5,
    opacity: 0.8,
    fillColor: getShadeColor(shadeIndex),
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
  return {
    color: SCL_COLORS.green,
    weight: 1,
    opacity: 0.7,
    fillColor: 'transparent',
    fillOpacity: 0
  };
}

// Load main sidewalks data
async function loadMainData() {
  showLoading();
  
  try {
    console.log('Loading main sidewalks data...');
    const response = await fetch('data/sidewalks_web_minimal.geojson');
    const mainData = await response.json();
    
    console.log('Main data loaded:', mainData.features.length, 'features');
    
    mainSidewalksLayer = L.geoJSON(mainData, {
      style: styleMainSidewalks,
      onEachFeature: (feature, layer) => {
        const shadeIndex = feature.properties.shade_availability_index_30;
        const guid = feature.properties.Guid;
        const category = getShadeCategory(shadeIndex);
        
        layer.bindTooltip(`
          <div style="font-family: Inter, sans-serif;">
            <div style="font-weight: 500; color: #95C11F; margin-bottom: 4px;">Shade Analysis</div>
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
    }).addTo(map);
    
    console.log('Main sidewalks layer added successfully');
    
    // Fit map to data bounds
    if (mainSidewalksLayer.getBounds().isValid()) {
      map.fitBounds(mainSidewalksLayer.getBounds(), { padding: [20, 20] });
    }
    
  } catch (error) {
    console.error('Error loading main data:', error);
  } finally {
    hideLoading();
  }
}

// Load neighborhood boundaries
async function loadBuurten() {
  try {
    console.log('Loading neighborhood boundaries...');
    const response = await fetch('data/geojson_lnglat.json');
    const buurtenData = await response.json();
    
    console.log('Neighborhood data loaded:', buurtenData.features.length, 'features');
    
    buurtenLayer = L.geoJSON(buurtenData, {
      style: styleBuurten,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const buurtName = props.Buurt || 'Unknown';
        const buurtCode = props.Buurtcode || props.CBS_Buurtcode || 'N/A';
        
        layer.bindTooltip(`
          <div style="font-family: Inter, sans-serif;">
            <div style="font-weight: 500; color: #95C11F; margin-bottom: 4px;">${buurtName}</div>
            <div>Code: <strong>${buurtCode}</strong></div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">Click for detailed analysis</div>
          </div>
        `, { 
          permanent: false, 
          direction: 'top',
          className: 'custom-tooltip'
        });

        layer.on('mouseover', (e) => {
          layer.setStyle({ 
            fillOpacity: 0.2, 
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

// Load detailed neighborhood data
async function loadBuurtDetails(buurtCode, buurtName, buurtLayer) {
  showLoading();
  
  try {
    // Check cache first
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
    
    // Cache the data
    loadedBuurten.set(buurtCode, detailedData);
    
    displayBuurtData(detailedData, buurtName, buurtLayer);
    
  } catch (error) {
    console.error('Error loading neighborhood details:', error);
    showInfoPanel(`
      <div class="info-title">${buurtName}</div>
      <div style="color: #FF5722; margin: 12px 0;">
        <strong>Data Unavailable</strong>
      </div>
      <div style="color: #888888; font-size: 12px;">
        No detailed shade analysis available for this neighborhood.
        <br><br>
        <em>Error: ${error.message}</em>
      </div>
    `);
  } finally {
    hideLoading();
  }
}

// Display detailed neighborhood analysis
function displayBuurtData(buurtData, buurtName, buurtLayer) {
  // Remove previous detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
  }
  
  // Hide main layer for clarity
  if (mainSidewalksLayer) {
    map.removeLayer(mainSidewalksLayer);
  }
  
  // Create new detailed layer
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
  
  // Zoom to neighborhood bounds
  map.fitBounds(buurtLayer.getBounds(), { padding: [50, 50] });

  // Calculate sophisticated statistics
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
  
  // Category distribution
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
  
  if (mainSidewalksLayer) {
    mainSidewalksLayer.addTo(map);
    if (mainSidewalksLayer.getBounds().isValid()) {
      map.fitBounds(mainSidewalksLayer.getBounds(), { padding: [20, 20] });
    }
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
  // Check initial visibility
  setTimeout(checkMapVisibility, 100);
  
  // Listen for scroll events
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(checkMapVisibility, 50);
  });
  
  // Also initialize if user scrolls to map section
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

console.log('SlimShady unified page loaded');
