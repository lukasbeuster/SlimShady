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
  
  map = L.map('map', {
    zoomControl: false,
    minZoom: 10,
    maxZoom: 19,
    scrollWheelZoom: false // disable to allow page scroll past the map
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

  // Friendly scroll/zoom behavior: page scroll by default, Ctrl+wheel to zoom
  setupWheelZoomHint();
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
function displayNeighborhoodDetails(buurtData, buurtName, meanShade, segmentCount, coverage, buurtLayer) {
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
      
      // Inline rich tooltip (no click needed)
      const yrBuilt = (feature.properties.Jaar_van_aanleg ?? '—');
      const yrConserve = (feature.properties.Jaar_laatste_conservering ?? '—');
      const yrMaint = (feature.properties.Jaar_uitgevoerd_onderhoud ?? '—');
      const p1000 = feature.properties.shade_percent_at_1000;
      const p1300 = feature.properties.shade_percent_at_1300;
      const p1530 = feature.properties.shade_percent_at_1530;
      const p1800 = feature.properties.shade_percent_at_1800;
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
