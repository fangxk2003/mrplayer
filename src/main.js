import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './styles.css';

const container = document.querySelector('#scene');

const controlsUi = {
  playPause: document.querySelector('#playPause'),
  resetTime: document.querySelector('#resetTime'),
  resetCamera: document.querySelector('#resetCamera'),
  sequenceType: document.querySelector('#sequenceType'),
  flipAngle: document.querySelector('#flipAngle'),
  refocusAngle: document.querySelector('#refocusAngle'),
  echoTime: document.querySelector('#echoTime'),
  b0Rate: document.querySelector('#b0Rate'),
  offRes: document.querySelector('#offRes'),
  tissuePreset: document.querySelector('#tissuePreset'),
  t1: document.querySelector('#t1'),
  t2: document.querySelector('#t2'),
  speed: document.querySelector('#speed'),
  density: document.querySelector('#density'),
  vectorStyle: document.querySelector('#vectorStyle'),
  phantomType: document.querySelector('#phantomType'),
  showPhantom: document.querySelector('#showPhantom'),
  showVectors: document.querySelector('#showVectors'),
  showNet: document.querySelector('#showNet'),
  showField: document.querySelector('#showField'),
  showCoil: document.querySelector('#showCoil'),
};

const outputs = {
  flip: document.querySelector('#flipValue'),
  refocus: document.querySelector('#refocusValue'),
  te: document.querySelector('#teValue'),
  b0: document.querySelector('#b0Value'),
  off: document.querySelector('#offValue'),
  t1: document.querySelector('#t1Value'),
  t2: document.querySelector('#t2Value'),
  speed: document.querySelector('#speedValue'),
  density: document.querySelector('#densityValue'),
  time: document.querySelector('#timeReadout'),
  mxy: document.querySelector('#mxyReadout'),
  mz: document.querySelector('#mzReadout'),
  samples: document.querySelector('#sampleReadout'),
  cursor: document.querySelector('#timeCursor'),
  eventTrack: document.querySelector('#eventTrack'),
  sequenceReadout: document.querySelector('#sequenceReadout'),
  phaseLabelA: document.querySelector('#phaseLabelA'),
  phaseLabelB: document.querySelector('#phaseLabelB'),
  phaseLabelC: document.querySelector('#phaseLabelC'),
  chartMz: document.querySelector('#chartMzReadout'),
  mzChart: document.querySelector('#mzChart'),
};

const state = {
  sequence: 'single-pulse',
  playing: true,
  elapsed: 0,
  cycleSeconds: 3,
  rfSeconds: 0.12,
  flipAngle: 90,
  refocusAngle: 180,
  echoTime: 0.16,
  b0Rate: 0.85,
  offRes: 0.45,
  tissuePreset: 'grayMatter',
  t1Ms: 1300,
  t2Ms: 100,
  speed: 1,
  density: 12,
  vectorStyle: 'classic',
  phantomType: 'shepp-logan',
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111312);
scene.fog = new THREE.FogExp2(0x111312, 0.035);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 80);
camera.position.set(3.1, 2.2, 3.6);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x111312, 1);
container.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 2.2;
orbit.maxDistance = 7.5;
orbit.target.set(0, 0, 0);

const ambient = new THREE.HemisphereLight(0xf6fff8, 0x1b2420, 2.0);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7bd5c8, 1.1);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);

const phantomGroup = new THREE.Group();
const vectorGroup = new THREE.Group();
const fieldGroup = new THREE.Group();
const coilGroup = new THREE.Group();
const axesGroup = new THREE.Group();
scene.add(phantomGroup, vectorGroup, fieldGroup, coilGroup, axesGroup);

let samples = [];
let arrowMesh = null;
let phantomPoints = null;
const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const scale = new THREE.Vector3();
const color = new THREE.Color();
const netDirection = new THREE.Vector3(0, 1, 0);
const coilMaterials = [];

const netArrow = new THREE.ArrowHelper(netDirection, new THREE.Vector3(0, 0, 0), 0.9, 0xf3b846, 0.17, 0.08);
netArrow.line.material.linewidth = 3;
scene.add(netArrow);

let lastTime = performance.now();

function animate(now) {
  const dt = clamp((now - lastTime) / 1000, 0, 0.05);
  lastTime = now;

  if (state.playing) {
    state.elapsed += dt * state.speed;
  }

  updateMoments();
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateMoments() {
  if (!arrowMesh || samples.length === 0) {
    return;
  }

  const sequence = getSequenceConfig();
  const localTime = positiveModulo(state.elapsed, state.cycleSeconds);

  let sumMx = 0;
  let sumMy = 0;
  let sumMz = 0;
  let sumRho = 0;
  const glyphStyle = GLYPH_STYLES[state.vectorStyle] || GLYPH_STYLES.classic;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const moment = getMomentAt(sample, localTime, sequence);
    const weightedMz = moment.mz * sample.rho;
    const weightedMx = moment.mx * sample.rho;
    const weightedMy = moment.my * sample.rho;

    dir.set(weightedMx, weightedMz, weightedMy);
    const vectorLength = clamp(dir.length(), 0.08, 1.0);
    dir.normalize();

    quat.setFromUnitVectors(yAxis, dir);
    scale.set(glyphStyle.radialScale, glyphStyle.lengthScale * vectorLength, glyphStyle.radialScale);
    matrix.compose(sample.position, quat, scale);
    arrowMesh.setMatrixAt(i, matrix);

    const hue = positiveModulo(moment.phase / (Math.PI * 2), 1);
    color.setHSL(hue, 0.78, 0.5 + 0.13 * sample.rho);
    arrowMesh.setColorAt(i, color);

    sumMx += weightedMx;
    sumMy += weightedMy;
    sumMz += weightedMz;
    sumRho += sample.rho;
  }

  arrowMesh.instanceMatrix.needsUpdate = true;
  arrowMesh.instanceColor.needsUpdate = true;

  const normMx = sumMx / sumRho;
  const normMy = sumMy / sumRho;
  const normMz = sumMz / sumRho;
  const mxy = Math.hypot(normMx, normMy);
  const netLength = clamp(Math.hypot(normMx, normMy, normMz), 0.02, 1.0);

  netDirection.set(normMx, normMz, normMy).normalize();
  netArrow.setDirection(netDirection);
  netArrow.setLength(1.05 * netLength, 0.18, 0.09);
  netArrow.visible = controlsUi.showNet.checked;

  outputs.time.textContent = `${localTime.toFixed(2)} s`;
  outputs.mxy.textContent = mxy.toFixed(2);
  outputs.mz.textContent = normMz.toFixed(2);
  outputs.chartMz.textContent = normMz.toFixed(2);
  outputs.cursor.style.left = `${(localTime / state.cycleSeconds) * 100}%`;
  updateCoil(localTime, sequence);
  drawMzChart(localTime, sequence);

  window.__mrDemoStats = {
    ready: true,
    samples: samples.length,
    sequence: state.sequence,
    phantomType: state.phantomType,
    tissuePreset: state.tissuePreset,
    t1Ms: state.t1Ms,
    t2Ms: state.t2Ms,
    localTime,
    mxy,
    mz: normMz,
  };
}

function getSequenceConfig() {
  if (state.sequence === 'spin-echo') {
    const rf90Seconds = 0.06;
    const refocusSeconds = 0.045;
    const echoTime = state.echoTime;
    const refocusCenter = echoTime / 2;
    const readoutSeconds = 0.07;
    return {
      type: 'spin-echo',
      name: 'Spin Echo',
      cycleSeconds: Math.max(3, echoTime + 1.4),
      rf90Seconds,
      refocusSeconds,
      refocusCenter,
      refocusStart: refocusCenter - refocusSeconds / 2,
      refocusEnd: refocusCenter + refocusSeconds / 2,
      echoTime,
      readoutStart: echoTime - readoutSeconds / 2,
      readoutEnd: echoTime + readoutSeconds / 2,
    };
  }

  return {
    type: 'single-pulse',
    name: 'Single RF pulse',
    cycleSeconds: 3,
    rf90Seconds: state.rfSeconds,
  };
}

function getMomentAt(sample, localTime, sequence) {
  if (sequence.type === 'spin-echo') {
    return getSpinEchoMoment(sample, localTime, sequence);
  }
  return getSinglePulseMoment(sample, localTime, sequence);
}

function getSinglePulseMoment(sample, localTime, sequence) {
  const pulseProgress = clamp(localTime / sequence.rf90Seconds, 0, 1);
  const rfEase = smoothstep(pulseProgress);
  const flip = degToRad(state.flipAngle);
  const freeTime = Math.max(0, localTime - sequence.rf90Seconds);
  const theta = localTime < sequence.rf90Seconds ? flip * rfEase : flip;
  const transverseStart = Math.sin(theta);
  const mzDuringPulse = Math.cos(theta);
  const postPulseMz = Math.cos(flip);
  const localT1 = (state.t1Ms / 1000) * sample.t1Scale;
  const localT2 = (state.t2Ms / 1000) * sample.t2Scale;
  const t2Decay = Math.exp(-freeTime / localT2);
  const transverse = transverseStart * t2Decay;
  const mz = localTime < sequence.rf90Seconds
    ? mzDuringPulse
    : recoverMz(postPulseMz, freeTime, localT1);
  const phase = sample.phaseOffset + Math.PI * 2 * state.b0Rate * localTime
    + Math.PI * 2 * state.offRes * sample.offResBase * freeTime;

  return {
    mx: transverse * Math.cos(phase),
    my: transverse * Math.sin(phase),
    mz,
    phase,
  };
}

function getSpinEchoMoment(sample, localTime, sequence) {
  const flip = degToRad(state.flipAngle);
  const refocus = degToRad(state.refocusAngle);
  const t1Seconds = (state.t1Ms / 1000) * sample.t1Scale;
  const localT2 = (state.t2Ms / 1000) * sample.t2Scale;
  const timeSinceExcitation = Math.max(0, localTime - sequence.rf90Seconds);
  const transverseBase = Math.sin(flip);
  const t2Decay = Math.exp(-timeSinceExcitation / localT2);
  let transverse = transverseBase * t2Decay;
  let phaseSpreadTime = timeSinceExcitation;
  let mz;

  if (localTime < sequence.rf90Seconds) {
    const theta = flip * smoothstep(clamp(localTime / sequence.rf90Seconds, 0, 1));
    transverse = Math.sin(theta);
    mz = Math.cos(theta);
    phaseSpreadTime = 0;
  } else if (localTime < sequence.refocusStart) {
    mz = recoverMz(Math.cos(flip), timeSinceExcitation, t1Seconds);
  } else if (localTime <= sequence.refocusEnd) {
    const mzBeforeRefocus = recoverMz(Math.cos(flip), sequence.refocusStart - sequence.rf90Seconds, t1Seconds);
    const mzAfterRefocus = mzBeforeRefocus * Math.cos(refocus);
    const refocusProgress = smoothstep(clamp((localTime - sequence.refocusStart) / sequence.refocusSeconds, 0, 1));
    mz = lerp(mzBeforeRefocus, mzAfterRefocus, refocusProgress);
    transverse *= lerp(1, refocusEfficiency(refocus), refocusProgress);
    phaseSpreadTime = sequence.refocusStart - sequence.rf90Seconds;
  } else {
    const mzBeforeRefocus = recoverMz(Math.cos(flip), sequence.refocusStart - sequence.rf90Seconds, t1Seconds);
    const mzAfterRefocus = mzBeforeRefocus * Math.cos(refocus);
    mz = 1 - (1 - mzAfterRefocus) * Math.exp(-(localTime - sequence.refocusEnd) / t1Seconds);
    transverse *= refocusEfficiency(refocus);
    phaseSpreadTime = Math.max(0, sequence.echoTime - localTime);
  }

  const phase = Math.PI * 2 * state.b0Rate * localTime
    + Math.PI * 2 * state.offRes * sample.offResBase * phaseSpreadTime;

  return {
    mx: transverse * Math.cos(phase),
    my: transverse * Math.sin(phase),
    mz,
    phase,
  };
}

function recoverMz(startMz, elapsedSeconds, t1Seconds = state.t1Ms / 1000) {
  return 1 - (1 - startMz) * Math.exp(-Math.max(0, elapsedSeconds) / t1Seconds);
}

function refocusEfficiency(refocusRadians) {
  return Math.sin(refocusRadians / 2) ** 2;
}

function averageMzAt(time, sequence) {
  if (samples.length === 0) {
    return 1;
  }

  let sumMz = 0;
  let sumRho = 0;
  for (const sample of samples) {
    sumMz += getMomentAt(sample, time, sequence).mz * sample.rho;
    sumRho += sample.rho;
  }
  return sumMz / sumRho;
}

function drawMzChart(localTime, sequence) {
  const canvas = outputs.mzChart;
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);

  const viewWidth = width / pixelRatio;
  const viewHeight = height / pixelRatio;
  const pad = { left: 28, right: 10, top: 10, bottom: 16 };
  const plotWidth = viewWidth - pad.left - pad.right;
  const plotHeight = viewHeight - pad.top - pad.bottom;

  ctx.strokeStyle = 'rgba(228, 235, 229, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(viewWidth - pad.right, y);
    ctx.stroke();
  }

  for (const event of timelineEvents(sequence)) {
    if (event.marker) {
      const x = pad.left + plotWidth * (event.time / sequence.cycleSeconds);
      ctx.strokeStyle = event.color;
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.strokeStyle = '#f0bd49';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const steps = 150;
  for (let i = 0; i <= steps; i += 1) {
    const time = (sequence.cycleSeconds * i) / steps;
    const mz = averageMzAt(time, sequence);
    const x = pad.left + (plotWidth * i) / steps;
    const y = pad.top + plotHeight * (1 - ((clamp(mz, -1, 1) + 1) / 2));
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  const cursorX = pad.left + plotWidth * (localTime / sequence.cycleSeconds);
  ctx.strokeStyle = '#84d1c5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cursorX, pad.top);
  ctx.lineTo(cursorX, pad.top + plotHeight);
  ctx.stroke();

  ctx.fillStyle = 'rgba(228, 235, 229, 0.76)';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillText('1', 8, pad.top + 4);
  ctx.fillText('0', 8, pad.top + plotHeight / 2 + 4);
  ctx.fillText('-1', 6, pad.top + plotHeight + 2);
  ctx.restore();
}

function rebuildPhantom() {
  disposePhantom();
  samples = [];

  const positions = [];
  const colors = [];
  const n = state.density;
  const step = 2 / Math.max(1, n - 1);

  for (let ix = 0; ix < n; ix += 1) {
    for (let iy = 0; iy < n; iy += 1) {
      for (let iz = 0; iz < n; iz += 1) {
        const x = -1 + ix * step + jitter(ix, iy, iz, 0) * step * 0.12;
        const y = -1 + iy * step + jitter(ix, iy, iz, 1) * step * 0.12;
        const z = -1 + iz * step + jitter(ix, iy, iz, 2) * step * 0.12;
        const phantomSample = samplePhantom(x, y, z);
        const rho = phantomSample.rho;

        if (rho <= 0.035) {
          continue;
        }

        const threePosition = toThreePosition(x, y, z).multiplyScalar(1.35);
        const phaseOffset = Math.PI * 2 * positiveModulo(0.37 * x - 0.21 * y + 0.13 * z + rho * 0.19, 1);
        const offResBase = 0.62 * x - 0.48 * y + 0.32 * z + (rho - 0.35) * 0.42;
        const t1Scale = phantomSample.t1Scale;
        const t2Scale = phantomSample.t2Scale;

        samples.push({
          x,
          y,
          z,
          rho,
          phaseOffset,
          offResBase,
          t1Scale,
          t2Scale,
          position: threePosition,
        });

        positions.push(threePosition.x, threePosition.y, threePosition.z);
        const baseColor = tissueColor(rho);
        colors.push(baseColor.r, baseColor.g, baseColor.b);
      }
    }
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const pointMaterial = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  phantomPoints = new THREE.Points(pointGeometry, pointMaterial);
  phantomGroup.add(phantomPoints);

  createVectorMesh();

  outputs.samples.textContent = samples.length.toString();
  window.__mrDemoReady = true;
  updateVisibility();
  updateMoments();
}

function createVectorMesh() {
  const arrowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  arrowMesh = new THREE.InstancedMesh(createArrowGeometry(state.vectorStyle), arrowMaterial, samples.length);
  arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrowMesh.frustumCulled = false;
  vectorGroup.add(arrowMesh);
}

function disposePhantom() {
  if (phantomPoints) {
    phantomGroup.remove(phantomPoints);
    phantomPoints.geometry.dispose();
    phantomPoints.material.dispose();
    phantomPoints = null;
  }

  disposeVectorMesh();
}

function disposeVectorMesh() {
  if (arrowMesh) {
    vectorGroup.remove(arrowMesh);
    arrowMesh.geometry.dispose();
    arrowMesh.material.dispose();
    arrowMesh = null;
  }
}

function buildAxes() {
  const length = 1.75;
  axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.95, -1.35, -0.95), length, 0xef6b53, 0.14, 0.07));
  axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.95, -1.35, -0.95), length, 0x6ec6a8, 0.14, 0.07));
  axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.95, -1.35, -0.95), length, 0xf0bd49, 0.14, 0.07));
  axesGroup.add(labelSprite('x', new THREE.Vector3(0.95, -1.35, -0.95), '#ef6b53'));
  axesGroup.add(labelSprite('y', new THREE.Vector3(-0.95, -1.35, 0.95), '#6ec6a8'));
  axesGroup.add(labelSprite('z / B0', new THREE.Vector3(-0.95, 0.62, -0.95), '#f0bd49'));
}

function buildB0Field() {
  const origins = [
    [-1.55, -1.15, -1.25],
    [1.55, -1.15, -1.25],
    [-1.55, -1.15, 1.25],
    [1.55, -1.15, 1.25],
    [0, -1.15, 1.55],
  ];

  origins.forEach((origin) => {
    const helper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(origin[0], origin[1], origin[2]),
      2.3,
      0x5aa7ff,
      0.18,
      0.08,
    );
    helper.line.material.transparent = true;
    helper.line.material.opacity = 0.62;
    helper.cone.material.transparent = true;
    helper.cone.material.opacity = 0.82;
    fieldGroup.add(helper);
  });

  fieldGroup.add(labelSprite('B0 field', new THREE.Vector3(1.58, 1.32, 1.25), '#8bc1ff'));
}

function buildCoil() {
  const copper = new THREE.MeshStandardMaterial({
    color: 0xd7843b,
    emissive: 0x3a1505,
    roughness: 0.34,
    metalness: 0.78,
  });
  const activeCopper = copper.clone();
  coilMaterials.push(copper, activeCopper);

  const ringGeometry = new THREE.TorusGeometry(1.62, 0.018, 12, 128);
  const ringA = new THREE.Mesh(ringGeometry, copper);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = -0.42;
  coilGroup.add(ringA);

  const ringB = new THREE.Mesh(ringGeometry.clone(), activeCopper);
  ringB.rotation.x = Math.PI / 2;
  ringB.position.y = 0.42;
  coilGroup.add(ringB);

  const bridgeMaterial = copper.clone();
  coilMaterials.push(bridgeMaterial);
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI * 2 * i) / 4 + Math.PI / 4;
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.84, 10, 1), bridgeMaterial);
    bridge.position.set(Math.cos(angle) * 1.62, 0, Math.sin(angle) * 1.62);
    coilGroup.add(bridge);
  }

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf0bd49, transparent: true, opacity: 0.55 });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.22, 0.45, 1.28),
    new THREE.Vector3(-0.46, 0.58, 1.52),
    new THREE.Vector3(0.42, 0.58, 1.52),
    new THREE.Vector3(1.18, 0.45, 1.28),
  ]);
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), lineMaterial);
  coilGroup.add(cable);
  coilGroup.add(labelSprite('RF / receive coil', new THREE.Vector3(-1.5, 0.9, 1.42), '#f0bd49'));
}

function updateCoil(localTime, sequence) {
  const active = timelineEvents(sequence).some((event) => (
    event.kind === 'rf'
    && localTime >= event.start
    && localTime <= event.end
  )) || (sequence.type === 'spin-echo'
    && localTime >= sequence.readoutStart
    && localTime <= sequence.readoutEnd);

  const pulse = active ? 0.35 + 0.3 * Math.sin(localTime * Math.PI * 8) : 0;
  for (const material of coilMaterials) {
    material.emissive.setHex(active ? 0x7a3b05 : 0x3a1505);
    material.emissiveIntensity = pulse;
  }
}

function applySequenceSettings() {
  const sequence = getSequenceConfig();
  state.cycleSeconds = sequence.cycleSeconds;
  state.elapsed = positiveModulo(state.elapsed, state.cycleSeconds);
  controlsUi.sequenceType.value = state.sequence;
  outputs.te.textContent = formatMs(state.echoTime * 1000);

  document.querySelectorAll('.spin-echo-only').forEach((element) => {
    element.hidden = state.sequence !== 'spin-echo';
  });

  outputs.sequenceReadout.textContent = sequence.name;
  if (sequence.type === 'spin-echo') {
    outputs.phaseLabelA.textContent = '90 deg RF';
    outputs.phaseLabelB.textContent = '180 deg refocus / echo';
    outputs.phaseLabelC.textContent = 'Readout';
  } else {
    outputs.phaseLabelA.textContent = 'RF pulse';
    outputs.phaseLabelB.textContent = 'Free precession under B0';
    outputs.phaseLabelC.textContent = 'Cycle reset';
  }

  renderTimeline(sequence);
  updateMoments();
}

function applyTissuePreset(presetKey) {
  const preset = TISSUE_PRESETS[presetKey];
  if (preset) {
    state.t1Ms = preset.t1Ms;
    state.t2Ms = preset.t2Ms;
    controlsUi.t1.value = String(state.t1Ms);
    controlsUi.t2.value = String(state.t2Ms);
  }

  updateRelaxationOutputs();
  updateMoments();
}

function updateRelaxationOutputs() {
  outputs.t1.textContent = formatMs(state.t1Ms);
  outputs.t2.textContent = formatMs(state.t2Ms);
}

function renderTimeline(sequence) {
  outputs.eventTrack.querySelectorAll('.event-zone, .event-marker').forEach((element) => {
    element.remove();
  });

  for (const event of timelineEvents(sequence)) {
    if (event.marker) {
      const marker = document.createElement('div');
      marker.className = 'event-marker';
      marker.style.left = `${(event.time / sequence.cycleSeconds) * 100}%`;
      marker.style.background = event.color;
      marker.title = event.label;
      outputs.eventTrack.insertBefore(marker, outputs.cursor);
      continue;
    }

    const zone = document.createElement('div');
    zone.className = `event-zone ${event.kind}`;
    zone.style.left = `${(event.start / sequence.cycleSeconds) * 100}%`;
    zone.style.width = `${((event.end - event.start) / sequence.cycleSeconds) * 100}%`;
    zone.title = event.label;
    outputs.eventTrack.insertBefore(zone, outputs.cursor);
  }
}

function timelineEvents(sequence) {
  if (sequence.type === 'spin-echo') {
    return [
      { kind: 'rf', label: '90 deg RF', start: 0, end: sequence.rf90Seconds },
      { kind: 'refocus', label: '180 deg refocusing RF', start: sequence.refocusStart, end: sequence.refocusEnd },
      { kind: 'readout', label: 'Readout window', start: sequence.readoutStart, end: sequence.readoutEnd },
      { marker: true, label: 'Echo time', time: sequence.echoTime, color: '#84d1c5' },
    ];
  }

  return [
    { kind: 'rf', label: 'RF pulse', start: 0, end: sequence.rf90Seconds },
  ];
}

function bindUi() {
  controlsUi.playPause.addEventListener('click', () => {
    state.playing = !state.playing;
    controlsUi.playPause.innerHTML = state.playing ? '&#10073;&#10073;' : '&#9658;';
    controlsUi.playPause.title = state.playing ? 'Pause' : 'Play';
    controlsUi.playPause.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  });

  controlsUi.resetTime.addEventListener('click', () => {
    state.elapsed = 0;
    updateMoments();
  });

  controlsUi.resetCamera.addEventListener('click', () => {
    camera.position.set(3.1, 2.2, 3.6);
    orbit.target.set(0, 0, 0);
    orbit.update();
  });

  controlsUi.sequenceType.addEventListener('change', () => {
    state.sequence = controlsUi.sequenceType.value;
    state.elapsed = 0;
    applySequenceSettings();
  });

  controlsUi.flipAngle.addEventListener('input', () => {
    state.flipAngle = Number(controlsUi.flipAngle.value);
    outputs.flip.textContent = `${state.flipAngle} deg`;
    updateMoments();
  });

  controlsUi.refocusAngle.addEventListener('input', () => {
    state.refocusAngle = Number(controlsUi.refocusAngle.value);
    outputs.refocus.textContent = `${state.refocusAngle} deg`;
    updateMoments();
  });

  controlsUi.echoTime.addEventListener('input', () => {
    state.echoTime = Number(controlsUi.echoTime.value);
    outputs.te.textContent = formatMs(state.echoTime * 1000);
    applySequenceSettings();
  });

  controlsUi.b0Rate.addEventListener('input', () => {
    state.b0Rate = Number(controlsUi.b0Rate.value);
    outputs.b0.textContent = `${state.b0Rate.toFixed(2)} Hz`;
    updateMoments();
  });

  controlsUi.offRes.addEventListener('input', () => {
    state.offRes = Number(controlsUi.offRes.value);
    outputs.off.textContent = `${state.offRes.toFixed(2)} Hz`;
    updateMoments();
  });

  controlsUi.tissuePreset.addEventListener('change', () => {
    state.tissuePreset = controlsUi.tissuePreset.value;
    applyTissuePreset(state.tissuePreset);
  });

  controlsUi.t1.addEventListener('input', () => {
    state.t1Ms = Number(controlsUi.t1.value);
    state.tissuePreset = 'custom';
    controlsUi.tissuePreset.value = 'custom';
    updateRelaxationOutputs();
    updateMoments();
  });

  controlsUi.t2.addEventListener('input', () => {
    state.t2Ms = Number(controlsUi.t2.value);
    state.tissuePreset = 'custom';
    controlsUi.tissuePreset.value = 'custom';
    updateRelaxationOutputs();
    updateMoments();
  });

  controlsUi.speed.addEventListener('input', () => {
    state.speed = Number(controlsUi.speed.value);
    outputs.speed.textContent = `${state.speed.toFixed(1)}x`;
  });

  controlsUi.density.addEventListener('input', () => {
    state.density = Number(controlsUi.density.value);
    outputs.density.textContent = state.density.toString();
  });

  controlsUi.density.addEventListener('change', () => {
    rebuildPhantom();
  });

  controlsUi.vectorStyle.addEventListener('change', () => {
    state.vectorStyle = controlsUi.vectorStyle.value;
    disposeVectorMesh();
    createVectorMesh();
    updateVisibility();
    updateMoments();
  });

  controlsUi.phantomType.addEventListener('change', () => {
    state.phantomType = controlsUi.phantomType.value;
    rebuildPhantom();
  });

  [controlsUi.showPhantom, controlsUi.showVectors, controlsUi.showNet, controlsUi.showField, controlsUi.showCoil].forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });

  window.addEventListener('resize', resize);
}

function updateVisibility() {
  phantomGroup.visible = controlsUi.showPhantom.checked;
  vectorGroup.visible = controlsUi.showVectors.checked;
  netArrow.visible = controlsUi.showNet.checked;
  fieldGroup.visible = controlsUi.showField.checked;
  coilGroup.visible = controlsUi.showCoil.checked;
}

function resize() {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function createArrowGeometry(style) {
  const builders = {
    classic() {
      const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.74, 9, 1, false);
      shaft.translate(0, 0.37, 0);
      const head = new THREE.ConeGeometry(0.055, 0.26, 16, 1);
      head.translate(0, 0.87, 0);
      return mergeGeometries([shaft, head]);
    },
    needle() {
      const shaft = new THREE.CylinderGeometry(0.008, 0.011, 0.9, 8, 1, false);
      shaft.translate(0, 0.45, 0);
      const head = new THREE.ConeGeometry(0.034, 0.16, 12, 1);
      head.translate(0, 0.98, 0);
      return mergeGeometries([shaft, head]);
    },
    cone() {
      const cone = new THREE.ConeGeometry(0.072, 0.72, 18, 1);
      cone.translate(0, 0.36, 0);
      return cone;
    },
    phase() {
      const stem = new THREE.CylinderGeometry(0.01, 0.012, 0.42, 8, 1, false);
      stem.translate(0, 0.21, 0);
      const disk = new THREE.CylinderGeometry(0.08, 0.08, 0.035, 28, 1, false);
      disk.translate(0, 0.46, 0);
      return mergeGeometries([stem, disk]);
    },
  };

  const geometry = (builders[style] || builders.classic)();
  geometry.computeVertexNormals();
  return geometry;
}

function samplePhantom(x, y, z) {
  if (state.phantomType === 'ellipsoid') {
    const inside = (x * x) / (0.72 * 0.72)
      + (y * y) / (0.9 * 0.9)
      + (z * z) / (0.72 * 0.72);

    if (inside > 1) {
      return { rho: 0, t1Scale: 1, t2Scale: 1 };
    }

    return { rho: 0.78, t1Scale: 1, t2Scale: 1 };
  }

  const rho = phantomDensity(x, y, z);
  return {
    rho,
    t1Scale: clamp(0.85 + rho * 0.28 + 0.06 * Math.cos(5 * y - 2 * z), 0.82, 1.22),
    t2Scale: clamp(0.72 + rho * 0.5 + 0.08 * Math.sin(8 * x + 3 * z), 0.62, 1.32),
  };
}

function phantomDensity(x, y, z) {
  let value = 0;
  for (const ellipsoid of SHEPP_LOGAN_3D) {
    const dx = x - ellipsoid.center[0];
    const dy = y - ellipsoid.center[1];
    const dz = z - ellipsoid.center[2];
    const cos = Math.cos(-ellipsoid.rotateZ);
    const sin = Math.sin(-ellipsoid.rotateZ);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const inside = (rx * rx) / (ellipsoid.axes[0] * ellipsoid.axes[0])
      + (ry * ry) / (ellipsoid.axes[1] * ellipsoid.axes[1])
      + (dz * dz) / (ellipsoid.axes[2] * ellipsoid.axes[2]);

    if (inside <= 1) {
      value += ellipsoid.amplitude;
    }
  }
  return clamp(value, 0, 1);
}

function tissueColor(rho) {
  const c = new THREE.Color();
  if (rho < 0.18) {
    return c.setHSL(0.55, 0.55, 0.42);
  }
  if (rho < 0.38) {
    return c.setHSL(0.47, 0.52, 0.46);
  }
  if (rho < 0.68) {
    return c.setHSL(0.09, 0.74, 0.58);
  }
  return c.setHSL(0.01, 0.76, 0.58);
}

function toThreePosition(x, y, z) {
  return new THREE.Vector3(x, z, y);
}

function labelSprite(text, position, cssColor) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 160;
  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(17, 19, 18, 0.82)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = cssColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = cssColor;
  ctx.fillText(text, 28, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(clamp(0.12 * text.length + 0.18, 0.3, 0.78), 0.17, 1);
  return sprite;
}

function jitter(ix, iy, iz, salt) {
  return Math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719 + salt * 19.19) * 0.5;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const SHEPP_LOGAN_3D = [
  { amplitude: 1.0, axes: [0.69, 0.92, 0.82], center: [0, 0, 0], rotateZ: 0 },
  { amplitude: -0.8, axes: [0.6624, 0.874, 0.76], center: [0, -0.0184, 0], rotateZ: 0 },
  { amplitude: -0.2, axes: [0.11, 0.31, 0.22], center: [0.22, 0, 0], rotateZ: degToRad(-18) },
  { amplitude: -0.2, axes: [0.16, 0.41, 0.28], center: [-0.22, 0, 0], rotateZ: degToRad(18) },
  { amplitude: 0.15, axes: [0.21, 0.25, 0.22], center: [0, 0.35, -0.15], rotateZ: 0 },
  { amplitude: 0.12, axes: [0.046, 0.046, 0.12], center: [0, 0.1, 0.24], rotateZ: 0 },
  { amplitude: 0.12, axes: [0.046, 0.046, 0.12], center: [0, -0.1, 0.24], rotateZ: 0 },
  { amplitude: 0.12, axes: [0.046, 0.023, 0.08], center: [-0.08, -0.605, 0], rotateZ: 0 },
  { amplitude: 0.12, axes: [0.023, 0.023, 0.075], center: [0, -0.606, 0.22], rotateZ: 0 },
  { amplitude: 0.12, axes: [0.023, 0.046, 0.075], center: [0.06, -0.605, -0.2], rotateZ: 0 },
];

const TISSUE_PRESETS = {
  whiteMatter: { t1Ms: 850, t2Ms: 80 },
  grayMatter: { t1Ms: 1300, t2Ms: 100 },
  csf: { t1Ms: 4000, t2Ms: 2000 },
  fat: { t1Ms: 250, t2Ms: 70 },
  muscle: { t1Ms: 900, t2Ms: 50 },
};

const GLYPH_STYLES = {
  classic: { lengthScale: 0.3, radialScale: 1 },
  needle: { lengthScale: 0.38, radialScale: 1 },
  cone: { lengthScale: 0.42, radialScale: 1.12 },
  phase: { lengthScale: 0.44, radialScale: 1.18 },
};

buildAxes();
buildB0Field();
buildCoil();
rebuildPhantom();
bindUi();
resize();
updateRelaxationOutputs();
applySequenceSettings();
requestAnimationFrame(animate);
