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
  const config = getCurrentConfig();
  const scale = config.colorScale;
  if (shadeIndex < scale.poor) return SCL_COLORS.gray;
  if (shadeIndex < scale.acceptable) return SCL_COLORS.teal;
  if (shadeIndex < scale.veryGood) return SCL_COLORS.green;
  return SCL_COLORS.darkGreen;
}


// City Configuration
const CITY_CONFIG = {
  amsterdam: {
    name: 'Amsterdam',
    displayName: 'Amsterdam',
    center: [52.3676, 4.9041],
    zoom: 11,
    bounds: [[52.25, 4.7], [52.45, 5.1]], // SW, NE corners
    statsFile: 'data/neighborhoods_with_shade_stats.geojson',
    sidewalksFile: 'data/sidewalks_web_minimal.geojson',
    detailFolder: 'data/Buurt_data/',
    detailFilePattern: '{id}_sidewalks.geojson',
    idField: 'Buurtcode',
    nameField: 'Buurt',
    indexField: 'shade_availability_index_30',
    threshold: 30,
    unit: 'neighborhood',
    unitPlural: 'neighborhoods',
    description: 'For Amsterdam, we evaluate intervals',
    colorScale: {
      poor: 0.5,
      acceptable: 0.7,
      veryGood: 0.9
    }
  },
  capetown: {
    name: 'Cape Town',
    displayName: 'Cape Town',
    center: [-33.92, 18.42],
    zoom: 11,
    bounds: [[-34.16, 18.30], [-33.58, 18.83]], // SW, NE corners (lat, lng)
    statsFile: 'data/wards_with_shade_stats.geojson',
    sidewalksFile: 'data/capetown_sidewalks_web_minimal.geojson',
    detailFolder: 'data/Ward_data/',
    detailFilePattern: 'ward_{id}.geojson',
    idField: 'WARD_NAME',
    nameField: 'WARD_NAME',
    indexField: 'shade_availability_index_50',
    threshold: 50,
    unit: 'ward',
    unitPlural: 'wards',
    description: 'For Cape Town, we evaluate intervals',
    colorScale: {
      poor: 0.3,
      acceptable: 0.5,
      veryGood: 0.7
    }
  }
};

let currentCity = 'amsterdam';

function getCurrentConfig() {
  return CITY_CONFIG[currentCity];
}

function switchCity(cityId) {
  if (cityId === currentCity) return;
  
  console.log(`Switching from ${currentCity} to ${cityId}`);
  currentCity = cityId;
  const config = getCurrentConfig();
  
  // Update UI text
  document.getElementById('mapSubtitle').textContent = `Interactive Shade Analysis`;
  document.getElementById('thresholdText').textContent = `${config.threshold}%`;
  document.getElementById('cityAnalysisText').textContent = config.description;
  document.getElementById('previewCaption').textContent = 
    `${config.displayName} ${config.unitPlural} colored by average sidewalk shade (SAI).`;
  
  // Clear existing layers completely
  if (buurtenLayer) {
    try {
      map.removeLayer(buurtenLayer);
    } catch (e) {
      console.log('Layer already removed');
    }
    buurtenLayer = null;
  }
  if (currentBuurtLayer) {
    try {
      map.removeLayer(currentBuurtLayer);
    } catch (e) {
      console.log('Detail layer already removed');
    }
    currentBuurtLayer = null;
  }
  loadedBuurten.clear();
  isDetailView = false;
  hideInfoPanel();
  
  // Clear all event listeners from old layers
  map.eachLayer((layer) => {
    if (layer.feature) {
      layer.off();
    }
  });
  
  // Show loading during switch
  showLoading();
  
  // Clear max bounds to allow navigation to new city
  map.setMaxBounds(null);
  
  // Re-center map to approximate location
  // The data loading will fit to actual bounds
  // Use stored bounds if switching back, otherwise use config center
  if (window.currentCityBounds) {
    // Just clear and let loadMapData handle the fitting
    map.setView(config.center, 10, { animate: false });
  } else {
    map.setView(config.center, 10, { animate: false });
  }
  
  // Reload data immediately (will fit to actual bounds)
  loadMapData();
}

// Get shade category label
function getShadeCategory(shadeIndex) {
  if (shadeIndex === undefined || shadeIndex === null) return 'Unknown';
  const config = getCurrentConfig();
  const scale = config.colorScale;
  if (shadeIndex < scale.poor) return 'Poor Shading';
  if (shadeIndex < scale.acceptable) return 'Acceptable';
  if (shadeIndex < scale.veryGood) return 'Very Good';
  return 'Excellent';
}

// Global variables
let map = null;
let buurtenLayer = null; // Generic layer for neighborhoods/wards
let currentBuurtLayer = null;
let loadedBuurten = new Map();
let mapInitialized = false;
let isDetailView = false;
// state for current selection (not used for now)

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
  
  const config = getCurrentConfig();
  map = L.map('map', {
    zoomControl: false,
    minZoom: 10,
    maxZoom: 19,
    scrollWheelZoom: false, // disable to allow page scroll past the map
    preferCanvas: false, // Use SVG rendering (better for data layers)
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true
  }).setView(config.center, config.zoom);

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

  // Wheel zoom hint will be set up after function definitions
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
  const contentElement = document.getElementById('buurtInfo'); // Generic info container
  if (titleElement) titleElement.textContent = title;
  if (contentElement) contentElement.innerHTML = content;
  document.getElementById('infoPanel').classList.add('active');
}

function hideInfoPanel() {
  document.getElementById('infoPanel').classList.remove('active');
}

// Style neighborhoods based on average shade
function styleNeighborhoods(feature) {
  const config = getCurrentConfig();
  const meanShade = feature.properties[`${config.indexField}_mean`] || 0;
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
  const config = getCurrentConfig();
  const shadeIndex = feature.properties[config.indexField];
  
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
    const config = getCurrentConfig();
    console.log(`Loading ${config.unit} data for ${config.name}...`);
    console.log("mapInitialized:", mapInitialized, "map object:", !!map);
    const response = await fetch(config.statsFile);
    const buurtenData = await response.json();
    
    console.log('Neighborhood data loaded:', buurtenData.features.length, 'features');
    
    buurtenLayer = L.geoJSON(buurtenData, {
      style: styleNeighborhoods,
      onEachFeature: (feature, layer) => {
        const config = getCurrentConfig();
        const props = feature.properties;
        const areaName = props[config.nameField] || 'Unknown';
        const buurtCode = props[config.idField] || props.CBS_Buurtcode || 'N/A';
        const meanShade = props[`${config.indexField}_mean`] || 0;
        const segmentCount = props[`${config.indexField}_count`] || 0;
        const coverage = props.coverage_excellent || 0;
        const category = getShadeCategory(meanShade);
        const color = getShadeColor(meanShade);

        layer.bindTooltip(`
          <strong>${config.name === 'Cape Town' ? 'Ward ' + areaName : areaName}</strong><br>
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border:1px solid #555;"></span>
            <span>Shade Quality: ${category}</span>
          </span><br>
          Average Shade Availability: ${(meanShade * 100).toFixed(0)}%<br>
          ${segmentCount} sidewalk segments
        `, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip'
        });

        layer.on('mouseover', (e) => {
          if (isDetailView) return; // no heavy hover in detail view
          layer.setStyle({ fillOpacity: 0.8, weight: 2 });
        });

        layer.on('mouseout', (e) => {
          if (isDetailView) return;
          buurtenLayer.resetStyle(e.target);
        });

        layer.on('click', (e) => {
          loadNeighborhoodDetails(buurtCode, areaName, meanShade, segmentCount, coverage, e.target);
        });
      }
    }).addTo(map);
    
    // Set map bounds
    const bounds = buurtenLayer.getBounds();
    console.log('Data bounds:', bounds);
    
    // Store the overview bounds for this city
    window.currentCityBounds = bounds;
    
    // Fit to data with padding, but ensure reasonable zoom
    map.fitBounds(bounds, { 
      padding: [20, 20],
      maxZoom: 12  // Allow appropriate zoom level
    });
    
    // Set max bounds to prevent excessive zooming out
    // Use configured bounds to allow proper viewing of the city
    if (config.bounds) {
      map.setMaxBounds(config.bounds);
    } else {
      map.setMaxBounds(bounds.pad(0.5));
    }
    
    console.log('Map initialization complete');
    
  } catch (error) {
    console.error('Error loading map data:', error);
  } finally {
    hideLoading();
    // Show city overview after loading
    if (!isDetailView) {
      showCityOverview();
    }
  }
}

// Build popup HTML for a sidewalk feature
function buildSidewalkPopup(props, shadeIndex) {
  function val(v) { return (v === null || v === undefined) ? '—' : v; }
  function pct(p) { return (p === null || p === undefined) ? '—' : `${Math.round(p)}%`; }
  const yrBuilt = val(props.Jaar_van_aanleg);
  const yrConserve = val(props.Jaar_laatste_conservering);
  const yrMaint = val(props.Jaar_uitgevoerd_onderhoud);

  const p1000 = props.shade_percent_at_1000;
  const p1300 = props.shade_percent_at_1300;
  const p1530 = props.shade_percent_at_1530;
  const p1800 = props.shade_percent_at_1800;
  const times = [
    { t: '10:00', v: p1000 },
    { t: '13:00', v: p1300 },
    { t: '15:30', v: p1530 },
    { t: '18:00', v: p1800 }
  ];

  // Mini inline SVG bar profile
  const w = 240, h = 60, pad = 6, barW = (w - pad*2 - 3*8) / 4; // 8px gaps
  let bars = '';
  times.forEach((d, i) => {
    const valPct = Math.max(0, Math.min(100, Number.isFinite(d.v) ? d.v : 0));
    const barH = (h - pad*2 - 16) * (valPct/100);
    const x = pad + i * (barW + 8);
    const y = h - pad - barH;
    const color = getShadeColor(valPct/100);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${color}" stroke="#222" stroke-width="0.5" />`;
    bars += `<text x="${x + barW/2}" y="${h - 2}" fill="#aaa" font-size="9" text-anchor="middle">${d.t}</text>`;
  });
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;

  return `
    <div style="min-width:240px;">
      <div style="font-size:12px;color:#cfcfcf;margin-bottom:8px;">
        <div><span style="color:#888;">Year of construction:</span> <strong>${yrBuilt}</strong></div>
        <div><span style="color:#888;">Last conservation:</span> <strong>${yrConserve}</strong></div>
        <div><span style="color:#888;">Last maintenance:</span> <strong>${yrMaint}</strong></div>
      </div>
      <div style="font-size:12px;color:#cfcfcf;margin-bottom:6px;">
        <span style="color:#95C11F;">Daily shade profile</span>
        <span style="color:#888;"> (10:00 / 13:00 / 15:30 / 18:00)</span>
      </div>
      <div style="margin-bottom:6px;">${svg}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#cfcfcf;">
        <div><span style="color:#888;">10:00</span> <strong>${pct(p1000)}</strong></div>
        <div><span style="color:#888;">13:00</span> <strong>${pct(p1300)}</strong></div>
        <div><span style="color:#888;">15:30</span> <strong>${pct(p1530)}</strong></div>
        <div><span style="color:#888;">18:00</span> <strong>${pct(p1800)}</strong></div>
      </div>
    </div>
  `;
}
// Enable wheel zoom only with Ctrl/⌘ and show a hint
function setupWheelZoomHint() {
  const container = map.getContainer();
  const hint = document.getElementById('zoomHint');
  let disableTimer = null;
  let keyZoom = false; // allow 'Z' key as an alternative modifier
  
  function showHint() { if (hint) hint.classList.add('show'); }
  function hideHint() { if (hint) hint.classList.remove('show'); }

  // Update hint copy for Mac friendliness
  if (hint) {
    hint.textContent = 'Hold Ctrl/⌘/Alt or press Z + scroll to zoom';
  }

  // Track a simple keyboard modifier (Z key)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') keyZoom = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'z' || e.key === 'Z') keyZoom = false;
  });

  container.addEventListener('mouseenter', () => { showHint(); });
  container.addEventListener('mouseleave', () => { hideHint(); map.scrollWheelZoom.disable(); });

  container.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || keyZoom) {
      // use wheel to zoom map and not scroll page
      e.preventDefault();
      hideHint();
      if (!map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable();
      if (disableTimer) clearTimeout(disableTimer);
      disableTimer = setTimeout(() => map.scrollWheelZoom.disable(), 800);
    } else {
      showHint();
      // leave scrollWheelZoom disabled so the page can scroll
    }
  }, { passive: false });
}

// Load detailed neighborhood data with filtering
async function loadNeighborhoodDetails(areaCode, areaName, meanShade, segmentCount, coverage, areaLayer) {
  showLoading();
  
  try {
    // Check cache first
    if (loadedBuurten.has(areaCode)) {
      console.log('Using cached data for', areaCode);
      const cachedData = loadedBuurten.get(areaCode);
      displayNeighborhoodDetails(cachedData, areaName, meanShade, segmentCount, coverage, areaLayer);
      return;
    }
    
    console.log('Loading detailed data for area:', areaCode);
    const config = getCurrentConfig();
    const filename = config.detailFilePattern.replace('{id}', areaCode);
    const response = await fetch(`${config.detailFolder}${filename}`);
    
    if (!response.ok) {
      showNeighborhoodOverview(areaName, meanShade, segmentCount, coverage);
      return;
    }
    
    const detailedData = await response.json();
    console.log(`Loaded ${detailedData.features.length} detailed features for ${areaName}`);
    
    // Cache the data
    loadedBuurten.set(areaCode, detailedData);
    
    displayNeighborhoodDetails(detailedData, areaName, meanShade, segmentCount, coverage, areaLayer);
    
  } catch (error) {
    console.error('Error loading neighborhood details:', error);
    showNeighborhoodOverview(areaName, meanShade, segmentCount, coverage);
  } finally {
    hideLoading();
  }
}

// Show neighborhood overview when no detailed data available
function showNeighborhoodOverview(areaName, meanShade, segmentCount, coverage) {
  const category = getShadeCategory(meanShade);
  const color = getShadeColor(meanShade);
  
  showInfoPanel((config.name === 'Cape Town' ? 'Ward ' + areaName : areaName), `
    <div style="margin-bottom: 16px;">
      <div class="info-stat">
        <span class="info-stat-label">Shade Quality:</span>
        <span class="info-stat-value"><span style="display:inline-block;width:10px;height:10px;background:${color};border:1px solid #555;margin-right:6px;"></span>${category}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Average Shade Availability:</span>
        <span class="info-stat-value">${(meanShade*100).toFixed(0)}%</span>
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
function displayNeighborhoodDetails(buurtData, areaName, meanShade, segmentCount, coverage, areaLayer) {
  // Switch to detail view
  isDetailView = true;
  activeSidewalkLayer = null;
  
  // Fade neighborhood layer and suspend its interactivity during detail view
  if (buurtenLayer) {
    buurtenLayer.eachLayer(l => {
      l.setStyle({ fillOpacity: 0.1, opacity: 0.3, weight: 1, color: '#333' });
      // keep handlers; only reduce visual emphasis
    });
  }
  
  // Remove previous detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
  }
  
  // Filter only sidewalks from the detailed data (if Gebruiksfunctie exists)
  const config = getCurrentConfig();
  const sidewalksOnly = buurtData.features.filter(feature => {
    // Amsterdam has Gebruiksfunctie field to filter
    if (feature.properties.Gebruiksfunctie) {
      return feature.properties.Gebruiksfunctie === 'Sidewalk';
    }
    // Cape Town - all features are sidewalks
    return true;
  });
  
  const sidewalkGeoJSON = {
    type: 'FeatureCollection',
    features: sidewalksOnly
  };
  
  // Create detailed layer with only sidewalks
  currentBuurtLayer = L.geoJSON(sidewalkGeoJSON, {
    style: styleDetailedSidewalks,
    onEachFeature: (feature, layer) => {
      const config = getCurrentConfig();
  const shadeIndex = feature.properties[config.indexField];
      const guid = feature.properties.Guid;
      const category = getShadeCategory(shadeIndex);
      const chip = getShadeColor(shadeIndex);
      
      // Inline rich tooltip (no click needed)
      // Amsterdam-specific fields (may not exist for other cities)
      const yrBuilt = (feature.properties.Jaar_van_aanleg ?? feature.properties.year_built ?? '—');
      const yrConserve = (feature.properties.Jaar_laatste_conservering ?? '—');
      const yrMaint = (feature.properties.Jaar_uitgevoerd_onderhoud ?? '—');
      const p1000 = feature.properties.shade_percent_at_1000;
      const p1300 = feature.properties.shade_percent_at_1300;
      const p1530 = feature.properties.shade_percent_at_1530;
      const p1800 = feature.properties.shade_percent_at_1800;
      
      // Only show detailed fields if they exist
      const hasDetailFields = yrBuilt !== '—' || yrConserve !== '—' || yrMaint !== '—';
      const hasTimeFields = p1000 != null || p1300 != null || p1530 != null || p1800 != null;
      const bar = (p) => `<span style=\"display:inline-block;height:6px;width:40px;background:${getShadeColor((p||0)/100)};opacity:0.9;\"></span>`;
      const tipHtml = `
        <div style="min-width:240px;">
          <div style="font-weight:600;margin-bottom:4px;">Sidewalk Segment</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="display:inline-block;width:10px;height:10px;background:${chip};border:1px solid #555;"></span>
            <span>Shade Category: ${category}</span>
            <span style="margin-left:6px;color:#888;">(${shadeIndex != null ? (shadeIndex*100).toFixed(0)+'%' : 'N/A'})</span>
          </div>
          <div style="font-size:11px;color:#cfcfcf;line-height:1.6;margin-bottom:4px;">
            <div><span style="color:#888;">Year of construction:</span> <strong>${yrBuilt}</strong></div>
            <div><span style="color:#888;">Last conservation:</span> <strong>${yrConserve}</strong></div>
            <div><span style="color:#888;">Last maintenance:</span> <strong>${yrMaint}</strong></div>
          </div>
          <div style="font-size:11px;color:#95C11F;margin-bottom:2px;">Daily shade</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#aaa;">
            <div>10:00<br>${bar(p1000)}</div>
            <div>13:00<br>${bar(p1300)}</div>
            <div>15:30<br>${bar(p1530)}</div>
            <div>18:00<br>${bar(p1800)}</div>
          </div>
        </div>`;
      layer.bindTooltip(tipHtml, { 
        permanent: false, 
        direction: 'top',
        className: 'custom-tooltip'
      });

      // No click popup — hover shows rich info
    }
  }).addTo(map);
  currentBuurtLayer.bringToFront();
  
  // Zoom to detail area
  map.fitBounds(areaLayer.getBounds(), { padding: [50, 50] });

  // Calculate statistics for sidewalks only
  const sidewalkShadeValues = sidewalksOnly
    .map(f => f.properties[config.indexField])
    .filter(val => val !== null && val !== undefined);
  
  const avgShade = sidewalkShadeValues.length > 0 ? 
    (sidewalkShadeValues.reduce((sum, val) => sum + val, 0) / sidewalkShadeValues.length) : 0;
  const maxShade = sidewalkShadeValues.length > 0 ? Math.max(...sidewalkShadeValues) : 0;
  const minShade = sidewalkShadeValues.length > 0 ? Math.min(...sidewalkShadeValues) : 0;
  
  // Category counts
  const poorCount = sidewalkShadeValues.filter(val => val < config.colorScale.poor).length;
  const acceptableCount = sidewalkShadeValues.filter(val => val >= config.colorScale.poor && val < config.colorScale.acceptable).length;
  const veryGoodCount = sidewalkShadeValues.filter(val => val >= config.colorScale.acceptable && val < config.colorScale.veryGood).length;
  const excellentCount = sidewalkShadeValues.filter(val => val >= config.colorScale.veryGood).length;
  const excellentPercentage = sidewalkShadeValues.length > 0 ? (excellentCount / sidewalkShadeValues.length * 100) : 0;
  
  showInfoPanel((config.name === 'Cape Town' ? 'Ward ' + areaName : areaName) + ' - Detail View', `
    <div style="margin-bottom: 16px;">
      <div class="info-stat">
        <span class="info-stat-label">Sidewalk Segments:</span>
        <span class="info-stat-value">${sidewalksOnly.length}</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Average Shade Availability:</span>
        <span class="info-stat-value">${(avgShade*100).toFixed(0)}%</span>
      </div>
      <div class="info-stat">
        <span class="info-stat-label">Range:</span>
        <span class="info-stat-value">${(minShade*100).toFixed(0)}% - ${(maxShade*100).toFixed(0)}%</span>
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

// Show city-level overview information
function showCityOverview() {
  const config = getCurrentConfig();
  
  // Calculate city-wide statistics
  let totalAreas = 0;
  let totalSegments = 0;
  let avgShade = 0;
  let excellentCount = 0;
  
  if (buurtenLayer) {
    buurtenLayer.eachLayer((layer) => {
      const props = layer.feature.properties;
      const meanShade = props[`${config.indexField}_mean`] || 0;
      const segmentCount = props[`${config.indexField}_count`] || 0;
      
      totalAreas++;
      totalSegments += segmentCount;
      avgShade += meanShade;
      
      if (meanShade >= 0.75) excellentCount++;
    });
    
    avgShade = totalAreas > 0 ? avgShade / totalAreas : 0;
    const excellentPercentage = totalAreas > 0 ? (excellentCount / totalAreas * 100) : 0;
    
    const category = getShadeCategory(avgShade);
    const color = getShadeColor(avgShade);
    
    showInfoPanel(`${config.displayName} Overview`, `
      <div style="margin-bottom: 16px;">
        <div class="info-stat">
          <span class="info-stat-label">${config.unitPlural.charAt(0).toUpperCase() + config.unitPlural.slice(1)}:</span>
          <span class="info-stat-value">${totalAreas}</span>
        </div>
        <div class="info-stat">
          <span class="info-stat-label">Sidewalk Segments:</span>
          <span class="info-stat-value">${totalSegments.toLocaleString()}</span>
        </div>
        <div class="info-stat">
          <span class="info-stat-label">City-wide Average:</span>
          <span class="info-stat-value">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border:1px solid #555;margin-right:6px;"></span>
            ${(avgShade*100).toFixed(0)}% (${category})
          </span>
        </div>
        <div class="info-stat">
          <span class="info-stat-label">Excellent ${config.unitPlural}:</span>
          <span class="info-stat-value">${excellentCount} (${excellentPercentage.toFixed(0)}%)</span>
        </div>
        <div class="info-stat">
          <span class="info-stat-label">Shade Threshold:</span>
          <span class="info-stat-value">${config.threshold}%</span>
        </div>
      </div>
      <div style="font-size: 12px; color: #888; margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;">
        Click any ${config.unit} to view detailed sidewalk data
      </div>
    `);
  }
}

function returnToOverview() {
  isDetailView = false;
  
  // Remove detail layer
  if (currentBuurtLayer) {
    map.removeLayer(currentBuurtLayer);
    currentBuurtLayer = null;
  }
  // Close any open popups/tooltips
  try { map.closePopup(); } catch (e) {}
  try { map.closeTooltip(); } catch (e) {}
  
  // Restore neighborhood layer
  if (buurtenLayer) {
    buurtenLayer.setStyle((feature) => styleNeighborhoods(feature));
    // Ensure tooltips work (rebind if needed)
    buurtenLayer.eachLayer((l) => {
      // If tooltips were auto-closed, let Leaflet recreate on demand via existing bindings
      if (l.closeTooltip) { try { l.closeTooltip(); } catch(e){} }
    });
    // Force an outward zoom using a maxZoom cap
    const cityBounds = buurtenLayer.getBounds();
    if (map.stop) map.stop(); // halt any ongoing animations to avoid artifacts
    map.fitBounds(cityBounds, { padding: [20, 20], maxZoom: 12, animate: true });
  }
  
  showCityOverview();
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


// City selector event listener
document.addEventListener('DOMContentLoaded', () => {
  const selector = document.getElementById('citySelector');
  if (selector) {
    selector.addEventListener('change', (e) => {
      switchCity(e.target.value);
    });
  }
  
  // Set up wheel zoom hint after everything is loaded
  if (typeof setupWheelZoomHint === 'function') {
    setupWheelZoomHint();
  }
});