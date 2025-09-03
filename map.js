// SCL Color scheme for shade visualization
const SCL_COLORS = {
  green: '#95C11F',
  darkGreen: '#5B7026',
  text: '#000000',
  background: '#ffffff'
};

// Color scale for shade availability (0.0 to 1.0)
function getShadeColor(shadeIndex) {
  if (shadeIndex === undefined || shadeIndex === null) return '#999999';
  
  // Color scale from red (no shade) to dark green (full shade)
  if (shadeIndex <= 0.0) return '#B71C1C';      // Deep red
  if (shadeIndex <= 0.2) return '#FF5722';      // Orange-red
  if (shadeIndex <= 0.4) return '#FF9800';      // Orange
  if (shadeIndex <= 0.6) return '#FFC107';      // Yellow
  if (shadeIndex <= 0.8) return SCL_COLORS.green; // SCL Green
  return SCL_COLORS.darkGreen;                   // SCL Dark Green
}

// Initialize map centered on Amsterdam
const map = L.map('map').setView([52.3676, 4.9041], 11);

// Add OpenStreetMap tiles with custom styling
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// Global variables for layers
let mainSidewalksLayer = null;
let buurtenLayer = null;
let currentBuurtLayer = null;
let loadedBuurten = new Map(); // Cache for loaded buurt data

// Loading indicator functions
function showLoading() {
  document.getElementById('loadingIndicator').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingIndicator').classList.remove('show');
}

// Info panel functions
function showInfoPanel(content) {
  const panel = document.getElementById('infoPanel');
  document.getElementById('buurtInfo').innerHTML = content;
  panel.classList.add('active');
}

function hideInfoPanel() {
  document.getElementById('infoPanel').classList.remove('active');
}

// Style function for sidewalks based on shade index
function styleMainSidewalks(feature) {
  const shadeIndex = feature.properties.shade_availability_index_30;
  return {
    color: getShadeColor(shadeIndex),
    weight: 3,
    opacity: 0.8,
    fillColor: getShadeColor(shadeIndex),
    fillOpacity: 0.6
  };
}

// Style function for buurt boundaries
function styleBuurt(feature) {
  return {
    fillColor: 'transparent',
    weight: 2,
    opacity: 0.8,
    color: SCL_COLORS.darkGreen,
    dashArray: '5, 5',
    fillOpacity: 0
  };
}

// Load and display main sidewalks data
async function loadMainData() {
  showLoading();
  
  try {
    console.log('Loading main sidewalks data...');
    const response = await fetch('data/sidewalks_web_minimal.geojson');
    const data = await response.json();
    
    console.log('Main data loaded:', data.features.length, 'features');
    
    mainSidewalksLayer = L.geoJSON(data, {
      style: styleMainSidewalks,
      onEachFeature: (feature, layer) => {
        const shadeIndex = feature.properties.shade_availability_index_30;
        const guid = feature.properties.Guid;
        
        layer.bindTooltip(`
          <strong>Shade Index:</strong> ${shadeIndex?.toFixed(2) || 'N/A'}<br>
          <strong>ID:</strong> ${guid || 'N/A'}
        `, {
          sticky: true
        });
      }
    }).addTo(map);
    
    // Fit map to data bounds
    if (data.features.length > 0) {
      map.fitBounds(mainSidewalksLayer.getBounds(), { padding: [20, 20] });
    }
    
  } catch (error) {
    console.error('Error loading main data:', error);
    alert('Error loading main sidewalks data');
  } finally {
    hideLoading();
  }
}

// Load buurt boundaries
async function loadBuurten() {
  try {
    console.log('Loading buurt boundaries...');
    const response = await fetch('data/geojson_lnglat.json');
    const data = await response.json();
    
    console.log('Buurt data loaded:', data.features.length, 'features');
    
    buurtenLayer = L.geoJSON(data, {
      style: styleBuurt,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const buurtName = props.Buurt || 'Unknown';
        const buurtCode = props.Buurtcode || props.CBS_Buurtcode || 'N/A';
        const stadsdeel = props.Stadsdeel || 'N/A';
        
        // Add hover effect
        layer.on({
          mouseover: (e) => {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: SCL_COLORS.green,
              dashArray: '',
              fillOpacity: 0.2,
              fillColor: SCL_COLORS.green
            });
            
            showInfoPanel(`
              <strong>${buurtName}</strong><br>
              <strong>Code:</strong> ${buurtCode}<br>
              <strong>District:</strong> ${stadsdeel}<br>
              <em>Click to load detailed data</em>
            `);
          },
          
          mouseout: (e) => {
            buurtenLayer.resetStyle(e.target);
            hideInfoPanel();
          },
          
          click: (e) => {
            loadBuurtDetails(buurtCode, buurtName, e.target);
          }
        });
      }
    }).addTo(map);
    
  } catch (error) {
    console.error('Error loading buurt boundaries:', error);
    alert('Error loading neighborhood boundaries');
  }
}

// Load detailed buurt data
async function loadBuurtDetails(buurtCode, buurtName, buurtLayer) {
  showLoading();
  
  try {
    // Check if already loaded
    if (loadedBuurten.has(buurtCode)) {
      console.log('Using cached buurt data for', buurtCode);
      displayBuurtData(loadedBuurten.get(buurtCode), buurtName, buurtLayer);
      return;
    }
    
    console.log('Loading detailed data for buurt:', buurtCode);
    const response = await fetch(`data/Buurt_data/${buurtCode}_sidewalks.geojson`);
    
    if (!response.ok) {
      throw new Error(`No detailed data available for ${buurtName} (${buurtCode})`)
    }
    
    const data = await response.json();
    console.log(`Loaded ${data.features.length} detailed features for ${buurtName}`);
    
    // Cache the data
    loadedBuurten.set(buurtCode, data);
    
    displayBuurtData(data, buurtName, buurtLayer);
    
  } catch (error) {
    console.error('Error loading buurt details:', error);
    showInfoPanel(`
      <strong>${buurtName}</strong><br>
      <em>No detailed data available for this neighborhood</em><br>
      <small>Error: ${error.message}</small>
    `);
  } finally {
    hideLoading();
  }
}

// Display detailed buurt data
function displayBuurtData(data, buurtName, buurtLayer) {
  // Remove previous detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
  }
  
  // Hide main layer for clarity
  if (mainSidewalksLayer) {
    map.removeLayer(mainSidewalksLayer);
  }
  
  // Add detailed layer
  currentBuurtLayer = L.geoJSON(data, {
    style: (feature) => {
      const shadeIndex = feature.properties.shade_availability_index_30;
      return {
        color: getShadeColor(shadeIndex),
        weight: 4,
        opacity: 0.9,
        fillColor: getShadeColor(shadeIndex),
        fillOpacity: 0.7
      };
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const shadeIndex = props.shade_availability_index_30;
      
      layer.bindTooltip(`
        <strong>Detailed Sidewalk Info</strong><br>
        <strong>Shade Index:</strong> ${shadeIndex?.toFixed(2) || 'N/A'}<br>
        <strong>Function:</strong> ${props.Gebruiksfunctie || 'N/A'}<br>
        <strong>Year Built:</strong> ${props.Jaar_van_aanleg || 'N/A'}<br>
        <strong>Last Maintenance:</strong> ${props.Jaar_uitgevoerd_onderhoud || 'N/A'}
      `, {
        sticky: true
      });
    }
  }).addTo(map);
  
  // Zoom to buurt bounds
  map.fitBounds(buurtLayer.getBounds(), { padding: [50, 50] });
  
  // Calculate statistics for this buurt
  const shadeValues = data.features
    .map(f => f.properties.shade_availability_index_30)
    .filter(v => v !== null && v !== undefined);
    
  const avgShade = shadeValues.length > 0 ? 
    (shadeValues.reduce((a, b) => a + b, 0) / shadeValues.length).toFixed(2) : 'N/A';
  const minShade = shadeValues.length > 0 ? Math.min(...shadeValues).toFixed(2) : 'N/A';
  const maxShade = shadeValues.length > 0 ? Math.max(...shadeValues).toFixed(2) : 'N/A';
  
  showInfoPanel(`
    <strong>${buurtName}</strong><br>
    <strong>Features:</strong> ${data.features.length}<br>
    <strong>Avg Shade:</strong> ${avgShade}<br>
    <strong>Range:</strong> ${minShade} - ${maxShade}<br>
    <button onclick="resetView()" style="
      background: ${SCL_COLORS.green}; 
      color: white; 
      border: none; 
      padding: 8px 16px; 
      border-radius: 15px; 
      cursor: pointer;
      margin-top: 10px;
      font-size: 0.8rem;
    ">← Back to Overview</button>
  `);
}

// Reset to overview
function resetView() {
  // Remove detailed layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
    currentBuurtLayer = null;
  }
  
  // Show main layer again
  if (mainSidewalksLayer) {
    map.addLayer(mainSidewalksLayer);
  }
  
  // Reset view to Amsterdam
  map.setView([52.3676, 4.9041], 11);
  
  hideInfoPanel();
}

// Initialize the map
async function initMap() {
  console.log('Initializing map...');
  
  // Load data in sequence
  await loadMainData();
  await loadBuurten();
  
  console.log('Map initialization complete');
}

// Start the application
initMap();
