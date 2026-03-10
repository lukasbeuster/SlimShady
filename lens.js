// lens.js
// Neighbourhood Analysis Layer
// Standalone — not loaded by the main site

'use strict';

const LENS = {

  // ── Configuration ────────────────────────────────────────────

  SCL_COLORS: {
    poor:      '#D9A441',
    acceptable:'#4FA3B6',
    veryGood:  '#95C11F',
    excellent: '#5B7026',
    unknown:   '#444444',
  },

  COLOR_SCALE: { poor: 0.5, acceptable: 0.7, veryGood: 0.9 },

  neighborhoods: {
    k_buurten: {
      label: 'K-Buurten',
      sublabel: 'Zuidoost',
      description: 'Urban heat island effect · High social vulnerability',
      buurtcodes: ['TH01','TH02','TH03','TH04','TH05'],
      wijk: 'K-buurt',
      stadsdeelcode: 'T',
    },
    jan_maijenbuurt: {
      label: 'Jan Maijenbuurt',
      sublabel: 'West',
      description: 'Dense · heavily paved · poorly insulated housing',
      buurtcodes: ['EK03'],
      wijk: 'Van Galenbuurt',
      stadsdeelcode: 'E',
    },
    vogelbuurt: {
      label: 'Vogelbuurt',
      sublabel: 'Noord',
      description: 'High social vulnerability · Poorly insulated dwellings',
      buurtcodes: ['NL01','NL02','NL03','NL04'],
      wijk: 'IJplein/Vogelbuurt',
      stadsdeelcode: 'N',
    },
  },

  NEIGHBORHOOD_ORDER: ['k_buurten', 'jan_maijenbuurt', 'vogelbuurt'],

  POI_COLORS: {
    bus_stop:          '#888888',
    school:            '#4A90D9',
    playground:        '#E8924A',
    community_centre:  '#C060A1',
    health_centre:     '#BF5AF2',
    market:            '#F5C518',
  },

  // ── State ────────────────────────────────────────────────────

  state: {
    activeNeighborhood: 'k_buurten',
    layerChoropleth:   true,
    layerSidewalk:     false,
    layerPOI:          false,
    basemap:           'dark',
    poiAvailable:      false,
  },

  // ── Map objects ──────────────────────────────────────────────

  map: null,
  baseLayers: { dark: null, satellite: null },

  layers: {
    choropleth:  null,   // all target neighbourhood polygons (choropleth fill)
    highlight:   null,   // active neighbourhood outlines + greyed-out rest
    sidewalk:    null,   // per-segment SAI lines
    poi:         null,   // POI circle markers
  },

  // ── Raw data ─────────────────────────────────────────────────

  data: {
    neighborhoods: null,   // FeatureCollection from neighborhoods_with_shade_stats.geojson
    sidewalkCache: {},      // buurtcode → FeatureCollection
    poiCache:      {},      // neighbourhood id → FeatureCollection
  },

  // ────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────

  init() {
    this._initMap();
    this._bindUI();
    this._loadNeighborhoodData();
  },

  _initMap() {
    this.map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: false,
    }).setView([52.375, 4.92], 12);

    this.map.zoomControl.setPosition('bottomright');

    const darkTiles = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://carto.com">CARTO</a> | © <a href="https://openstreetmap.org">OpenStreetMap</a> | © Lukas Beuster, Senseable City Lab MIT / TU Delft 3D Geoinformation',
        maxZoom: 19,
        subdomains: 'abcd',
      }
    );

    const satelliteTiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles © Esri | © Lukas Beuster, Senseable City Lab MIT / TU Delft 3D Geoinformation',
        maxZoom: 19,
      }
    );

    this.baseLayers.dark      = darkTiles;
    this.baseLayers.satellite = satelliteTiles;
    darkTiles.addTo(this.map);
  },

  // ────────────────────────────────────────────────────────────
  // DATA LOADING
  // ────────────────────────────────────────────────────────────

  async _loadNeighborhoodData() {
    this._showLoading(true);
    try {
      const resp = await fetch('data/neighborhoods_with_shade_stats.geojson');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.data.neighborhoods = await resp.json();

      // Check POI availability
      await this._checkPOIAvailability();

      this._renderChoropleth();
      this._updateSidebar();
      this._zoomToActiveNeighborhood();
    } catch (err) {
      console.error('[LENS] Failed to load neighbourhood data:', err);
    } finally {
      this._showLoading(false);
    }
  },

  async _checkPOIAvailability() {
    const nhId = this.state.activeNeighborhood;
    const nhLabel = this.neighborhoods[nhId].label.toLowerCase().replace(/\s+/g, '_');
    try {
      const resp = await fetch(`data/euroasis/${nhLabel}_pois.geojson`, { method: 'HEAD' });
      this.state.poiAvailable = resp.ok;
    } catch (_) {
      this.state.poiAvailable = false;
    }
    this._updatePOIToggle();
  },

  _updatePOIToggle() {
    const checkbox = document.getElementById('layer-poi');
    const statusSpan = document.getElementById('poi-status');
    if (this.state.poiAvailable) {
      checkbox.disabled = false;
      statusSpan.textContent = '';
      statusSpan.style.display = 'none';
    } else {
      checkbox.disabled = true;
      checkbox.checked = false;
      statusSpan.textContent = '(data pending)';
      statusSpan.style.display = '';
    }
  },

  // ────────────────────────────────────────────────────────────
  // CHOROPLETH RENDERING
  // ────────────────────────────────────────────────────────────

  _renderChoropleth() {
    if (!this.data.neighborhoods) return;

    // Collect all target buurtcodes
    const allCodes = new Set();
    Object.values(this.neighborhoods).forEach(nh => nh.buurtcodes.forEach(c => allCodes.add(c)));

    const activeCodes = new Set(this.neighborhoods[this.state.activeNeighborhood].buurtcodes);
    const worstCode = this._getWorstBuurtCode(this.state.activeNeighborhood);

    // Remove old layers
    this._removeLayer('choropleth');
    this._removeLayer('highlight');

    // Build two separate layers: background (greyed) + active highlight
    const backgroundFeatures = [];
    const activeFeatures = [];
    const worstFeatures = [];

    this.data.neighborhoods.features.forEach(f => {
      const code = f.properties.Buurtcode;
      if (!allCodes.has(code)) return;
      if (activeCodes.has(code)) {
        if (code === worstCode) {
          worstFeatures.push(f);
        } else {
          activeFeatures.push(f);
        }
      } else {
        backgroundFeatures.push(f);
      }
    });

    // Background dim layer
    if (backgroundFeatures.length) {
      this.layers.choropleth = L.geoJSON(
        { type: 'FeatureCollection', features: backgroundFeatures },
        {
          style: f => ({
            fillColor: this._shadeColor(this._getMeanSAI(f.properties)),
            weight: 0.5,
            opacity: 0.3,
            color: '#222',
            fillOpacity: 0.12,
          }),
          onEachFeature: (f, l) => this._bindNeighbourhoodTooltip(f, l, false),
        }
      ).addTo(this.map);
    }

    // Active neighbourhood layer
    const activeLayer = L.geoJSON(
      { type: 'FeatureCollection', features: activeFeatures },
      {
        style: f => ({
          fillColor: this._shadeColor(this._getMeanSAI(f.properties)),
          weight: 2,
          opacity: 1,
          color: '#ffffff',
          dashArray: '6 4',
          fillOpacity: this.state.basemap === 'satellite' ? 0.7 : 0.6,
        }),
        onEachFeature: (f, l) => this._bindNeighbourhoodTooltip(f, l, true),
      }
    ).addTo(this.map);

    // Worst buurt — pulsing highlight
    let worstLayer = null;
    if (worstFeatures.length) {
      worstLayer = L.geoJSON(
        { type: 'FeatureCollection', features: worstFeatures },
        {
          style: f => ({
            fillColor: this._shadeColor(this._getMeanSAI(f.properties)),
            weight: 3,
            opacity: 1,
            color: '#ffffff',
            dashArray: '6 4',
            fillOpacity: this.state.basemap === 'satellite' ? 0.7 : 0.6,
            className: 'worst-buurt-pulse',
          }),
          onEachFeature: (f, l) => this._bindNeighbourhoodTooltip(f, l, true),
        }
      ).addTo(this.map);
    }

    // Store as highlight layer (composite)
    this.layers.highlight = { activeLayer, worstLayer };
  },

  _bindNeighbourhoodTooltip(feature, layer, isActive) {
    const p = feature.properties;
    const sai = this._getMeanSAI(p);
    const cat = this._shadeCategory(sai);
    const color = this._shadeColor(sai);
    const saiText = sai !== null ? `${(sai * 100).toFixed(0)}%` : 'N/A';

    layer.bindTooltip(`
      <strong>${p.Buurt || '—'}</strong><br>
      <span style="display:inline-flex;align-items:center;gap:5px;">
        <span style="display:inline-block;width:8px;height:8px;background:${color};"></span>
        ${cat} · SAI ${saiText}
      </span>
    `, {
      permanent: false,
      direction: 'top',
      className: 'ea-tooltip',
    });

    if (isActive) {
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.85 }));
      layer.on('mouseout', () => layer.setStyle({ fillOpacity: this.state.basemap === 'satellite' ? 0.7 : 0.6 }));
    }
  },

  // ────────────────────────────────────────────────────────────
  // NEIGHBOURHOOD SELECTION
  // ────────────────────────────────────────────────────────────

  selectNeighborhood(id) {
    if (!(id in this.neighborhoods)) return;
    this.state.activeNeighborhood = id;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === id);
    });

    // Re-render map layers
    this._renderChoropleth();
    if (this.state.layerSidewalk) {
      this._removeLayer('sidewalk');
      this._loadSidewalkLayer();
    }
    if (this.state.layerPOI) {
      this._removeLayer('poi');
      this._loadPOILayer();
    }

    this._updateSidebar();
    this._zoomToActiveNeighborhood();
    this._checkPOIAvailability();
  },

  _zoomToActiveNeighborhood() {
    if (!this.data.neighborhoods) return;
    const codes = new Set(this.neighborhoods[this.state.activeNeighborhood].buurtcodes);
    const features = this.data.neighborhoods.features.filter(f => codes.has(f.properties.Buurtcode));
    if (!features.length) return;

    const tempLayer = L.geoJSON({ type: 'FeatureCollection', features });
    const bounds = tempLayer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  },

  // ────────────────────────────────────────────────────────────
  // SIDEBAR STATS
  // ────────────────────────────────────────────────────────────

  _updateSidebar() {
    const loadingEl = document.getElementById('stats-loading');
    const contentEl = document.getElementById('stats-content');

    if (!this.data.neighborhoods) {
      loadingEl.style.display = '';
      contentEl.style.display = 'none';
      return;
    }

    loadingEl.style.display = 'none';
    contentEl.style.display = '';

    const nhId = this.state.activeNeighborhood;
    const nh = this.neighborhoods[nhId];
    const codes = new Set(nh.buurtcodes);

    // Filter relevant features
    const features = this.data.neighborhoods.features.filter(
      f => codes.has(f.properties.Buurtcode)
    );

    // Compute group SAI
    const saiValues = features
      .map(f => this._getMeanSAI(f.properties))
      .filter(v => v !== null);

    const avgSAI = saiValues.length
      ? saiValues.reduce((a, b) => a + b, 0) / saiValues.length
      : null;

    document.getElementById('stats-name').textContent = nh.label;
    document.getElementById('stats-stadsdeel').textContent = nh.sublabel;
    document.getElementById('stats-description').textContent = nh.description;

    // Coverage bar
    const fillEl = document.getElementById('shade-bar-fill');
    const valEl  = document.getElementById('shade-bar-value');
    const pct = avgSAI !== null ? Math.round(avgSAI * 100) : 0;
    fillEl.style.width = `${pct}%`;
    valEl.textContent  = avgSAI !== null ? `${pct}% avg SAI` : 'N/A';

    // Quality breakdown
    const cs = this.COLOR_SCALE;
    const cats = [
      { key: 'Poor',      color: this.SCL_COLORS.poor,      filter: v => v < cs.poor },
      { key: 'Acceptable',color: this.SCL_COLORS.acceptable, filter: v => v >= cs.poor && v < cs.acceptable },
      { key: 'Very Good', color: this.SCL_COLORS.veryGood,   filter: v => v >= cs.acceptable && v < cs.veryGood },
      { key: 'Excellent', color: this.SCL_COLORS.excellent,  filter: v => v >= cs.veryGood },
    ];

    const breakdownEl = document.getElementById('quality-breakdown');
    breakdownEl.innerHTML = cats.map(cat => {
      const matching = features.filter(f => {
        const v = this._getMeanSAI(f.properties);
        return v !== null && cat.filter(v);
      });
      if (!matching.length) return '';
      const avgCat = matching.reduce((s, f) => s + this._getMeanSAI(f.properties), 0) / matching.length;
      return `<div class="quality-row">
        <span class="quality-swatch" style="background:${cat.color};"></span>
        <span class="quality-cat">${cat.key}</span>
        <span class="quality-detail">${matching.length} buurt${matching.length > 1 ? 'en' : ''}, SAI ${(avgCat * 100).toFixed(0)}%</span>
      </div>`;
    }).join('');

    // Extremes
    const sorted = [...features].sort((a, b) => {
      const va = this._getMeanSAI(a.properties) ?? -1;
      const vb = this._getMeanSAI(b.properties) ?? -1;
      return va - vb;
    });
    const worst = sorted[0];
    const best  = sorted[sorted.length - 1];

    const extremesEl = document.getElementById('stats-extremes');
    const worstSAI = worst ? this._getMeanSAI(worst.properties) : null;
    const bestSAI  = best  ? this._getMeanSAI(best.properties)  : null;
    extremesEl.innerHTML = `
      <div class="extremes-row">
        <span class="extremes-label">Worst: </span>
        <span class="extremes-value">${worst?.properties?.Buurt || '—'}</span>
        ${worstSAI !== null ? ` <span class="extremes-label"> — SAI </span><span class="extremes-value" style="color:${this._shadeColor(worstSAI)}">${(worstSAI*100).toFixed(0)}%</span>` : ''}
      </div>
      <div class="extremes-row">
        <span class="extremes-label">Best:  </span>
        <span class="extremes-value">${best?.properties?.Buurt || '—'}</span>
        ${bestSAI !== null ? ` <span class="extremes-label"> — SAI </span><span class="extremes-value" style="color:${this._shadeColor(bestSAI)}">${(bestSAI*100).toFixed(0)}%</span>` : ''}
      </div>
    `;

    // Time-of-day strip (computed async from sidewalk data if cached, else skip)
    this._updateTimeStrip(nh.buurtcodes);
  },

  async _updateTimeStrip(buurtcodes) {
    const timeStripEl = document.getElementById('time-strip');
    timeStripEl.innerHTML = '<div class="stats-label" style="color:#444;font-size:9px;">Loading sidewalk averages...</div>';

    // Try to load sidewalk data for all buurtcodes (use cache)
    const allFeatures = [];
    for (const code of buurtcodes) {
      if (!this.data.sidewalkCache[code]) {
        try {
          const resp = await fetch(`data/Buurt_data/${code}_sidewalks.geojson`);
          if (resp.ok) {
            const gj = await resp.json();
            this.data.sidewalkCache[code] = gj;
          }
        } catch (_) { /* skip */ }
      }
      if (this.data.sidewalkCache[code]) {
        const sidewalkFeatures = (this.data.sidewalkCache[code].features || []).filter(
          f => f.properties.Gebruiksfunctie === 'Sidewalk'
        );
        if (sidewalkFeatures.length === 0) {
          console.warn(`[LENS] No sidewalk features found in ${code}_sidewalks.geojson`);
        }
        allFeatures.push(...sidewalkFeatures);
      }
    }

    if (!allFeatures.length) {
      timeStripEl.innerHTML = '<div style="font-size:10px;color:#444;">No sidewalk data</div>';
      return;
    }

    const times = [
      { key: 'shade_percent_at_1000', label: '10:00' },
      { key: 'shade_percent_at_1300', label: '13:00' },
      { key: 'shade_percent_at_1530', label: '15:30' },
      { key: 'shade_percent_at_1800', label: '18:00' },
    ];

    const avgs = times.map(t => {
      const vals = allFeatures
        .map(f => f.properties[t.key])
        .filter(v => v !== null && v !== undefined && isFinite(v));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { label: t.label, avg };
    });

    const maxAvg = Math.max(...avgs.map(a => a.avg), 1);

    timeStripEl.innerHTML = `
      <div class="time-strip">
        ${avgs.map(a => {
          const pct = Math.round(a.avg);
          const heightPct = (a.avg / maxAvg) * 100;
          const color = this._shadeColor(a.avg / 100);
          return `<div class="time-col">
            <div class="time-bar-wrap">
              <div class="time-bar" style="height:${heightPct}%;background:${color};"></div>
            </div>
            <div class="time-label">${a.label}</div>
            <div class="time-value">${pct}%</div>
          </div>`;
        }).join('')}
      </div>
    `;
  },

  // ────────────────────────────────────────────────────────────
  // SIDEWALK DETAIL LAYER
  // ────────────────────────────────────────────────────────────

  async _loadSidewalkLayer() {
    if (!this.state.layerSidewalk) return;
    this._showLoading(true);

    const codes = this.neighborhoods[this.state.activeNeighborhood].buurtcodes;
    const allFeatures = [];

    for (const code of codes) {
      if (!this.data.sidewalkCache[code]) {
        try {
          const resp = await fetch(`data/Buurt_data/${code}_sidewalks.geojson`);
          if (resp.ok) {
            this.data.sidewalkCache[code] = await resp.json();
          } else {
            console.warn(`[LENS] Sidewalk file not found: ${code}`);
          }
        } catch (err) {
          console.error(`[LENS] Error loading sidewalks for ${code}:`, err);
        }
      }

      if (this.data.sidewalkCache[code]) {
        const sidewalkFeatures = (this.data.sidewalkCache[code].features || []).filter(
          f => f.properties.Gebruiksfunctie === 'Sidewalk'
        );
        if (sidewalkFeatures.length === 0) {
          console.warn(`[LENS] No sidewalk features found in ${code}_sidewalks.geojson`);
        }
        allFeatures.push(...sidewalkFeatures);
      }
    }

    this._showLoading(false);

    if (!allFeatures.length) {
      console.warn('[LENS] No sidewalk features found for active neighbourhood');
      return;
    }

    this._removeLayer('sidewalk');

    this.layers.sidewalk = L.geoJSON(
      { type: 'FeatureCollection', features: allFeatures },
      {
        style: f => {
          const sai = f.properties.shade_availability_index_30;
          return {
            color:       this._shadeColor(sai),
            weight:      2.5,
            opacity:     0.9,
            fillColor:   this._shadeColor(sai),
            fillOpacity: 0.75,
          };
        },
        onEachFeature: (f, l) => {
          const p = f.properties;
          const sai = p.shade_availability_index_30;
          const color = this._shadeColor(sai);
          const saiText = sai !== null ? `${(sai * 100).toFixed(0)}%` : 'N/A';

          const pct = v => (v === null || v === undefined) ? '—' : `${Math.round(v)}%`;

          l.bindTooltip(`
            <div>
              <strong>${p.Buurt || '—'}</strong><br>
              <span style="display:inline-flex;align-items:center;gap:5px;margin:2px 0;">
                <span style="display:inline-block;width:8px;height:8px;background:${color};"></span>
                SAI ${saiText}
              </span><br>
              <span style="color:#888;">10:00</span> ${pct(p.shade_percent_at_1000)} &nbsp;
              <span style="color:#888;">13:00</span> ${pct(p.shade_percent_at_1300)}<br>
              <span style="color:#888;">15:30</span> ${pct(p.shade_percent_at_1530)} &nbsp;
              <span style="color:#888;">18:00</span> ${pct(p.shade_percent_at_1800)}
            </div>
          `, {
            permanent: false,
            direction: 'top',
            className: 'ea-tooltip',
          });
        },
      }
    ).addTo(this.map);

    this.layers.sidewalk.bringToFront();
  },

  // ────────────────────────────────────────────────────────────
  // POI LAYER
  // ────────────────────────────────────────────────────────────

  async _loadPOILayer() {
    if (!this.state.layerPOI || !this.state.poiAvailable) return;
    this._showLoading(true);

    const nhId = this.state.activeNeighborhood;
    const nhLabel = this.neighborhoods[nhId].label.toLowerCase().replace(/\s+/g, '_');

    if (!this.data.poiCache[nhId]) {
      try {
        const resp = await fetch(`data/euroasis/${nhLabel}_pois.geojson`);
        if (!resp.ok) {
          console.warn(`[LENS] POI file not found: ${nhLabel}_pois.geojson`);
          this._showLoading(false);
          return;
        }
        this.data.poiCache[nhId] = await resp.json();
      } catch (err) {
        console.error('[LENS] Error loading POI data:', err);
        this._showLoading(false);
        return;
      }
    }

    this._showLoading(false);
    this._removeLayer('poi');

    this.layers.poi = L.geoJSON(this.data.poiCache[nhId], {
      pointToLayer: (f, latlng) => {
        const type  = f.properties.type || 'bus_stop';
        const color = this.POI_COLORS[type] || '#888';
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: color,
          color: '#000',
          weight: 1,
          fillOpacity: 0.85,
        });
      },
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindPopup(`
          <div style="font-family:'Courier New',monospace;font-size:11px;min-width:160px;">
            <strong>${p.name || 'Unnamed'}</strong><br>
            <span style="color:#888;">Type: </span>${p.type || '—'}<br>
            <span style="color:#888;">Dwell potential: </span>${p.dwell_potential || '—'}
          </div>
        `, { className: 'ea-poi-popup' });
      },
    }).addTo(this.map);
  },

  // ────────────────────────────────────────────────────────────
  // LAYER TOGGLE
  // ────────────────────────────────────────────────────────────

  toggleLayer(name, enabled) {
    switch (name) {
      case 'choropleth':
        this.state.layerChoropleth = enabled;
        if (enabled) {
          this._renderChoropleth();
        } else {
          this._removeLayer('choropleth');
          if (this.layers.highlight) {
            if (this.layers.highlight.activeLayer) this.map.removeLayer(this.layers.highlight.activeLayer);
            if (this.layers.highlight.worstLayer)  this.map.removeLayer(this.layers.highlight.worstLayer);
            this.layers.highlight = null;
          }
        }
        break;

      case 'sidewalk':
        this.state.layerSidewalk = enabled;
        if (enabled) {
          this._loadSidewalkLayer();
        } else {
          this._removeLayer('sidewalk');
        }
        break;

      case 'poi':
        this.state.layerPOI = enabled;
        if (enabled) {
          this._loadPOILayer();
        } else {
          this._removeLayer('poi');
        }
        break;
    }
  },

  // ────────────────────────────────────────────────────────────
  // BASEMAP TOGGLE
  // ────────────────────────────────────────────────────────────

  toggleBasemap(type) {
    if (type === this.state.basemap) return;
    this.state.basemap = type;

    const old = type === 'satellite' ? this.baseLayers.dark : this.baseLayers.satellite;
    const next = type === 'satellite' ? this.baseLayers.satellite : this.baseLayers.dark;

    if (old && this.map.hasLayer(old)) this.map.removeLayer(old);
    if (next && !this.map.hasLayer(next)) next.addTo(this.map);
    if (next) next.bringToBack();

    // Re-render choropleth with adjusted opacity for satellite
    if (this.state.layerChoropleth) {
      this._renderChoropleth();
    }
  },

  // ────────────────────────────────────────────────────────────
  // UI BINDINGS
  // ────────────────────────────────────────────────────────────

  _bindUI() {
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectNeighborhood(btn.dataset.id));
    });

    // Prev/next arrows
    document.getElementById('nav-prev').addEventListener('click', () => {
      const idx = this.NEIGHBORHOOD_ORDER.indexOf(this.state.activeNeighborhood);
      const prev = this.NEIGHBORHOOD_ORDER[(idx - 1 + this.NEIGHBORHOOD_ORDER.length) % this.NEIGHBORHOOD_ORDER.length];
      this.selectNeighborhood(prev);
    });

    document.getElementById('nav-next').addEventListener('click', () => {
      const idx = this.NEIGHBORHOOD_ORDER.indexOf(this.state.activeNeighborhood);
      const next = this.NEIGHBORHOOD_ORDER[(idx + 1) % this.NEIGHBORHOOD_ORDER.length];
      this.selectNeighborhood(next);
    });

    // Keyboard arrows
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') {
        const idx = this.NEIGHBORHOOD_ORDER.indexOf(this.state.activeNeighborhood);
        this.selectNeighborhood(
          this.NEIGHBORHOOD_ORDER[(idx - 1 + this.NEIGHBORHOOD_ORDER.length) % this.NEIGHBORHOOD_ORDER.length]
        );
      } else if (e.key === 'ArrowRight') {
        const idx = this.NEIGHBORHOOD_ORDER.indexOf(this.state.activeNeighborhood);
        this.selectNeighborhood(
          this.NEIGHBORHOOD_ORDER[(idx + 1) % this.NEIGHBORHOOD_ORDER.length]
        );
      }
    });

    // Layer toggles
    document.getElementById('layer-choropleth').addEventListener('change', e => {
      this.toggleLayer('choropleth', e.target.checked);
    });
    document.getElementById('layer-sidewalk').addEventListener('change', e => {
      this.toggleLayer('sidewalk', e.target.checked);
    });
    document.getElementById('layer-poi').addEventListener('change', e => {
      if (!e.target.disabled) this.toggleLayer('poi', e.target.checked);
    });

    // Basemap radio
    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
      radio.addEventListener('change', e => {
        if (e.target.checked) this.toggleBasemap(e.target.value);
      });
    });
  },

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  _getMeanSAI(props) {
    const v = props?.shade_availability_index_30_mean;
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  },

  _shadeColor(sai) {
    if (sai === null || sai === undefined) return this.SCL_COLORS.unknown;
    const cs = this.COLOR_SCALE;
    if (sai < cs.poor)       return this.SCL_COLORS.poor;
    if (sai < cs.acceptable) return this.SCL_COLORS.acceptable;
    if (sai < cs.veryGood)   return this.SCL_COLORS.veryGood;
    return this.SCL_COLORS.excellent;
  },

  _shadeCategory(sai) {
    if (sai === null || sai === undefined) return 'Unknown';
    const cs = this.COLOR_SCALE;
    if (sai < cs.poor)       return 'Poor';
    if (sai < cs.acceptable) return 'Acceptable';
    if (sai < cs.veryGood)   return 'Very Good';
    return 'Excellent';
  },

  _getWorstBuurtCode(nhId) {
    if (!this.data.neighborhoods) return null;
    const codes = new Set(this.neighborhoods[nhId].buurtcodes);
    let worstCode = null;
    let worstVal  = Infinity;
    this.data.neighborhoods.features.forEach(f => {
      const code = f.properties.Buurtcode;
      if (!codes.has(code)) return;
      const sai = this._getMeanSAI(f.properties);
      if (sai !== null && sai < worstVal) {
        worstVal  = sai;
        worstCode = code;
      }
    });
    return worstCode;
  },

  _removeLayer(name) {
    const layer = this.layers[name];
    if (!layer) return;
    // Handle composite highlight layer
    if (name === 'highlight' || (layer && typeof layer === 'object' && layer.activeLayer)) {
      if (layer.activeLayer && this.map.hasLayer(layer.activeLayer)) this.map.removeLayer(layer.activeLayer);
      if (layer.worstLayer  && this.map.hasLayer(layer.worstLayer))  this.map.removeLayer(layer.worstLayer);
      this.layers[name] = null;
    } else if (layer && this.map.hasLayer(layer)) {
      this.map.removeLayer(layer);
      this.layers[name] = null;
    }
  },

  _showLoading(show) {
    const el = document.getElementById('ea-loading');
    if (!el) return;
    el.classList.toggle('show', show);
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => LENS.init());
