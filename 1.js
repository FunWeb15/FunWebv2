/* script.js
   All logic for the motion simulation.
   - Pure JS, no external libs
   - requestAnimationFrame driven
   - Two objects (A & B)
   - Zones with multipliers
   - Sliders: Time, Distance, Mass, Friction (ONLY)
   - Canvas graphs: Distance vs Time & Speed vs Time
   - Accessible controls, defensive programming
*/

try {
  // DOM references
  const trackCanvas = document.getElementById('trackCanvas');
  const trackCtx = trackCanvas.getContext('2d', { alpha: true });
  const distanceGraph = document.getElementById('distanceGraph');
  const distanceCtx = distanceGraph.getContext('2d', { alpha: false });
  const speedGraph = document.getElementById('speedGraph');
  const speedCtx = speedGraph.getContext('2d', { alpha: false });

  // Controls
  const distanceRange = document.getElementById('distanceRange');
  const distanceNumber = document.getElementById('distanceNumber');
  const timeRange = document.getElementById('timeRange');
  const timeNumber = document.getElementById('timeNumber');
  const massRange = document.getElementById('massRange');
  const massNumber = document.getElementById('massNumber');
  const frictionRange = document.getElementById('frictionRange');
  const frictionNumber = document.getElementById('frictionNumber');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const unitsToggle = document.getElementById('unitsToggle');

  // Info panel
  const liveSpeed = document.getElementById('liveSpeed');
  const formulaDistance = document.getElementById('formulaDistance');
  const formulaTime = document.getElementById('formulaTime');
  const formulaUnits = document.getElementById('formulaUnits');
  const graphTooltip = document.getElementById('graphTooltip');

  // Responsive canvas sizing helper
  function resizeCanvases() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = trackCanvas.getBoundingClientRect();
    trackCanvas.width = Math.floor(rect.width * ratio);
    trackCanvas.height = Math.floor(rect.height * ratio);
    trackCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const dRect = distanceGraph.getBoundingClientRect();
    distanceGraph.width = Math.floor(dRect.width * ratio);
    distanceGraph.height = Math.floor(dRect.height * ratio);
    distanceCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const sRect = speedGraph.getBoundingClientRect();
    speedGraph.width = Math.floor(sRect.width * ratio);
    speedGraph.height = Math.floor(sRect.height * ratio);
    speedCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  window.addEventListener('resize', () => {
    resizeCanvases();
    drawStaticTrack(); // redraw zones on resize
    drawFrame();
    drawGraphs();
  });

  // Initial resize
  resizeCanvases();

  /* ===========================
     Simulation parameters & state
     =========================== */

  // Zone definitions (fractions of track width)
  const zones = [
    { name: 'normal', color: '#00e6ff', multiplier: 1.0, start: 0.0, end: 0.45 },
    { name: 'boost', color: '#39ff7f', multiplier: 1.5, start: 0.45, end: 0.7 },
    { name: 'slow', color: '#ff7a3d', multiplier: 0.6, start: 0.7, end: 1.0 }
  ];

  // Colors for objects A & B
  const objectAColor = '#ff4dff';
  const objectBColor = '#00f0ff';

  // Simulation runtime state
  let sim = {
    running: false,
    lastTime: null,
    elapsed: 0,
    simTimeScale: 1,
  };

  // Objects state factory
  function makeObject(id, color, baseOffset) {
    return {
      id,
      color,
      baseOffset,
      x: 0,
      y: 0,
      trail: [],
      currentSpeed: 0, // m/s
      targetSpeed: 0,  // m/s
      distanceTravelled: 0 // meters
    };
  }
  const objA = makeObject('A', objectAColor, 0);
  const objB = makeObject('B', objectBColor, 0.02);

  // ===========================
  // Live Speed Tracker (Object A & B)
  // Updates the two DOM readouts inserted in HTML
  // ===========================
  function updateSpeedTracker() {
    const speedA_ms = safeNumber(objA.currentSpeed, 0);
    const speedB_ms = safeNumber(objB.currentSpeed, 0);

    const elAms = document.getElementById("speedA-ms");
    const elAkm = document.getElementById("speedA-kmh");
    const elBms = document.getElementById("speedB-ms");
    const elBkm = document.getElementById("speedB-kmh");

    if (elAms) elAms.textContent = `${speedA_ms.toFixed(2)} m/s`;
    if (elAkm) elAkm.textContent = `${(speedA_ms * 3.6).toFixed(2)} km/h`;
    if (elBms) elBms.textContent = `${speedB_ms.toFixed(2)} m/s`;
    if (elBkm) elBkm.textContent = `${(speedB_ms * 3.6).toFixed(2)} km/h`;
  }

  // Simulation parameters (linked to sliders)
  const params = {
    distance_m: Number(distanceRange.value) || 100,
    time_s: Number(timeRange.value) || 10,
    mass_kg: Number(massRange.value) || 10,
    friction_pct: Number(frictionRange.value) || 5,
    units: 'm_s'
  };
// NEW: Separate Object A & B physics parameters
params.massA = 10;
params.massB = 10;
params.frictionA = 5;
params.frictionB = 5;

  const MAX_TIME_SECONDS = 3600;
  const MAX_DISTANCE_METERS = 10000;

  let graphData = { time: [], distanceA: [], distanceB: [], speedA: [], speedB: [] };

  /* ===========================
     Utility functions
     =========================== */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function safeNumber(n, fallback = 0) { return (typeof n === 'number' && Number.isFinite(n)) ? n : fallback; }
  function metersToKm(m) { return m / 1000; }
  function kmhToMs(kmh) { return kmh * 1000 / 3600; }
  function msToKmh(ms) { return ms * 3600 / 1000; }

  // Update formula display units text
  function updateFormulaUnits() {
    if (!formulaUnits) return;
    if (params.units === 'm_s') {
      formulaUnits.textContent = 'm / s';
      const du = document.getElementById('distanceUnits');
      const tu = document.getElementById('timeUnits');
      if (du) du.textContent = 'm';
      if (tu) tu.textContent = 's';
    } else {
      formulaUnits.textContent = 'km / h';
      const du = document.getElementById('distanceUnits');
      const tu = document.getElementById('timeUnits');
      if (du) du.textContent = 'km';
      if (tu) tu.textContent = 'h';
    }
  }

  /* ===========================
     Input synchronization (sliders + numbers)
     =========================== */
  function bindRangeNumber(rangeEl, numberEl, onChange) {
    if (!rangeEl || !numberEl) return;
    rangeEl.addEventListener('input', () => {
      try {
        const v = safeNumber(Number(rangeEl.value));
        numberEl.value = v;
        onChange(v);
      } catch (e) { console.error(e); }
    });

    numberEl.addEventListener('input', () => {
      try {
        let v = Number(numberEl.value);
        if (!Number.isFinite(v)) v = Number(rangeEl.value);
        v = clamp(v, Number(rangeEl.min), Number(rangeEl.max));
        numberEl.value = v;
        rangeEl.value = v;
        onChange(v);
      } catch (e) { console.error(e); }
    });

    numberEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        const step = Number(rangeEl.step) || 1;
        const cur = Number(numberEl.value) || 0;
        numberEl.value = ev.key === 'ArrowUp' ? cur + step : cur - step;
        numberEl.dispatchEvent(new Event('input'));
      }
    });
  }

  // apply binds with bounds
  bindRangeNumber(distanceRange, distanceNumber, (v) => {
    params.distance_m = clamp(Number(v), 1, MAX_DISTANCE_METERS);
    if (formulaDistance) formulaDistance.textContent = formatDistanceForFormula(params.distance_m);
    computeTargetSpeeds();
    resetGraphsIfNotRunning();
  });

  bindRangeNumber(timeRange, timeNumber, (v) => {
    params.time_s = clamp(Number(v), 1, MAX_TIME_SECONDS);
    if (formulaTime) formulaTime.textContent = formatTimeForFormula(params.time_s);
    computeTargetSpeeds();
    resetGraphsIfNotRunning();
  });

  bindRangeNumber(massRange, massNumber, (v) => {
    params.mass_kg = clamp(Number(v), 1, 200);
  });

  bindRangeNumber(frictionRange, frictionNumber, (v) => {
    params.friction_pct = clamp(Number(v), 0, 100);
  });
/* ======================================================
   NEW: Separate controls for Object A and Object B
   ====================================================== */

bindRangeNumber(massARange, massANumber, (v) => {
  params.massA = clamp(Number(v), 1, 200);
});

bindRangeNumber(frictionARange, frictionANumber, (v) => {
  params.frictionA = clamp(Number(v), 0, 100);
});

bindRangeNumber(massBRange, massBNumber, (v) => {
  params.massB = clamp(Number(v), 1, 200);
});

bindRangeNumber(frictionBRange, frictionBNumber, (v) => {
  params.frictionB = clamp(Number(v), 0, 100);
});

  // Units toggle
  if (unitsToggle) {
    unitsToggle.addEventListener('click', () => {
      try {
        params.units = params.units === 'm_s' ? 'km_h' : 'm_s';
        unitsToggle.textContent = params.units === 'm_s' ? 'm / s' : 'km / h';
        unitsToggle.setAttribute('aria-pressed', params.units === 'km_h' ? 'true' : 'false');
        updateFormulaUnits();
        computeTargetSpeeds();
      } catch (e) { console.error(e); }
    });
  }

  function formatDistanceForFormula(meters) {
    if (params.units === 'm_s') return `${Math.round(meters)} m`;
    return `${(metersToKm(meters)).toFixed(2)} km`;
  }
  function formatTimeForFormula(sec) {
    if (params.units === 'm_s') return `${Math.round(sec)} s`;
    return `${(sec / 3600).toFixed(3)} h`;
  }

  updateFormulaUnits();
  if (formulaDistance) formulaDistance.textContent = formatDistanceForFormula(params.distance_m);
  if (formulaTime) formulaTime.textContent = formatTimeForFormula(params.time_s);

  /* ===========================
     Physics & helpers
     =========================== */

  function computeBaseSpeedMs(distance_m, time_s) {
    const t = Math.max(0.000001, time_s);
    return distance_m / t;
  }

  function computeTargetSpeeds() {
    const baseMs = computeBaseSpeedMs(params.distance_m, params.time_s);
    const frictionFactor = 1 - clamp(params.friction_pct / 200, 0, 0.9);
    const baseA = baseMs * (1.0 + objA.baseOffset);
    const baseB = baseMs * (1.0 + objB.baseOffset);
    objA.targetSpeed = baseA * frictionFactor;
    objB.targetSpeed = baseB * frictionFactor;
  }
  computeTargetSpeeds();

  /* ===========================
     Track drawing & zones
     =========================== */

  function drawStaticTrack() {
    const w = trackCanvas.width / (window.devicePixelRatio || 1);
    const h = trackCanvas.height / (window.devicePixelRatio || 1);
    trackCtx.clearRect(0, 0, w, h);

    // base background
    trackCtx.save();
    trackCtx.fillStyle = '#031018';
    trackCtx.fillRect(0, 0, w, h);
    trackCtx.restore();

    const trackPadding = 18;
    const trackH = h - trackPadding * 2;
    const trackY = trackPadding;
    const trackX = trackPadding;
    const trackWidth = w - trackPadding * 2;

    trackCanvas._track = { x: trackX, y: trackY, w: trackWidth, h: trackH };

    // track base
    trackCtx.fillStyle = '#041324';
    roundRect(trackCtx, trackX, trackY, trackWidth, trackH, 10);
    trackCtx.fill();

    // zones
    zones.forEach(z => {
      const zx = trackX + z.start * trackWidth;
      const zw = (z.end - z.start) * trackWidth;
      trackCtx.save();
      trackCtx.shadowColor = z.color;
      trackCtx.shadowBlur = 28;
      trackCtx.fillStyle = hexToRgba(z.color, 0.12);
      roundRect(trackCtx, zx, trackY, zw, trackH, 6);
      trackCtx.fill();
      trackCtx.restore();

      trackCtx.strokeStyle = hexToRgba(z.color, 0.18);
      trackCtx.lineWidth = 2;
      roundRect(trackCtx, zx + 1, trackY + 1, Math.max(zw - 2, 2), trackH - 2, 6);
      trackCtx.stroke();
    });

    // start & finish
    trackCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    trackCtx.lineWidth = 2;
    trackCtx.beginPath();
    trackCtx.moveTo(trackX + 2, trackY);
    trackCtx.lineTo(trackX + 2, trackY + trackH);
    trackCtx.moveTo(trackX + trackWidth - 2, trackY);
    trackCtx.lineTo(trackX + trackWidth - 2, trackY + trackH);
    trackCtx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  drawStaticTrack();

  /* ===========================
     Reset, start/pause/reset handlers
     =========================== */

  function resetSimulation() {
    sim.running = false;
    sim.lastTime = null;
    sim.elapsed = 0;
    objA.x = 0; objB.x = 0;
    objA.y = 0; objB.y = 0;
    objA.trail = []; objB.trail = [];
    objA.currentSpeed = 0; objB.currentSpeed = 0;
    objA.distanceTravelled = 0; objB.distanceTravelled = 0;
    graphData = { time: [], distanceA: [], distanceB: [], speedA: [], speedB: [] };
    computeTargetSpeeds();
    drawStaticTrack();
    drawFrame();
    clearGraphs();
    drawGraphs();
    updateSpeedTracker();
  }

  resetSimulation();

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!sim.running) {
        sim.running = true;
        sim.lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      sim.running = false;
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetSimulation();
    });
  }

  function resetGraphsIfNotRunning() {
    if (!sim.running) {
      clearGraphs();
      drawGraphs();
    }
  }

  /* ===========================
     Physics update
     =========================== */

  function updatePhysics(dt) {
    const track = trackCanvas._track;
    if (!track) return;

    const trackPixelPerMeter = track.w / Math.max(params.distance_m, 0.0001);

    computeTargetSpeeds();

    function stepObject(obj) {
      const fraction = obj.x / Math.max(track.w, 1);
      let zoneMul = 1.0;
      for (const z of zones) {
        if (fraction >= z.start && fraction < z.end) { zoneMul = z.multiplier; break; }
      }

      const zoneTarget = obj.targetSpeed * zoneMul;
      // NEW — object-specific mass & friction
const objMass =
  obj.id === 'A' ? params.massA : params.massB;

const objFriction =
  obj.id === 'A' ? params.frictionA : params.frictionB;

// mass influences acceleration responsiveness
const massFactor = clamp(objMass / 10, 0.5, 50);

// acceleration toward target speed
const accel = (zoneTarget - obj.currentSpeed) / massFactor;

// friction proportional to object-specific friction slider
const frictionResistance = (objFriction / 100) * 0.8 * obj.currentSpeed;


      obj.currentSpeed += (accel - frictionResistance * 0.01) * dt;
      obj.currentSpeed = Math.max(0, obj.currentSpeed);

      const deltaMeters = obj.currentSpeed * dt;
      obj.distanceTravelled += deltaMeters;
      obj.x = obj.distanceTravelled * trackPixelPerMeter;

      obj.trail.push({ x: obj.x, t: performance.now(), speed: obj.currentSpeed });
      if (obj.trail.length > 220) obj.trail.shift();

      if (obj.x >= track.w) {
        obj.x = track.w;
        obj.currentSpeed = 0;
      }
    }

    stepObject(objA);
    stepObject(objB);

    sim.elapsed += dt;
  }

  /* ===========================
     Drawing
     =========================== */

  function drawFrame() {
    drawStaticTrack();

    const track = trackCanvas._track;
    if (!track) return;

    const lanePadding = 18;
    const laneHeight = (track.h - lanePadding * 2) / 2;
    objA.y = track.y + lanePadding + laneHeight / 2;
    objB.y = track.y + lanePadding + laneHeight + laneHeight / 2;

    function drawTrail(obj) {
      const trail = obj.trail;
      if (!trail || trail.length < 2) return;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i], b = trail[i + 1];
        const alpha = Math.max(0.02, (i / trail.length));
        trackCtx.beginPath();
        trackCtx.moveTo(track.x + a.x, obj.id === 'A' ? objA.y : objB.y);
        trackCtx.lineTo(track.x + b.x, obj.id === 'A' ? objA.y : objB.y);
        trackCtx.strokeStyle = hexToRgba(obj.color, alpha * 0.9);
        trackCtx.lineWidth = 6;
        trackCtx.lineCap = 'round';
        trackCtx.stroke();
      }
    }

    trackCtx.save();
    trackCtx.globalCompositeOperation = 'lighter';
    drawTrail(objA);
    drawTrail(objB);
    trackCtx.restore();

    function drawObject(obj) {
      const cx = track.x + obj.x;
      const cy = obj.id === 'A' ? objA.y : objB.y;

      trackCtx.save();
      trackCtx.shadowColor = obj.color;
      trackCtx.shadowBlur = 22;
      trackCtx.beginPath();
      trackCtx.arc(cx, cy, 12, 0, Math.PI * 2);
      trackCtx.fillStyle = hexToRgba(obj.color, 0.22);
      trackCtx.fill();
      trackCtx.restore();

      trackCtx.beginPath();
      trackCtx.arc(cx, cy, 8, 0, Math.PI * 2);
      trackCtx.fillStyle = obj.color;
      trackCtx.fill();

      const vlen = clamp(obj.currentSpeed / 2, 0, 40);
      if (vlen > 0.1) {
        trackCtx.beginPath();
        trackCtx.moveTo(cx + 10, cy);
        trackCtx.lineTo(cx + 10 + vlen, cy);
        trackCtx.strokeStyle = hexToRgba(obj.color, 0.9);
        trackCtx.lineWidth = 2;
        trackCtx.stroke();

        trackCtx.beginPath();
        trackCtx.moveTo(cx + 10 + vlen, cy);
        trackCtx.lineTo(cx + 8 + vlen, cy - 3);
        trackCtx.lineTo(cx + 8 + vlen, cy + 3);
        trackCtx.closePath();
        trackCtx.fillStyle = hexToRgba(obj.color, 0.9);
        trackCtx.fill();
      }
    }

    drawObject(objA);
    drawObject(objB);
  }

  /* ===========================
     Graphing (canvas)
     =========================== */

  function clearGraphs() {
    distanceCtx.clearRect(0, 0, distanceGraph.width, distanceGraph.height);
    speedCtx.clearRect(0, 0, speedGraph.width, speedGraph.height);
  }

  function drawAxes(ctx, canvasEl) {
    const w = canvasEl.width / (window.devicePixelRatio || 1);
    const h = canvasEl.height / (window.devicePixelRatio || 1);
    ctx.save();
    ctx.fillStyle = '#031018';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGraphs() {
    if (!graphData.time.length) {
      drawAxes(distanceCtx, distanceGraph);
      drawAxes(speedCtx, speedGraph);
      return;
    }

    // Distance graph
    drawAxes(distanceCtx, distanceGraph);
    {
      const w = distanceGraph.width / (window.devicePixelRatio || 1);
      const h = distanceGraph.height / (window.devicePixelRatio || 1);
      const tmax = Math.max(...graphData.time, 1);
      const dmax = Math.max(...graphData.distanceA, ...graphData.distanceB, params.distance_m);
      distanceCtx.fillStyle = '#9fb7c8';
      distanceCtx.font = '12px system-ui, Roboto, Arial';
      distanceCtx.fillText('Time (s)', 8, h - 6);
      distanceCtx.fillText(params.units === 'm_s' ? 'Distance (m)' : 'Distance (km)', w - 120, h - 6);

      function plotLine(values, color, width = 2) {
        distanceCtx.beginPath();
        for (let i = 0; i < values.length; i++) {
          const tx = graphData.time[i];
          const vx = (tx / tmax) * (w - 30) + 20;
          const vy = h - 24 - (values[i] / (dmax || 1)) * (h - 40);
          if (i === 0) distanceCtx.moveTo(vx, vy); else distanceCtx.lineTo(vx, vy);
        }
        distanceCtx.strokeStyle = color;
        distanceCtx.lineWidth = width;
        distanceCtx.stroke();
      }

      plotLine(graphData.distanceA.map(v => v), objectAColor, 2.5);
      plotLine(graphData.distanceB.map(v => v), objectBColor, 2.5);

      distanceCtx.fillStyle = objectAColor;
      distanceCtx.fillRect(28, 8, 10, 6);
      distanceCtx.fillStyle = objectBColor;
      distanceCtx.fillRect(120, 8, 10, 6);
      distanceCtx.fillStyle = '#9fb7c8';
      distanceCtx.fillText('A', 42, 16);
      distanceCtx.fillText('B', 134, 16);
    }

    // Speed graph
    drawAxes(speedCtx, speedGraph);
    {
      const w = speedGraph.width / (window.devicePixelRatio || 1);
      const h = speedGraph.height / (window.devicePixelRatio || 1);
      const tmax = Math.max(...graphData.time, 1);
      const vmax = Math.max(...graphData.speedA, ...graphData.speedB, 1);

      speedCtx.fillStyle = '#9fb7c8';
      speedCtx.font = '12px system-ui, Roboto, Arial';
      speedCtx.fillText('Time (s)', 8, h - 6);
      speedCtx.fillText(params.units === 'm_s' ? 'Speed (m/s)' : 'Speed (km/h)', w - 120, h - 6);

      function plotLine(values, color, width = 2) {
        speedCtx.beginPath();
        for (let i = 0; i < values.length; i++) {
          const tx = graphData.time[i];
          const vx = (tx / tmax) * (w - 30) + 20;
          const vy = h - 24 - (values[i] / (vmax || 1)) * (h - 40);
          if (i === 0) speedCtx.moveTo(vx, vy); else speedCtx.lineTo(vx, vy);
        }
        speedCtx.strokeStyle = color;
        speedCtx.lineWidth = width;
        speedCtx.stroke();
      }

      plotLine(graphData.speedA.map(v => v), objectAColor, 2.5);
      plotLine(graphData.speedB.map(v => v), objectBColor, 2.5);

      speedCtx.fillStyle = objectAColor;
      speedCtx.fillRect(28, 8, 10, 6);
      speedCtx.fillStyle = objectBColor;
      speedCtx.fillRect(120, 8, 10, 6);
      speedCtx.fillStyle = '#9fb7c8';
      speedCtx.fillText('A', 42, 16);
      speedCtx.fillText('B', 134, 16);
    }
  }

  /* Graph tooltip handling */
  function attachGraphTooltip(canvasEl, ctx, dataType) {
    canvasEl.addEventListener('mousemove', (ev) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const ratio = (x / rect.width);
      if (!graphData.time.length) {
        graphTooltip.style.display = 'none';
        graphTooltip.setAttribute('aria-hidden', 'true');
        return;
      }
      const i = Math.round((graphData.time.length - 1) * ratio);
      const idx = clamp(i, 0, graphData.time.length - 1);
      let t = graphData.time[idx].toFixed(2);
      let aVal, bVal, label;
      if (dataType === 'distance') {
        aVal = graphData.distanceA[idx]; bVal = graphData.distanceB[idx];
        label = params.units === 'm_s' ? 'm' : 'km';
        if (params.units !== 'm_s') { aVal = (aVal / 1000).toFixed(2); bVal = (bVal / 1000).toFixed(2); }
        else { aVal = aVal.toFixed(2); bVal = bVal.toFixed(2); }
      } else {
        aVal = graphData.speedA[idx]; bVal = graphData.speedB[idx];
        if (params.units === 'm_s') { aVal = aVal.toFixed(2); bVal = bVal.toFixed(2); label = 'm/s'; }
        else { aVal = (msToKmh(aVal)).toFixed(2); bVal = (msToKmh(bVal)).toFixed(2); label = 'km/h'; }
      }

      graphTooltip.style.left = `${ev.clientX}px`;
      graphTooltip.style.top = `${ev.clientY}px`;
      graphTooltip.style.display = 'block';
      graphTooltip.setAttribute('aria-hidden', 'false');
      graphTooltip.innerHTML = `<strong>t=${t}s</strong> • A: ${aVal} • B: ${bVal} ${label}`;
    });

    canvasEl.addEventListener('mouseleave', () => {
      graphTooltip.style.display = 'none';
      graphTooltip.setAttribute('aria-hidden', 'true');
    });
  }

  attachGraphTooltip(distanceGraph, distanceCtx, 'distance');
  attachGraphTooltip(speedGraph, speedCtx, 'speed');

  /* ===========================
     Main loop
     =========================== */

  function loop(now) {
    if (!sim.running) return;
    if (!sim.lastTime) sim.lastTime = now;
    const dt = Math.min(0.1, (now - sim.lastTime) / 1000);
    sim.lastTime = now;

    updatePhysics(dt);
    drawFrame();

    // record data
    graphData.time.push(sim.elapsed);
    graphData.distanceA.push(objA.distanceTravelled);
    graphData.distanceB.push(objB.distanceTravelled);
    graphData.speedA.push(objA.currentSpeed);
    graphData.speedB.push(objB.currentSpeed);

    // update live speed display
    let speedA_display = objA.currentSpeed;
    let speedB_display = objB.currentSpeed;
    let speedLabel = 'm/s';
    if (params.units === 'km_h') {
      speedA_display = msToKmh(speedA_display);
      speedB_display = msToKmh(speedB_display);
      speedLabel = 'km/h';
    }
    if (liveSpeed) liveSpeed.textContent = `Current speed (A): ${speedA_display.toFixed(2)} ${speedLabel} • (B): ${speedB_display.toFixed(2)} ${speedLabel}`;

    // update small live trackers
    updateSpeedTracker();

    // update graphs
    drawGraphs();

    // finish detection
    const finishedA = objA.x >= trackCanvas._track.w - 1;
    const finishedB = objB.x >= trackCanvas._track.w - 1;
    const timeExceeded = (sim.elapsed >= Math.max(params.time_s * 1.5, params.time_s + 5));

    if ((finishedA && finishedB) || timeExceeded) {
      sim.running = false;
      drawFrame();
      drawGraphs();
      return;
    }

    requestAnimationFrame(loop);
  }

  /* Initialization helpers */
  trackCanvas.addEventListener('click', () => {
    if (sim.running) sim.running = false;
    else {
      sim.running = true;
      sim.lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (sim.running) sim.running = false;
      else {
        sim.running = true;
        sim.lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    } else if (ev.key.toLowerCase() === 'r') {
      resetSimulation();
    }
  });

  // initial draws
  drawStaticTrack();
  drawFrame();
  drawGraphs();
  computeTargetSpeeds();
  updateSpeedTracker();

  // Prevent UI drift on mobile
  ['touchstart', 'touchmove'].forEach(evt => {
    trackCanvas.addEventListener(evt, (e) => {
      e.preventDefault();
    }, { passive: false });
  });

} catch (ex) {
  console.error('Simulation initialization error:', ex);
  try {
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = '<div style="padding:24px;color:#fff;background:#321">An error occurred initializing the simulation. Check console for details.</div>';
    }
  } catch (e) { /* ignore further failures */ }
}
