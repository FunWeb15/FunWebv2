/* sims.js
   Professional, full-featured simulation script (drop-in replacement).
   - DPR-aware canvas & graph handling
   - Zones: normal / boost / slow with multipliers & particle effects
   - Trails, velocity vectors, glow
   - Mass affects speed (pedagogical: speed ∝ (baseSpeed * speedMult * zoneMult) / mass)
   - Friction (global resistance), turbo (time-scaling)
   - Unit toggle (m/s <-> km/h) using your <select id="unitToggle">
   - Live Distance & Speed readouts for A and B
   - Distance vs Time and Speed vs Time graphs with axes, ticks, hover tooltip
   - Teacher mode, keyboard (Space/R), touch behavior
   - Defensive checks for missing DOM elements (won't break)
   - Modular, commented, performance-considered
*/

(function () {
  'use strict';

  // ------------------------
  // Utility helpers
  // ------------------------
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, p = 2) => (isFinite(v) ? v.toFixed(p) : '0');
  const nowMs = () => performance.now();

  function hexToRgba(hex = '#ffffff', a = 1) {
    try {
      const h = hex.replace('#', '');
      const bigint = parseInt(h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r},${g},${b},${a})`;
    } catch (e) {
      return `rgba(255,255,255,${a})`;
    }
  }

  // Read CSS color variables (fallbacks)
  const css = getComputedStyle(document.documentElement);
  const COLOR_A = (css.getPropertyValue('--objA') || '#ff3cac').trim();
  const COLOR_B = (css.getPropertyValue('--objB') || '#10f0ff').trim();
  const ZONE_NORMAL = (css.getPropertyValue('--zone-normal') || '#1ccfff').trim();
  const ZONE_BOOST = (css.getPropertyValue('--zone-boost') || '#00ff85').trim();
  const ZONE_SLOW = (css.getPropertyValue('--zone-slow') || '#ff8c00').trim();

  // ------------------------
  // DOM bindings (defensive)
  // ------------------------
  const trackCanvas = $('trackCanvas');
  const distGraph = $('distGraph');
  const speedGraph = $('speedGraph');
  const tooltip = $('tooltip');

  if (!trackCanvas || !distGraph || !speedGraph) {
    console.error('Required canvas elements (#trackCanvas, #distGraph, #speedGraph) are missing from HTML.');
    return;
  }

  const trackCtx = trackCanvas.getContext('2d');
  const distCtx = distGraph.getContext('2d');
  const speedCtx = speedGraph.getContext('2d');

  // Controls / readouts
  const speedDisplay = $('speedDisplay') || null;
  const distAEl = $('distanceDisplayA') || null;
  const distBEl = $('distanceDisplayB') || null;
  const computedSpeedEl = $('computedSpeed') || null;
  const computedUnitEl = $('computedUnit') || null;

  const startBtn = $('startBtn');
  const pauseBtn = $('pauseBtn');
  const resetBtn = $('resetBtn');

  const distanceRange = $('distanceRange');
  const distanceInput = $('distanceInput');
  const timeRange = $('timeRange');
  const timeInput = $('timeInput');

  const frictionRange = $('frictionRange');
  const frictionInput = $('frictionInput');

  const turboRange = $('turboRange');
  const turboInput = $('turboInput');

  const massARange = $('massARange');
  const massAInput = $('massAInput');
  const speedAMultRange = $('speedAMultRange');
  const speedAMultInput = $('speedAMultInput');

  const massBRange = $('massBRange');
  const massBInput = $('massBInput');
  const speedBMultRange = $('speedBMultRange');
  const speedBMultInput = $('speedBMultInput');

  const unitSelect = $('unitToggle'); // <select> with values 'm_s' or 'km_h'
  const teacherToggle = $('teacherToggle');
  const teacherPanel = $('teacherPanel');

  // provide safe fallbacks if optional inputs not present
  function safeEl(el, name) {
    if (!el) console.warn(`Optional element #${name} not found; UI will be limited.`);
    return el;
  }

  safeEl(speedDisplay, 'speedDisplay');
  safeEl(distAEl, 'distanceDisplayA');
  safeEl(distBEl, 'distanceDisplayB');

  // ------------------------
  // Simulation state
  // ------------------------
  const state = {
    running: false,
    lastTs: null,
    simTime: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    // track geometry in device pixels (set in resize)
    width: 1000,
    height: 400,
    trackPad: 60,
    trackStartPx: 60,
    trackEndPx: 940,
    trackLenPx: 880,
    // zones will be computed
    zones: []
  };

  // objects: keep structural parity with earlier code
  const objects = {
    A: { id: 'A', color: COLOR_A, mass: 1.0, speedMult: 1.0, covered_m: 0, trail: [] },
    B: { id: 'B', color: COLOR_B, mass: 1.2, speedMult: 0.98, covered_m: 0, trail: [] }
  };

  // graph samples (bounded size)
  const samples = {
    t: [],
    aDist: [],
    bDist: [],
    aSpeed: [],
    bSpeed: [],
    max: 1500
  };

  // particles for boost zone visual
  const particles = [];

  // ------------------------
  // Resize handling & DPR-aware canvases
  // ------------------------
  function resizeAll() {
    try {
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);

      // track canvas matches parent
      const wrapRect = trackCanvas.parentElement.getBoundingClientRect();
      // enforce minimum sizes in physical pixels
      const cw = Math.max(600, Math.floor(wrapRect.width * state.dpr));
      const ch = Math.max(300, Math.floor(wrapRect.height * state.dpr));
      trackCanvas.width = cw;
      trackCanvas.height = ch;
      trackCanvas.style.width = `${wrapRect.width}px`;
      trackCanvas.style.height = `${wrapRect.height}px`;

      // graphs
      const dRect = distGraph.getBoundingClientRect();
      const sRect = speedGraph.getBoundingClientRect();
      distGraph.width = Math.max(300, Math.floor(dRect.width * state.dpr));
      distGraph.height = Math.max(120, Math.floor(dRect.height * state.dpr));
      speedGraph.width = Math.max(300, Math.floor(sRect.width * state.dpr));
      speedGraph.height = Math.max(120, Math.floor(sRect.height * state.dpr));

      state.width = trackCanvas.width;
      state.height = trackCanvas.height;

      computeZones();
      // redraw static layers
      drawStaticTrack();
      drawFrame();
      drawGraphs();
    } catch (e) {
      console.warn('resizeAll failed', e);
    }
  }

  window.addEventListener('resize', () => setTimeout(resizeAll, 60));
  window.addEventListener('orientationchange', () => setTimeout(resizeAll, 140));

  // ------------------------
  // Zones (visual & multipliers)
  // ------------------------
  function computeZones() {
    const pad = Math.round(state.width * 0.06);
    const startX = pad;
    const endX = state.width - pad;
    const total = endX - startX;
    const normalW = total * 0.35;
    const boostW = total * 0.3;
    const slowW = total - (normalW + boostW);

    state.trackPad = pad;
    state.trackStartPx = startX;
    state.trackEndPx = endX;
    state.trackLenPx = total;

    state.zones = [
      { id: 'normal', x: startX, w: normalW, color: ZONE_NORMAL, multiplier: 1.0 },
      { id: 'boost', x: startX + normalW, w: boostW, color: ZONE_BOOST, multiplier: 1.5 },
      { id: 'slow', x: startX + normalW + boostW, w: slowW, color: ZONE_SLOW, multiplier: 0.6 }
    ];
  }

  function zoneAtPx(px) {
    for (const z of state.zones) if (px >= z.x && px <= z.x + z.w) return z;
    return state.zones[0];
  }

  // ------------------------
  // Unit helpers
  // ------------------------
  function isKmHSelected() {
    if (!unitSelect) return false;
    // unitSelect is <select> with values e.g. 'm_s' or 'km_h'
    return (unitSelect.value === 'km_h' || unitSelect.value === 'km/h');
  }

  // base speed in m/s (Distance / Time)
  function baseSpeed_mps() {
    // Distance and Time inputs may be absent; fall back to defaults
    const d = (distanceInput && Number(distanceInput.value)) || (distanceRange && Number(distanceRange.value)) || 100;
    const t = (timeInput && Number(timeInput.value)) || (timeRange && Number(timeRange.value)) || 10;
    if (isKmHSelected()) {
      // if UI in km/h, we assume distanceInput is km and timeInput is hours
      // convert: km -> m, hours -> s
      const d_m = d * 1000;
      const t_s = Math.max(0.0001, t * 3600);
      return d_m / t_s;
    } else {
      const d_m = d;
      const t_s = Math.max(0.0001, t);
      return d_m / t_s;
    }
  }

  function formatSpeedDisplay(mps) {
    if (isKmHSelected()) {
      return (mps * 3.6).toFixed(2) + ' km/h';
    } else {
      return mps.toFixed(2) + ' m/s';
    }
  }

  function formatDistanceDisplay(m) {
    if (isKmHSelected()) return (m / 1000).toFixed(3) + ' km';
    return m.toFixed(2) + ' m';
  }

  // ------------------------
  // UI Binding helpers
  // ------------------------
  function bindRangeNumber(rangeEl, numEl, onChange) {
    if (!rangeEl || !numEl) return;
    rangeEl.addEventListener('input', () => {
      numEl.value = rangeEl.value;
      try { onChange && onChange(); } catch (e) { console.warn(e); }
    });
    numEl.addEventListener('change', () => {
      let v = parseFloat(numEl.value);
      if (!isFinite(v)) v = parseFloat(rangeEl.value) || 0;
      v = clamp(v, Number(rangeEl.min || -Infinity), Number(rangeEl.max || Infinity));
      numEl.value = v;
      rangeEl.value = v;
      try { onChange && onChange(); } catch (e) { console.warn(e); }
    });
  }

  // Connect pairs if they exist
  bindRangeNumber(distanceRange, distanceInput, () => { drawStaticTrack(); drawGraphs(); });
  bindRangeNumber(timeRange, timeInput, () => { drawStaticTrack(); drawGraphs(); });
  bindRangeNumber(frictionRange, frictionInput, () => {});
  bindRangeNumber(turboRange, turboInput, () => {});
  bindRangeNumber(massARange, massAInput, () => objects.A.mass = Number(massAInput.value));
  bindRangeNumber(massBRange, massBInput, () => objects.B.mass = Number(massBInput.value));
  bindRangeNumber(speedAMultRange, speedAMultInput, () => objects.A.speedMult = Number(speedAMultInput.value));
  bindRangeNumber(speedBMultRange, speedBMultInput, () => objects.B.speedMult = Number(speedBMultInput.value));

  // Unit select changes: update computed label units and display formatting
  if (unitSelect) {
    unitSelect.addEventListener('change', () => {
      if (computedUnitEl) {
        computedUnitEl.textContent = isKmHSelected() ? 'km/h' : 'm/s';
      }
      // refresh displays & graphs
      updateDisplays(0);
      drawGraphs();
    });
  }

  // Teacher toggle
  if (teacherToggle && teacherPanel) {
    teacherToggle.addEventListener('change', () => {
      teacherPanel.hidden = !teacherToggle.checked;
    });
  }

  // ------------------------
  // Simulation Controls
  // ------------------------
  function resetSimulation() {
    state.running = false;
    state.lastTs = null;
    state.simTime = 0;

    // reset objects
    objects.A.covered_m = 0;
    objects.B.covered_m = 0;
    objects.A.trail = [];
    objects.B.trail = [];

    // reset samples
    samples.t.length = 0;
    samples.aDist.length = 0;
    samples.bDist.length = 0;
    samples.aSpeed.length = 0;
    samples.bSpeed.length = 0;

    particles.length = 0;
    updateDisplays(0);
    drawStaticTrack();
    drawFrame();
    drawGraphs();
  }

  function startSimulation() {
    if (state.running) return;
    // If we're at the beginning, reset samples to start fresh
    if (state.simTime <= 0) resetSimulation();
    state.running = true;
    state.lastTs = null;
    requestAnimationFrame(simTick);
  }

  function pauseSimulation() {
    state.running = false;
  }

  // Attach buttons (defensive)
  if (startBtn) startBtn.addEventListener('click', startSimulation);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseSimulation);
  if (resetBtn) resetBtn.addEventListener('click', resetSimulation);

  // Keyboard shortcuts: Space toggles start/pause, R resets
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space') {
      ev.preventDefault();
      state.running ? pauseSimulation() : startSimulation();
    }
    if (ev.key === 'r' || ev.key === 'R') resetSimulation();
  });

  // Touch/click on canvas toggles start/pause
  trackCanvas.addEventListener('click', () => state.running ? pauseSimulation() : startSimulation());
  trackCanvas.addEventListener('touchstart', () => state.running ? pauseSimulation() : startSimulation());

  // ------------------------
  // Physics model
  // ------------------------
  function effectiveSpeedFor(obj) {
    // base speed (m/s)
    const base = baseSpeed_mps();
    if (!(isFinite(base) && base > 0)) return 0;
    // mass factor: pedagogical model; large mass slower
    const massFactor = 1 / Math.max(0.0001, obj.mass); // avoid div by zero
    // find zone multiplier by current pixel position
    const px = distanceToPixel(obj.covered_m);
    const zone = zoneAtPx(px);
    const zoneMult = zone ? zone.multiplier : 1;
    // combined
    const eff = base * (obj.speedMult || 1) * zoneMult * massFactor;
    // clamp to avoid runaway
    return clamp(eff, 0, base * Math.max(0.01, obj.speedMult || 1) * 6);
  }

  // ------------------------
  // Distance <-> Pixel mapping
  // ------------------------
  function distanceToPixel(distMeters) {
    if ((distanceInput && Number(distanceInput.value)) || (distanceRange && Number(distanceRange.value))) {
      // use UI distance as total
      const totalDist = isKmHSelected() ? Number(distanceInput ? distanceInput.value : distanceRange.value) * 1000 : Number(distanceInput ? distanceInput.value : distanceRange.value);
      if (totalDist <= 0) return state.trackStartPx;
      const frac = clamp(distMeters / totalDist, 0, 1);
      return state.trackStartPx + frac * state.trackLenPx;
    } else {
      // fallback to internal track length mapping using current state.distance (if you stored)
      // assume a default distance of 100 m
      const totalDist = 100;
      const frac = clamp(distMeters / totalDist, 0, 1);
      return state.trackStartPx + frac * state.trackLenPx;
    }
  }

  function pixelToDistance(px) {
    const frac = (px - state.trackStartPx) / state.trackLenPx;
    // match the UI distance unit
    const totalDistUI = isKmHSelected() ? Number(distanceInput ? distanceInput.value : distanceRange.value) * 1000 : Number(distanceInput ? distanceInput.value : distanceRange.value);
    const totalDist = (isFinite(totalDistUI) && totalDistUI > 0) ? totalDistUI : 100;
    return clamp(frac, 0, 1) * totalDist;
  }

  // ------------------------
  // Simulation tick (requestAnimationFrame)
  // ------------------------
  function simTick(ts) {
    try {
      if (!state.running) return;
      if (!state.lastTs) state.lastTs = ts;
      const dtMs = ts - state.lastTs;
      state.lastTs = ts;
      const dt = dtMs / 1000; // seconds
      state.simTime += dt;

      // UI values can change live
      const friction = (frictionInput && Number(frictionInput.value)) || (frictionRange && Number(frictionRange.value)) || 0;
      const turbo = (turboInput && Number(turboInput.value)) || (turboRange && Number(turboRange.value)) || 1;

      // update objects with physics
      ['A', 'B'].forEach(k => {
        const obj = objects[k];
        // effective speed in m/s (before friction)
        const eff = effectiveSpeedFor(obj);
        // apply friction as percentage reduction (simple model)
        const effAfterF = eff * (1 - clamp(friction, 0, 0.99));
        // apply turbo to time scale: turbo >1 speeds up animation (we treat as multiplier for eff)
        const finalSpeed = effAfterF * clamp(turbo, 0.1, 4);
        // integrate distance (meters)
        obj.covered_m = clamp(obj.covered_m + finalSpeed * dt, 0, isKmHSelected() ? (Number(distanceInput ? distanceInput.value : distanceRange.value) * 1000) : Number(distanceInput ? distanceInput.value : distanceRange.value));
        // add trail sample (store pixel x + time)
        obj.trail.push({ x: distanceToPixel(obj.covered_m), t: state.simTime });
        if (obj.trail.length > 1000) obj.trail.shift();
      });

      // sample for graphs (push)
      samples.t.push(state.simTime);
      samples.aDist.push(objects.A.covered_m);
      samples.bDist.push(objects.B.covered_m);

      // compute instantaneous speeds for graphs (based on recent sample diffs)
      let aInst = 0, bInst = 0;
      const n = samples.t.length;
      if (n >= 2) {
        const dtS = samples.t[n - 1] - samples.t[n - 2];
        if (dtS > 0) {
          aInst = (samples.aDist[n - 1] - samples.aDist[n - 2]) / dtS;
          bInst = (samples.bDist[n - 1] - samples.bDist[n - 2]) / dtS;
        }
      }
      samples.aSpeed.push(aInst);
      samples.bSpeed.push(bInst);

      // update displays (show object A speed as primary)
      const displaySpeed = isKmHSelected() ? aInst * 3.6 : aInst;
      updateDisplays(displaySpeed);

      // draw frame
      drawFrame();

      // update graphs periodically to save cycles
      if (samples.t.length % 3 === 0) drawGraphs();

      // end condition: both reached finish OR either reached finish
      const totalDistanceMeters = isKmHSelected() ? Number(distanceInput ? distanceInput.value : distanceRange.value) * 1000 : Number(distanceInput ? distanceInput.value : distanceRange.value);
      const endedA = (objects.A.covered_m >= totalDistanceMeters);
      const endedB = (objects.B.covered_m >= totalDistanceMeters);
      if (endedA || endedB) {
        state.running = false;
        drawGraphs();
        // announce winner gently (non-blocking)
        setTimeout(() => {
          try {
            const msg = endedA && endedB ? 'It\'s a tie!' : (endedA ? 'Object A reaches the finish first!' : 'Object B reaches the finish first!');
            // create an accessible live region update instead of alert if possible
            if (speedDisplay) {
              const old = speedDisplay.textContent;
              speedDisplay.textContent = msg;
              setTimeout(() => { if (speedDisplay) speedDisplay.textContent = old; }, 3000);
            } else {
              // fallback
              console.log(msg);
            }
          } catch (e) { /* ignore */ }
        }, 200);
        return;
      }

      // trim samples if necessary
      if (samples.t.length > samples.max) {
        samples.t.shift(); samples.aDist.shift(); samples.bDist.shift(); samples.aSpeed.shift(); samples.bSpeed.shift();
      }

      requestAnimationFrame(simTick);
    } catch (err) {
      console.error('simTick error', err);
      state.running = false;
    }
  }

  // ------------------------
  // Drawing code
  // ------------------------
  function drawStaticTrack() {
    try {
      const ctx = trackCtx;
      const w = trackCanvas.width;
      const h = trackCanvas.height;
      ctx.clearRect(0, 0, w, h);

      // subtle starfield
      ctx.save();
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.beginPath();
        ctx.arc((i * 73) % w, (i * 47) % h, (i % 17 === 0) ? 1.2 : 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // track lane center
      const laneY = h * 0.5;
      const laneH = Math.round(h * 0.14);

      // draw zones visually
      state.zones.forEach(z => {
        ctx.fillStyle = hexToRgba(z.color, 0.06);
        ctx.fillRect(z.x, laneY - laneH / 2, z.w, laneH);

        ctx.strokeStyle = hexToRgba(z.color, 0.16);
        ctx.lineWidth = Math.max(1, w / 900);
        roundedRect(ctx, z.x, laneY - laneH / 2, z.w, laneH, 10);
        ctx.stroke();

        ctx.fillStyle = hexToRgba(z.color, 0.95);
        ctx.font = `${12 * (w / 1200)}px system-ui, Arial`;
        ctx.fillText(z.id.toUpperCase(), z.x + 8 * (w / 1200), laneY - laneH / 2 + 18);
      });

      // start & finish markers
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(state.trackStartPx - 4, laneY - laneH / 2 - 26, 8, laneH + 52);
      ctx.fillRect(state.trackEndPx - 4, laneY - laneH / 2 - 26, 8, laneH + 52);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `${11 * (w / 1200)}px system-ui, Arial`;
      ctx.fillText('START', state.trackStartPx - 28, laneY - laneH / 2 - 32);
      ctx.fillText('FINISH', state.trackEndPx - 36, laneY - laneH / 2 - 32);
    } catch (e) { console.warn('drawStaticTrack', e); }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFrame() {
    try {
      drawStaticTrack();
      drawBoostParticles(trackCtx);
      drawTrail(trackCtx, objects.A);
      drawTrail(trackCtx, objects.B);
      drawVelocityVector(trackCtx, objects.A);
      drawVelocityVector(trackCtx, objects.B);
      drawObject(trackCtx, objects.A, -28);
      drawObject(trackCtx, objects.B, 28);
    } catch (e) { console.warn('drawFrame', e); }
  }

  function drawTrail(ctx, obj) {
    try {
      if (!obj.trail || obj.trail.length < 2) return;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 1; i < obj.trail.length; i++) {
        const p1 = obj.trail[i - 1], p2 = obj.trail[i];
        const age = state.simTime - p1.t;
        const alpha = clamp(1 - age / 4, 0.02, 0.85);
        ctx.strokeStyle = hexToRgba(obj.color, alpha);
        ctx.lineWidth = Math.max(1, (8 - (i / 60)) * (trackCanvas.width / 1200));
        ctx.beginPath();
        ctx.moveTo(p1.x, trackCanvas.height * 0.5);
        ctx.lineTo(p2.x, trackCanvas.height * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    } catch (e) { console.warn('drawTrail', e); }
  }

  function drawObject(ctx, obj, yOffset) {
    try {
      const x = distanceToPixel(obj.covered_m);
      const y = trackCanvas.height * 0.5 + yOffset;
      // glow rings
      for (let i = 6; i >= 1; i--) {
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(obj.color, 0.04 * (i / 6));
        ctx.arc(x, y, 12 + i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // core
      ctx.beginPath();
      ctx.fillStyle = obj.color;
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      // label
      ctx.fillStyle = '#02030a';
      ctx.font = `${10 * (trackCanvas.width / 1200)}px Inter, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(obj.id, x, y + 4);
    } catch (e) { console.warn('drawObject', e); }
  }

  function drawVelocityVector(ctx, obj) {
    try {
      const x = distanceToPixel(obj.covered_m);
      const y = trackCanvas.height * 0.5 + (obj === objects.A ? -28 : 28);
      const latestArr = obj === objects.A ? samples.aSpeed : samples.bSpeed;
      const latest = (latestArr && latestArr.length) ? latestArr[latestArr.length - 1] : 0;
      let display = latest;
      if (isKmHSelected()) display = latest * 3.6;
      const len = clamp(display * 2 * (trackCanvas.width / 1200), 6, 160);
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(obj.color, 0.95);
      ctx.lineWidth = Math.max(1, trackCanvas.width / 900);
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x - 12 + len, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = obj.color;
      ctx.moveTo(x - 12 + len, y);
      ctx.lineTo(x - 12 + len - 8, y - 4);
      ctx.lineTo(x - 12 + len - 8, y + 4);
      ctx.closePath();
      ctx.fill();
    } catch (e) { console.warn('drawVelocityVector', e); }
  }

  // boost particles for boost zone
  function drawBoostParticles(ctx) {
    try {
      const boost = state.zones.find(z => z.id === 'boost');
      if (!boost) return;
      const spawn = Math.max(1, Math.round(0.4 * state.dpr));
      for (let i = 0; i < spawn; i++) {
        const x = boost.x + Math.random() * boost.w;
        const y = (trackCanvas.height * 0.5) + (Math.random() * 20 - 10);
        particles.push({ x, y, vx: (Math.random() * 0.6 - 0.3), vy: (Math.random() * -0.3), life: 1 + Math.random() * 0.6 });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * (1 + state.dpr * 0.2);
        p.y += p.vy;
        p.life -= 0.02 + Math.random() * 0.02;
        if (p.life <= 0) particles.splice(i, 1);
        else {
          ctx.beginPath();
          ctx.fillStyle = `rgba(0,255,120,${clamp(p.life, 0, 1) * 0.12})`;
          ctx.arc(p.x, p.y, 2 + Math.random() * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      while (particles.length > 200) particles.shift();
    } catch (e) { console.warn('drawBoostParticles', e); }
  }

  // ------------------------
  // Graphing (Distance vs Time & Speed vs Time)
  // ------------------------
  function drawGraphs() {
    drawDistanceGraph();
    drawSpeedGraph();
  }

  function drawDistanceGraph() {
    try {
      const ctx = distCtx;
      const canvas = distGraph;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pad = { l: 44 * state.dpr, r: 12 * state.dpr, t: 10 * state.dpr, b: 26 * state.dpr };
      const w = canvas.width, h = canvas.height;
      const plotW = w - pad.l - pad.r;
      const plotH = h - pad.t - pad.b;

      // background
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(pad.l, pad.t, plotW, plotH);

      const tArr = samples.t;
      const n = tArr.length;
      const tMax = Math.max(1, n ? tArr[n - 1] : 1);
      const dMax = Math.max(1, Number(distanceInput ? distanceInput.value : distanceRange.value) || 1);

      // grid lines & tick labels
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = Math.max(1, state.dpr);
      ctx.font = `${10 * state.dpr}px Inter`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';

      for (let i = 0; i <= 4; i++) {
        const y = pad.t + plotH - (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
        const val = dMax * (i / 4);
        ctx.fillText(fmt(val, 0), 6, y + 4);
      }
      for (let i = 0; i <= 4; i++) {
        const x = pad.l + (i / 4) * plotW;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
        const tVal = tMax * (i / 4);
        ctx.fillText(fmt(tVal, 1), x - 8, h - 6);
      }

      // mappers
      const mapX = t => pad.l + (t / (tMax || 1)) * plotW;
      const mapY = d => pad.t + plotH - (d / (dMax || 1)) * plotH;

      // draw A (solid)
      ctx.lineWidth = 2 * state.dpr;
      ctx.strokeStyle = hexToRgba(objects.A.color, 0.95);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = mapX(samples.t[i] || 0);
        const y = mapY(samples.aDist[i] || 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // draw B (dashed)
      ctx.setLineDash([6 * state.dpr, 4 * state.dpr]);
      ctx.strokeStyle = hexToRgba(objects.B.color, 0.95);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = mapX(samples.t[i] || 0);
        const y = mapY(samples.bDist[i] || 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } catch (e) { console.warn('drawDistanceGraph', e); }
  }

  function drawSpeedGraph() {
    try {
      const ctx = speedCtx;
      const canvas = speedGraph;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pad = { l: 44 * state.dpr, r: 12 * state.dpr, t: 10 * state.dpr, b: 26 * state.dpr };
      const w = canvas.width, h = canvas.height;
      const plotW = w - pad.l - pad.r;
      const plotH = h - pad.t - pad.b;

      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(pad.l, pad.t, plotW, plotH);

      const tArr = samples.t;
      const n = tArr.length;
      let sMax = 1;
      if (n > 0) {
        const vals = [];
        for (let i = 0; i < samples.aSpeed.length; i++) {
          let a = samples.aSpeed[i] || 0;
          let b = samples.bSpeed[i] || 0;
          if (isKmHSelected()) { a *= 3.6; b *= 3.6; }
          vals.push(Math.abs(a), Math.abs(b));
        }
        sMax = Math.max(1, ...vals);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = Math.max(1, state.dpr);
      ctx.font = `${10 * state.dpr}px Inter`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';

      for (let i = 0; i <= 4; i++) {
        const y = pad.t + plotH - (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
        const val = sMax * (i / 4);
        ctx.fillText(fmt(val, 1), 6, y + 4);
      }
      for (let i = 0; i <= 4; i++) {
        const x = pad.l + (i / 4) * plotW;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
        const tVal = ((n ? tArr[tArr.length - 1] : 1) * (i / 4));
        ctx.fillText(fmt(tVal, 1), x - 8, h - 6);
      }

      const mapX = t => pad.l + (t / (Math.max(1, (tArr[n - 1] || 1)))) * plotW;
      const mapY = s => pad.t + plotH - (s / (sMax || 1)) * plotH;

      // A
      ctx.lineWidth = 2 * state.dpr;
      ctx.strokeStyle = hexToRgba(objects.A.color, 0.95);
      ctx.beginPath();
      for (let i = 0; i < samples.aSpeed.length; i++) {
        let s = samples.aSpeed[i] || 0;
        if (isKmHSelected()) s *= 3.6;
        const x = mapX(samples.t[i] || 0);
        const y = mapY(s);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // B dashed
      ctx.setLineDash([6 * state.dpr, 4 * state.dpr]);
      ctx.strokeStyle = hexToRgba(objects.B.color, 0.95);
      ctx.beginPath();
      for (let i = 0; i < samples.bSpeed.length; i++) {
        let s = samples.bSpeed[i] || 0;
        if (isKmHSelected()) s *= 3.6;
        const x = mapX(samples.t[i] || 0);
        const y = mapY(s);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } catch (e) { console.warn('drawSpeedGraph', e); }
  }

  // ------------------------
  // Tooltip for graphs & track
  // ------------------------
  if (tooltip) {
    // Track hover tooltip: show nearest object distance & zone
    trackCanvas.addEventListener('mousemove', (ev) => {
      try {
        const rect = trackCanvas.getBoundingClientRect();
        const x = (ev.clientX - rect.left) * (trackCanvas.width / rect.width);
        const y = (ev.clientY - rect.top) * (trackCanvas.height / rect.height);
        const ax = distanceToPixel(objects.A.covered_m);
        const ay = trackCanvas.height * 0.5 - 28;
        const bx = distanceToPixel(objects.B.covered_m);
        const by = trackCanvas.height * 0.5 + 28;
        const da = Math.hypot(ax - x, ay - y);
        const db = Math.hypot(bx - x, by - y);
        const near = da < db ? objects.A : objects.B;
        const zone = state.zones.find(z => x >= z.x && x <= z.x + z.w);
        tooltip.style.display = 'block';
        tooltip.style.left = (ev.clientX + 12) + 'px';
        tooltip.style.top = (ev.clientY + 12) + 'px';
        tooltip.innerHTML = `<strong>Object ${near.id}</strong><br/>Distance: ${formatDistanceDisplay(near.covered_m)}<br/>Zone: ${zone ? zone.id.toUpperCase() : 'NORMAL'}`;
      } catch (e) { /* ignore */ }
    });
    trackCanvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  }

  // ------------------------
  // Display updates
  // ------------------------
  function updateDisplays(currentSpeed) {
    try {
      if (speedDisplay) speedDisplay.textContent = formatSpeedDisplay(currentSpeed || 0);
      if (computedSpeedEl) computedSpeedEl.textContent = (isFinite(baseSpeed_mps()) ? (isKmHSelected() ? (baseSpeed_mps() * 3.6).toFixed(2) : baseSpeed_mps().toFixed(2)) : '0');
      if (computedUnitEl) computedUnitEl.textContent = isKmHSelected() ? 'km/h' : 'm/s';

      if (distAEl) distAEl.textContent = formatDistanceDisplay(objects.A.covered_m || 0);
      if (distBEl) distBEl.textContent = formatDistanceDisplay(objects.B.covered_m || 0);
    } catch (e) { console.warn('updateDisplays error', e); }
  }

  // ------------------------
  // Initialization & intro animation
  // ------------------------
  function introSlide() {
    try {
      const start = performance.now();
      const duration = 650;
      const offs = -120;
      function frame(ts) {
        const t = clamp((ts - start) / duration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const px = state.trackStartPx + offs * (1 - ease);
        objects.A.covered_m = pixelToDistance(px);
        objects.B.covered_m = pixelToDistance(px);
        drawStaticTrack();
        drawFrame();
        updateDisplays(0);
        if (t < 1) requestAnimationFrame(frame);
        else {
          objects.A.covered_m = 0;
          objects.B.covered_m = 0;
          drawStaticTrack();
          drawFrame();
          updateDisplays(0);
        }
      }
      requestAnimationFrame(frame);
    } catch (e) { console.warn('introSlide error', e); }
  }

  // ------------------------
  // Utility mapping wrappers (exposed locally)
  // ------------------------
 
  // ------------------------
  // Startup initialization
  // ------------------------
  function init() {
    try {
      // Set UI default sync
      if (distanceRange && distanceInput) { distanceRange.value = distanceInput.value; }
      if (timeRange && timeInput) { timeRange.value = timeInput.value; }
      if (frictionRange && frictionInput) { frictionInput.value = frictionRange.value; }
      if (turboRange && turboInput) { turboInput.value = turboRange.value; }

      // object sliders populate
      if (massARange && massAInput) { massARange.value = objects.A.mass; massAInput.value = objects.A.mass; }
      if (massBRange && massBInput) { massBRange.value = objects.B.mass; massBInput.value = objects.B.mass; }
      if (speedAMultRange && speedAMultInput) { speedAMultRange.value = objects.A.speedMult; speedAMultInput.value = objects.A.speedMult; }
      if (speedBMultRange && speedBMultInput) { speedBMultRange.value = objects.B.speedMult; speedBMultInput.value = objects.B.speedMult; }

      computeZones();
      resizeAll();
      resetSimulation();
      updateDisplays(0);
      introSlide();
    } catch (e) {
      console.error('init error', e);
    }
  }

  // ------------------------
  // Expose debug helpers
  // ------------------------
  window.simIIS = {
    start: startSimulation,
    pause: pauseSimulation,
    reset: resetSimulation,
    state,
    objects,
    samples
  };

  // Run initialization slightly deferred to allow DOM/CSS to settle
  setTimeout(init, 80);

})();
