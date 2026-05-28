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
  referenceFrame: document.querySelector('#referenceFrame'),
  flipAngle: document.querySelector('#flipAngle'),
  refocusAngle: document.querySelector('#refocusAngle'),
  echoTime: document.querySelector('#echoTime'),
  b0Rate: document.querySelector('#b0Rate'),
  offRes: document.querySelector('#offRes'),
  sliceGradientEnabled: document.querySelector('#sliceGradientEnabled'),
  sliceCenter: document.querySelector('#sliceCenter'),
  sliceGradient: document.querySelector('#sliceGradient'),
  rfBandwidth: document.querySelector('#rfBandwidth'),
  tissuePreset: document.querySelector('#tissuePreset'),
  t1: document.querySelector('#t1'),
  t2: document.querySelector('#t2'),
  speed: document.querySelector('#speed'),
  density: document.querySelector('#density'),
  vectorStyle: document.querySelector('#vectorStyle'),
  phantomType: document.querySelector('#phantomType'),
  loopStrip: document.querySelector('#loopStrip'),
  loopStartHandle: document.querySelector('#loopStartHandle'),
  loopEndHandle: document.querySelector('#loopEndHandle'),
  showPhantom: document.querySelector('#showPhantom'),
  showVectors: document.querySelector('#showVectors'),
  showNet: document.querySelector('#showNet'),
  showField: document.querySelector('#showField'),
  showCoil: document.querySelector('#showCoil'),
  showSlice: document.querySelector('#showSlice'),
};

const outputs = {
  flip: document.querySelector('#flipValue'),
  refocus: document.querySelector('#refocusValue'),
  te: document.querySelector('#teValue'),
  b0: document.querySelector('#b0Value'),
  off: document.querySelector('#offValue'),
  sliceCenter: document.querySelector('#sliceCenterValue'),
  sliceGradient: document.querySelector('#sliceGradientValue'),
  rfBandwidth: document.querySelector('#rfBandwidthValue'),
  sliceThickness: document.querySelector('#sliceThicknessValue'),
  rfMode: document.querySelector('#rfModeValue'),
  rfCenter: document.querySelector('#rfCenterValue'),
  rfPeakB1: document.querySelector('#rfPeakB1Value'),
  rfTbw: document.querySelector('#rfTbwValue'),
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
  chartRf: document.querySelector('#chartRfReadout'),
  rfChart: document.querySelector('#rfChart'),
  chartSsg: document.querySelector('#chartSsgReadout'),
  ssgChart: document.querySelector('#ssgChart'),
  chartMz: document.querySelector('#chartMzReadout'),
  mzChart: document.querySelector('#mzChart'),
  chartMxy: document.querySelector('#chartMxyReadout'),
  mxyChart: document.querySelector('#mxyChart'),
  larmor: document.querySelector('#larmorValue'),
  larmorPeriod: document.querySelector('#larmorPeriodValue'),
  loopSelection: document.querySelector('#loopSelection'),
  loopStart: document.querySelector('#loopStartReadout'),
  loopEnd: document.querySelector('#loopEndReadout'),
  zoom: document.querySelector('#zoomReadout'),
};

const state = {
  sequence: 'single-pulse',
  playing: true,
  elapsed: 0,
  cycleSeconds: 3,
  referenceFrame: 'laboratory',
  flipAngle: 90,
  refocusAngle: 180,
  echoTime: 0.16,
  b0Tesla: 1.5,
  offRes: 0.45,
  sliceGradientEnabled: true,
  sliceCenterMm: 0,
  sliceGradientMtM: 3,
  rfBandwidthKhz: 5,
  tissuePreset: 'grayMatter',
  t1Ms: 1300,
  t2Ms: 100,
  speed: 1e-9,
  density: 12,
  vectorStyle: 'classic',
  phantomType: 'shepp-logan',
  loopStart: 0,
  loopEnd: 0.08,
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
const sliceGroup = new THREE.Group();
const axesGroup = new THREE.Group();
scene.add(phantomGroup, vectorGroup, fieldGroup, coilGroup, sliceGroup, axesGroup);

let samples = [];
let arrowMesh = null;
let phantomPoints = null;
const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const scale = new THREE.Vector3();
const netDirection = new THREE.Vector3(0, 1, 0);
const coilMaterials = [];
const sliceMaterials = [];
const TAU = Math.PI * 2;
const PROTON_GYROMAGNETIC_RATIO_MHZ_T = 42.57747892;
const PROTON_GYROMAGNETIC_RATIO_HZ_T = PROTON_GYROMAGNETIC_RATIO_MHZ_T * 1_000_000;
const PROTON_GYROMAGNETIC_RATIO_RAD_T = TAU * PROTON_GYROMAGNETIC_RATIO_HZ_T;
const RF_90_SECONDS = 0.003;
const RF_EPSILON_SECONDS = 0.0001;
const RF_INTEGRATION_STEPS = 2048;
const SPEED_SLIDER_MIN = -9;
const SPEED_SLIDER_MAX = 0.5;
const PHANTOM_FOV_MM = 220;
const PHANTOM_SCENE_SCALE = 1.35;

const netArrow = new THREE.ArrowHelper(netDirection, new THREE.Vector3(0, 0, 0), 0.9, 0xf3b846, 0.17, 0.08);
netArrow.line.material.linewidth = 3;
scene.add(netArrow);

let lastTime = performance.now();

function animate(now) {
  const dt = clamp((now - lastTime) / 1000, 0, 0.05);
  lastTime = now;
  const sequence = getSequenceConfig();
  const loop = normalizeLoopRange(sequence);

  if (state.playing) {
    state.elapsed = advanceLoopTime(state.elapsed, dt * state.speed, loop);
  } else {
    state.elapsed = clamp(state.elapsed, loop.start, loop.end);
  }

  updateMoments(sequence);
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateMoments(sequence = getSequenceConfig()) {
  if (!arrowMesh || samples.length === 0) {
    return;
  }

  const loop = normalizeLoopRange(sequence);
  const localTime = clamp(state.elapsed, loop.start, loop.end);

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

    sumMx += weightedMx;
    sumMy += weightedMy;
    sumMz += weightedMz;
    sumRho += sample.rho;
  }

  arrowMesh.instanceMatrix.needsUpdate = true;
  const normMx = sumMx / sumRho;
  const normMy = sumMy / sumRho;
  const normMz = sumMz / sumRho;
  const mxy = Math.hypot(normMx, normMy);
  const netLength = clamp(Math.hypot(normMx, normMy, normMz), 0.02, 1.0);

  netDirection.set(normMx, normMz, normMy).normalize();
  netArrow.setDirection(netDirection);
  netArrow.setLength(1.05 * netLength, 0.18, 0.09);
  netArrow.visible = controlsUi.showNet.checked;

  outputs.time.textContent = formatSimulationTime(localTime);
  outputs.mxy.textContent = mxy.toFixed(2);
  outputs.mz.textContent = normMz.toFixed(2);
  outputs.chartRf.textContent = formatB1Microtesla(rfB1At(localTime, sequence));
  outputs.chartSsg.textContent = `${sliceGradientAt(localTime, sequence).toFixed(1)} mT/m`;
  outputs.chartMz.textContent = normMz.toFixed(2);
  outputs.chartMxy.textContent = mxy.toFixed(2);
  outputs.cursor.style.left = `${timeToWindowPercent(localTime, loop)}%`;
  updateCoil(localTime, sequence);
  drawRfChart(localTime, sequence, loop);
  drawSsgChart(localTime, sequence, loop);
  drawMzChart(localTime, sequence, loop);
  drawMxyChart(localTime, sequence, loop);

  window.__mrDemoStats = {
    ready: true,
    samples: samples.length,
    sequence: state.sequence,
    referenceFrame: state.referenceFrame,
    phantomType: state.phantomType,
    tissuePreset: state.tissuePreset,
    t1Ms: state.t1Ms,
    t2Ms: state.t2Ms,
    t2InhomMs: Number.isFinite(t2InhomSeconds()) ? t2InhomSeconds() * 1000 : null,
    localTime,
    cycleSeconds: sequence.cycleSeconds,
    rf90Seconds: sequence.rf90Seconds,
    refocusSeconds: sequence.refocusSeconds || 0,
    refocusCenter: sequence.refocusCenter || null,
    echoTime: sequence.echoTime || null,
    b0Tesla: state.b0Tesla,
    larmorHz: larmorFrequencyHz(),
    larmorPeriodSeconds: larmorPeriodSeconds(),
    sliceGradientEnabled: state.sliceGradientEnabled,
    sliceCenterMm: state.sliceCenterMm,
    sliceGradientMtM: state.sliceGradientMtM,
    rfBandwidthKhz: state.rfBandwidthKhz,
    sliceThicknessMm: sliceThicknessMm(),
    rfMode: rfModeLabel(),
    rfCenterHz: rfCenterFrequencyHz(),
    rfPeakB1Tesla: peakRfB1TeslaForAngle(state.flipAngle, sequence.rf90Seconds),
    rfTbw90: rfTimeBandwidthProduct(sequence.rf90Seconds),
    rfB1Tesla: rfB1At(localTime, sequence),
    ssgMtM: sliceGradientAt(localTime, sequence),
    displayedMainFieldCycles: displayedMainFieldCycles(localTime),
    speed: state.speed,
    speedSlider: Number(controlsUi.speed.value),
    loopStart: loop.start,
    loopEnd: loop.end,
    loopSpan: loop.end - loop.start,
    mxy,
    mz: normMz,
  };
}

function getSequenceConfig() {
  if (state.sequence === 'spin-echo') {
    const rf90Seconds = rfPulseSecondsForAngle(state.flipAngle);
    const refocusSeconds = rfPulseSecondsForAngle(state.refocusAngle);
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
    rf90Seconds: rfPulseSecondsForAngle(state.flipAngle),
  };
}

function rfPulseSecondsForAngle(angleDegrees) {
  return RF_90_SECONDS * Math.max(0, angleDegrees) / 90;
}

function larmorFrequencyHz() {
  return PROTON_GYROMAGNETIC_RATIO_HZ_T * state.b0Tesla;
}

function larmorPeriodSeconds() {
  return 1 / larmorFrequencyHz();
}

function displayedMainFieldCycles(localTime) {
  return state.referenceFrame === 'laboratory' ? larmorFrequencyHz() * localTime : 0;
}

function defaultLoopRange(sequence) {
  if (sequence.type === 'spin-echo') {
    return {
      start: 0,
      end: clamp(sequence.echoTime + 0.08, 0.14, sequence.cycleSeconds),
    };
  }

  return {
    start: 0,
    end: Math.min(Math.max(0.08, sequence.rf90Seconds * 24), sequence.cycleSeconds),
  };
}

function normalizeLoopRange(sequence = getSequenceConfig()) {
  const minSpan = getMinLoopSpan(sequence);
  let start = Number.isFinite(state.loopStart) ? state.loopStart : 0;
  let end = Number.isFinite(state.loopEnd) ? state.loopEnd : sequence.cycleSeconds;

  start = clamp(start, 0, Math.max(0, sequence.cycleSeconds - minSpan));
  end = clamp(end, start + minSpan, sequence.cycleSeconds);

  state.loopStart = start;
  state.loopEnd = end;
  return { start, end, span: end - start };
}

function resetLoopRange(sequence = getSequenceConfig()) {
  const range = defaultLoopRange(sequence);
  state.loopStart = range.start;
  state.loopEnd = range.end;
  state.elapsed = range.start;
  return normalizeLoopRange(sequence);
}

function getMinLoopSpan(sequence) {
  return Math.min(0.08, Math.max(0.03, sequence.cycleSeconds * 0.01));
}

function advanceLoopTime(currentTime, deltaSeconds, loop) {
  if (loop.span <= 0) {
    return loop.start;
  }

  return loop.start + positiveModulo(currentTime - loop.start + deltaSeconds, loop.span);
}

function timeToWindowPercent(time, loop) {
  if (loop.span <= 0) {
    return 0;
  }
  return clamp(((time - loop.start) / loop.span) * 100, 0, 100);
}

function getMomentAt(sample, localTime, sequence) {
  if (sequence.type === 'spin-echo') {
    return getSpinEchoMoment(sample, localTime, sequence);
  }
  return getSinglePulseMoment(sample, localTime, sequence);
}

function getSinglePulseMoment(sample, localTime, sequence) {
  const profile = sliceSelectionProfile(sample);
  const rfSeconds = Math.max(sequence.rf90Seconds, RF_EPSILON_SECONDS);
  const pulseProgress = clamp(localTime / rfSeconds, 0, 1);
  const rfEase = smoothstep(pulseProgress);
  const flip = degToRad(state.flipAngle) * profile;
  const freeTime = Math.max(0, localTime - sequence.rf90Seconds);
  const inPulse = localTime < sequence.rf90Seconds;
  const theta = inPulse ? flip * rfEase : flip;
  const transverseStart = Math.sin(theta);
  const mzDuringPulse = Math.cos(theta);
  const postPulseMz = Math.cos(flip);
  const localT1 = (state.t1Ms / 1000) * sample.t1Scale;
  const localT2 = (state.t2Ms / 1000) * sample.t2Scale;
  const t2Decay = Math.exp(-freeTime / localT2);
  const transverse = transverseStart * t2Decay;
  const mz = inPulse
    ? mzDuringPulse
    : recoverMz(postPulseMz, freeTime, localT1);
  const phaseCycles = displayedMainFieldCycles(localTime) + state.offRes * sample.offResBase * freeTime;
  const phase = sample.phaseOffset + TAU * positiveModulo(phaseCycles, 1);

  return {
    mx: transverse * Math.cos(phase),
    my: transverse * Math.sin(phase),
    mz,
    phase,
  };
}

function getSpinEchoMoment(sample, localTime, sequence) {
  const profile = sliceSelectionProfile(sample);
  const flip = degToRad(state.flipAngle) * profile;
  const refocus = degToRad(state.refocusAngle) * profile;
  const t1Seconds = (state.t1Ms / 1000) * sample.t1Scale;
  const localT2 = (state.t2Ms / 1000) * sample.t2Scale;
  const localT2Inhom = t2InhomSeconds();
  const rfSeconds = Math.max(sequence.rf90Seconds, RF_EPSILON_SECONDS);
  const refocusSeconds = Math.max(sequence.refocusSeconds, RF_EPSILON_SECONDS);
  const timeSinceExcitation = Math.max(0, localTime - sequence.rf90Seconds);
  const transverseBase = Math.sin(flip);
  const echoEnvelope = getSpinEchoEnvelope(localTime, sequence, localT2, localT2Inhom);
  const refocusing = localTime >= sequence.refocusStart && localTime <= sequence.refocusEnd;
  const refocused = localTime > sequence.refocusEnd;
  const refocusScale = refocused ? refocusEfficiency(refocus) : 1;
  let transverse = transverseBase * echoEnvelope.transverse * refocusScale;
  let phaseSpreadTime = refocused ? sequence.echoTime - localTime : timeSinceExcitation;
  let mz;

  if (localTime < sequence.rf90Seconds) {
    const theta = flip * smoothstep(clamp(localTime / rfSeconds, 0, 1));
    transverse = Math.sin(theta);
    mz = Math.cos(theta);
    phaseSpreadTime = 0;
  } else if (localTime < sequence.refocusStart) {
    mz = recoverMz(Math.cos(flip), timeSinceExcitation, t1Seconds);
  } else if (localTime <= sequence.refocusEnd) {
    const refocusProgress = smoothstep(clamp((localTime - sequence.refocusStart) / refocusSeconds, 0, 1));
    const beforeVector = getSpinEchoPreRefocusVector(sample, localTime, sequence, localT2, localT2Inhom, t1Seconds, transverseBase, flip);
    const flippedVector = rotateVectorTowardNegative(beforeVector, refocus * refocusProgress);
    return {
      mx: flippedVector.mx,
      my: flippedVector.my,
      mz: flippedVector.mz,
      phase: Math.atan2(flippedVector.my, flippedVector.mx),
    };
  } else {
    const mzBeforeRefocus = recoverMz(Math.cos(flip), sequence.refocusStart - sequence.rf90Seconds, t1Seconds);
    const mzAfterRefocus = -mzBeforeRefocus * refocusEfficiency(refocus);
    mz = 1 - (1 - mzAfterRefocus) * Math.exp(-(localTime - sequence.refocusEnd) / t1Seconds);
  }

  const phaseCycles = displayedMainFieldCycles(localTime) + state.offRes * sample.offResBase * phaseSpreadTime;
  const phase = TAU * positiveModulo(phaseCycles, 1) + (refocused || refocusing ? Math.PI : 0);

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

function t2InhomSeconds() {
  const spreadHz = Math.max(0, state.offRes);
  if (spreadHz < 1e-6) {
    return Number.POSITIVE_INFINITY;
  }
  return 1 / (TAU * spreadHz);
}

function sliceThicknessMm() {
  const bandwidthHz = Math.max(0.001, state.rfBandwidthKhz) * 1000;
  const gradientTeslaPerMeter = Math.max(0.001, state.sliceGradientMtM) / 1000;
  return (bandwidthHz / (PROTON_GYROMAGNETIC_RATIO_HZ_T * gradientTeslaPerMeter)) * 1000;
}

function sampleSliceMm(sample) {
  return sample.z * PHANTOM_FOV_MM * 0.5;
}

function rfCenterFrequencyHz() {
  if (!state.sliceGradientEnabled) {
    return larmorFrequencyHz();
  }

  const gradientTeslaPerMeter = state.sliceGradientMtM / 1000;
  const centerMeters = state.sliceCenterMm / 1000;
  return larmorFrequencyHz() + PROTON_GYROMAGNETIC_RATIO_HZ_T * gradientTeslaPerMeter * centerMeters;
}

function rfModeLabel() {
  return state.sliceGradientEnabled ? 'Windowed sinc' : 'Single frequency';
}

function rfTimeBandwidthProduct(durationSeconds) {
  if (!state.sliceGradientEnabled) {
    return null;
  }
  return Math.max(0, state.rfBandwidthKhz) * 1000 * durationSeconds;
}

function rfPulseEvents(sequence = getSequenceConfig()) {
  if (sequence.type === 'spin-echo') {
    return [
      {
        label: '90 deg RF',
        start: 0,
        end: sequence.rf90Seconds,
        angle: state.flipAngle,
      },
      {
        label: '180 deg RF',
        start: sequence.refocusStart,
        end: sequence.refocusEnd,
        angle: state.refocusAngle,
      },
    ];
  }

  return [
    {
      label: 'RF pulse',
      start: 0,
      end: sequence.rf90Seconds,
      angle: state.flipAngle,
    },
  ];
}

function rfB1At(time, sequence = getSequenceConfig()) {
  for (const pulse of rfPulseEvents(sequence)) {
    if (time < pulse.start || time > pulse.end) {
      continue;
    }

    const duration = Math.max(RF_EPSILON_SECONDS, pulse.end - pulse.start);
    const relativeTime = clamp(time - pulse.start, 0, duration);
    return rfPulseB1TeslaAt(relativeTime, duration, pulse.angle);
  }
  return 0;
}

function rfPulseB1TeslaAt(relativeTime, durationSeconds, angleDegrees) {
  const shape = rfPulseShape(relativeTime, durationSeconds);
  return rfPulseScaleTesla(angleDegrees, durationSeconds) * shape;
}

function peakRfB1TeslaForAngle(angleDegrees, durationSeconds) {
  const duration = Math.max(RF_EPSILON_SECONDS, durationSeconds);
  const scaleTesla = rfPulseScaleTesla(angleDegrees, duration);
  if (!state.sliceGradientEnabled) {
    return Math.abs(scaleTesla);
  }

  let peakShape = 0;
  for (let i = 0; i <= RF_INTEGRATION_STEPS; i += 1) {
    const time = (duration * i) / RF_INTEGRATION_STEPS;
    peakShape = Math.max(peakShape, Math.abs(rfPulseShape(time, duration)));
  }
  return Math.abs(scaleTesla) * peakShape;
}

function rfPulseScaleTesla(angleDegrees, durationSeconds) {
  const flipRadians = degToRad(angleDegrees);
  const duration = Math.max(RF_EPSILON_SECONDS, durationSeconds);
  const shapeIntegral = integrateRfPulseShape(duration);
  if (Math.abs(shapeIntegral) < 1e-12) {
    return 0;
  }
  return flipRadians / (PROTON_GYROMAGNETIC_RATIO_RAD_T * shapeIntegral);
}

function integrateRfPulseShape(durationSeconds) {
  const duration = Math.max(RF_EPSILON_SECONDS, durationSeconds);
  if (!state.sliceGradientEnabled) {
    return duration;
  }

  let sum = 0;
  for (let i = 0; i < RF_INTEGRATION_STEPS; i += 1) {
    const time = duration * ((i + 0.5) / RF_INTEGRATION_STEPS);
    sum += rfPulseShape(time, duration);
  }
  return (sum / RF_INTEGRATION_STEPS) * duration;
}

function rfPulseShape(relativeTime, durationSeconds) {
  if (!state.sliceGradientEnabled) {
    return 1;
  }

  const duration = Math.max(RF_EPSILON_SECONDS, durationSeconds);
  const progress = clamp(relativeTime / duration, 0, 1);
  const centeredTime = relativeTime - duration / 2;
  const bandwidthHz = Math.max(0.001, state.rfBandwidthKhz) * 1000;
  const hamming = 0.54 - 0.46 * Math.cos(TAU * progress);
  return normalizedSinc(bandwidthHz * centeredTime) * hamming;
}

function normalizedSinc(value) {
  if (Math.abs(value) < 1e-8) {
    return 1;
  }
  return Math.sin(Math.PI * value) / (Math.PI * value);
}

function sliceSelectionProfile(sample) {
  if (!state.sliceGradientEnabled) {
    return 1;
  }

  const thickness = sliceThicknessMm();
  const halfThickness = Math.max(1, thickness * 0.5);
  const transition = Math.max(2, halfThickness * 0.22);
  const core = Math.max(0, halfThickness - transition);
  const distance = Math.abs(sampleSliceMm(sample) - state.sliceCenterMm);

  if (distance <= core) {
    return 1;
  }
  if (distance >= core + transition * 2) {
    return 0;
  }

  const amount = (distance - core) / (transition * 2);
  return 0.5 + 0.5 * Math.cos(Math.PI * amount);
}

function sliceGradientAt(time, sequence = getSequenceConfig()) {
  if (!state.sliceGradientEnabled) {
    return 0;
  }

  const waveform = sliceGradientWaveform(sequence);
  for (const lobe of waveform) {
    if (time >= lobe.start && time <= lobe.end) {
      return state.sliceGradientMtM * lobe.level;
    }
  }
  return 0;
}

function sliceGradientWaveform(sequence = getSequenceConfig()) {
  if (!state.sliceGradientEnabled) {
    return [];
  }

  const lobes = [];
  if (sequence.rf90Seconds > RF_EPSILON_SECONDS) {
    lobes.push({
      label: sequence.type === 'spin-echo' ? '90 deg slice select' : 'RF slice select',
      start: 0,
      end: sequence.rf90Seconds,
      level: 1,
    });

    const rephaseDuration = sequence.rf90Seconds / 2;
    lobes.push({
      label: 'Slice rephase lobe',
      start: sequence.rf90Seconds,
      end: sequence.rf90Seconds + rephaseDuration,
      level: -1,
    });
  }

  if (sequence.type === 'spin-echo' && sequence.refocusSeconds > RF_EPSILON_SECONDS) {
    lobes.push({
      label: '180 deg slice select',
      start: sequence.refocusStart,
      end: sequence.refocusEnd,
      level: 1,
    });
  }

  return lobes;
}

function getSpinEchoPreRefocusVector(sample, localTime, sequence, t2Seconds, t2Inhom, t1Seconds, transverseBase, flipRadians) {
  const envelope = getSpinEchoEnvelope(localTime, sequence, t2Seconds, t2Inhom);
  const transverse = transverseBase * envelope.transverse;
  const mz = recoverMz(Math.cos(flipRadians), envelope.timeSinceExcitation, t1Seconds);
  const phaseCycles = displayedMainFieldCycles(localTime) + state.offRes * sample.offResBase * envelope.timeSinceExcitation;
  const phase = TAU * positiveModulo(phaseCycles, 1);

  return {
    mx: transverse * Math.cos(phase),
    my: transverse * Math.sin(phase),
    mz,
    phase,
  };
}

function rotateVectorTowardNegative(vector, angle) {
  const vx = vector.mx;
  const vy = vector.my;
  const vz = vector.mz;
  const magnitude = Math.hypot(vx, vy, vz);
  if (magnitude < 1e-8) {
    return { mx: 0, my: 0, mz: 0 };
  }

  const reference = Math.abs(vz / magnitude) < 0.9
    ? { x: 0, y: 0, z: 1 }
    : { x: 1, y: 0, z: 0 };
  let ax = vy * reference.z - vz * reference.y;
  let ay = vz * reference.x - vx * reference.z;
  let az = vx * reference.y - vy * reference.x;
  const axisLength = Math.hypot(ax, ay, az);
  ax /= axisLength;
  ay /= axisLength;
  az /= axisLength;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const crossX = ay * vz - az * vy;
  const crossY = az * vx - ax * vz;
  const crossZ = ax * vy - ay * vx;

  return {
    mx: vx * cos + crossX * sin,
    my: vy * cos + crossY * sin,
    mz: vz * cos + crossZ * sin,
  };
}

function getSpinEchoEnvelope(localTime, sequence, t2Seconds, t2Inhom) {
  const timeSinceExcitation = Math.max(0, localTime - sequence.rf90Seconds);
  const refocused = localTime > sequence.refocusEnd;
  const inhomElapsed = refocused
    ? Math.abs(localTime - sequence.echoTime)
    : timeSinceExcitation;
  const t2Decay = Math.exp(-timeSinceExcitation / t2Seconds);
  const inhomDecay = Number.isFinite(t2Inhom)
    ? Math.exp(-inhomElapsed / t2Inhom)
    : 1;

  return {
    timeSinceExcitation,
    inhomElapsed,
    t2Decay,
    inhomDecay,
    transverse: t2Decay * inhomDecay,
    t2Seconds,
    t2Inhom,
  };
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

function averageMxyAt(time, sequence) {
  if (samples.length === 0) {
    return 0;
  }

  let sumMx = 0;
  let sumMy = 0;
  let sumRho = 0;
  for (const sample of samples) {
    const moment = getMomentAt(sample, time, sequence);
    sumMx += moment.mx * sample.rho;
    sumMy += moment.my * sample.rho;
    sumRho += sample.rho;
  }
  return Math.hypot(sumMx / sumRho, sumMy / sumRho);
}

function drawMzChart(localTime, sequence, loop = normalizeLoopRange(sequence)) {
  drawSignalChart({
    canvas: outputs.mzChart,
    localTime,
    sequence,
    loop,
    valueAt: averageMzAt,
    range: [-1, 1],
    color: '#f0bd49',
    labels: ['1', '0', '-1'],
  });
}

function drawRfChart(localTime, sequence, loop = normalizeLoopRange(sequence)) {
  const peakTesla = Math.max(
    0.25e-6,
    ...rfPulseEvents(sequence).map((event) => peakRfB1TeslaForAngle(event.angle, event.end - event.start)),
  );
  const peakMicrotesla = peakTesla * 1e6;
  drawSignalChart({
    canvas: outputs.rfChart,
    localTime,
    sequence,
    loop,
    valueAt: (time, chartSequence) => rfB1At(time, chartSequence) * 1e6,
    range: [-peakMicrotesla, peakMicrotesla],
    color: state.sliceGradientEnabled ? '#d79cff' : '#ef6b53',
    labels: [`+${peakMicrotesla.toFixed(1)}`, '0', `-${peakMicrotesla.toFixed(1)}`],
    baselineValue: 0,
    fillColor: state.sliceGradientEnabled ? 'rgba(184, 92, 255, 0.24)' : 'rgba(193, 63, 50, 0.28)',
    steps: 800,
    padLeft: 36,
  });
}

function drawSsgChart(localTime, sequence, loop = normalizeLoopRange(sequence)) {
  const gradientLimit = Math.max(1, state.sliceGradientMtM);
  drawSignalChart({
    canvas: outputs.ssgChart,
    localTime,
    sequence,
    loop,
    valueAt: sliceGradientAt,
    range: [-gradientLimit, gradientLimit],
    color: '#d79cff',
    labels: [`+${gradientLimit.toFixed(1)}`, '0', `-${gradientLimit.toFixed(1)}`],
    baselineValue: 0,
    fillColor: 'rgba(184, 92, 255, 0.3)',
    steps: 600,
    padLeft: 34,
  });
}

function drawMxyChart(localTime, sequence, loop = normalizeLoopRange(sequence)) {
  drawSignalChart({
    canvas: outputs.mxyChart,
    localTime,
    sequence,
    loop,
    valueAt: averageMxyAt,
    range: [0, 1],
    color: '#84d1c5',
    labels: ['1', '0.5', '0'],
  });
}

function drawSignalChart({
  canvas,
  localTime,
  sequence,
  loop,
  valueAt,
  range,
  color,
  labels,
  baselineValue = null,
  fillColor = null,
  steps = 150,
  padLeft = 28,
}) {
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
  const pad = { left: padLeft, right: 10, top: 10, bottom: 16 };
  const plotWidth = viewWidth - pad.left - pad.right;
  const plotHeight = viewHeight - pad.top - pad.bottom;
  const [minValue, maxValue] = range;
  const valueToY = (value) => {
    const normalized = (clamp(value, minValue, maxValue) - minValue) / (maxValue - minValue);
    return pad.top + plotHeight * (1 - normalized);
  };

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
    if (event.marker && event.time >= loop.start && event.time <= loop.end) {
      const x = pad.left + plotWidth * ((event.time - loop.start) / loop.span);
      ctx.strokeStyle = event.color;
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (baselineValue !== null) {
    const baselineY = valueToY(baselineValue);
    ctx.strokeStyle = 'rgba(228, 235, 229, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, baselineY);
    ctx.lineTo(viewWidth - pad.right, baselineY);
    ctx.stroke();
  }

  if (fillColor && baselineValue !== null) {
    const baselineY = valueToY(baselineValue);
    ctx.fillStyle = fillColor;
    for (let i = 0; i < steps; i += 1) {
      const time = loop.start + (loop.span * (i + 0.5)) / steps;
      const value = valueAt(time, sequence);
      if (Math.abs(value - baselineValue) < 1e-8) {
        continue;
      }

      const x = pad.left + (plotWidth * i) / steps;
      const nextX = pad.left + (plotWidth * (i + 1)) / steps;
      const y = valueToY(value);
      ctx.fillRect(x, Math.min(y, baselineY), Math.max(1, nextX - x + 0.5), Math.abs(baselineY - y));
    }
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const time = loop.start + (loop.span * i) / steps;
    const value = valueAt(time, sequence);
    const x = pad.left + (plotWidth * i) / steps;
    const y = valueToY(value);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  const cursorX = pad.left + plotWidth * ((localTime - loop.start) / loop.span);
  ctx.strokeStyle = '#84d1c5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cursorX, pad.top);
  ctx.lineTo(cursorX, pad.top + plotHeight);
  ctx.stroke();

  ctx.fillStyle = 'rgba(228, 235, 229, 0.76)';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillText(labels[0], 8, pad.top + 4);
  ctx.fillText(labels[1], 8, pad.top + plotHeight / 2 + 4);
  ctx.fillText(labels[2], 8, pad.top + plotHeight + 2);
  ctx.fillStyle = 'rgba(228, 235, 229, 0.68)';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(formatTimeCompact(loop.start), pad.left, viewHeight - 3);
  ctx.textAlign = 'right';
  ctx.fillText(formatTimeCompact(loop.end), viewWidth - pad.right, viewHeight - 3);
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

        const threePosition = toThreePosition(x, y, z).multiplyScalar(PHANTOM_SCENE_SCALE);
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
        const baseColor = sampleDisplayColor(samples[samples.length - 1]);
        colors.push(baseColor.r, baseColor.g, baseColor.b);
      }
    }
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const pointMaterial = new THREE.PointsMaterial({
    size: 0.024,
    vertexColors: true,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  phantomPoints = new THREE.Points(pointGeometry, pointMaterial);
  phantomGroup.add(phantomPoints);

  createVectorMesh();
  updateSliceVisual();

  outputs.samples.textContent = samples.length.toString();
  window.__mrDemoReady = true;
  updateVisibility();
  updateMoments();
}

function createVectorMesh() {
  const arrowMaterial = new THREE.MeshStandardMaterial({
    color: 0x28f7ff,
    emissive: 0x0f7f8e,
    emissiveIntensity: 0.55,
    roughness: 0.36,
    metalness: 0.08,
    toneMapped: false,
  });
  arrowMesh = new THREE.InstancedMesh(createArrowGeometry(state.vectorStyle), arrowMaterial, samples.length);
  arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrowMesh.frustumCulled = false;
  arrowMesh.renderOrder = 8;
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

function updatePhantomSliceColors() {
  if (!phantomPoints) {
    return;
  }

  const colorAttribute = phantomPoints.geometry.getAttribute('color');
  for (let i = 0; i < samples.length; i += 1) {
    const color = sampleDisplayColor(samples[i]);
    colorAttribute.setXYZ(i, color.r, color.g, color.b);
  }
  colorAttribute.needsUpdate = true;
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

function updateSliceVisual() {
  clearGroup(sliceGroup);
  sliceMaterials.length = 0;

  if (!state.sliceGradientEnabled) {
    updateVisibility();
    return;
  }

  const thicknessScene = clamp(sliceThicknessMm() * PHANTOM_SCENE_SCALE / (PHANTOM_FOV_MM * 0.5), 0.035, 2.5);
  const centerScene = clamp(state.sliceCenterMm * PHANTOM_SCENE_SCALE / (PHANTOM_FOV_MM * 0.5), -1.22, 1.22);

  const slabMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x84d1c5,
    emissive: 0x0b4f4a,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.22,
    roughness: 0.48,
    metalness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  sliceMaterials.push(slabMaterial);

  const slabGeometry = new THREE.BoxGeometry(2.55, thicknessScene, 2.55);
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  slab.position.y = centerScene;
  slab.renderOrder = 3;
  sliceGroup.add(slab);

  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x84d1c5, transparent: true, opacity: 0.72 });
  sliceMaterials.push(edgeMaterial);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeometry), edgeMaterial);
  edges.position.copy(slab.position);
  edges.renderOrder = 4;
  sliceGroup.add(edges);

  const arrowCount = 7;
  for (let i = 0; i < arrowCount; i += 1) {
    const amount = i / (arrowCount - 1);
    const y = lerp(-1.18, 1.18, amount);
    const arrowLength = 0.32 + amount * 0.42;
    const helper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-1.78, y - arrowLength * 0.5, 1.48),
      arrowLength,
      0xcd6df5,
      0.12,
      0.055,
    );
    helper.line.material.transparent = true;
    helper.line.material.opacity = 0.62;
    helper.cone.material.transparent = true;
    helper.cone.material.opacity = 0.86;
    sliceGroup.add(helper);
  }

  sliceGroup.add(labelSprite('Gz slice select', new THREE.Vector3(-1.95, 1.38, 1.48), '#d79cff'));
  updateVisibility();
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }
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
  const active = rfPulseEvents(sequence).some((event) => (
    localTime >= event.start
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
  const loop = normalizeLoopRange(sequence);
  state.elapsed = clamp(state.elapsed, loop.start, loop.end);
  controlsUi.sequenceType.value = state.sequence;
  controlsUi.referenceFrame.value = state.referenceFrame;
  outputs.te.textContent = formatMs(state.echoTime * 1000);

  document.querySelectorAll('.spin-echo-only').forEach((element) => {
    element.hidden = state.sequence !== 'spin-echo';
  });

  outputs.sequenceReadout.textContent = sequence.name;
  if (sequence.type === 'spin-echo') {
    outputs.phaseLabelA.textContent = state.sliceGradientEnabled ? '90 deg RF + Gz' : '90 deg RF';
    outputs.phaseLabelB.textContent = state.sliceGradientEnabled ? '180 deg RF + Gz / echo' : '180 deg refocus / echo';
    outputs.phaseLabelC.textContent = 'Readout';
  } else {
    outputs.phaseLabelA.textContent = state.sliceGradientEnabled ? 'RF pulse + Gz' : 'RF pulse';
    outputs.phaseLabelB.textContent = state.referenceFrame === 'laboratory'
      ? 'Larmor precession under B0'
      : 'Rotating-frame off-resonance';
    outputs.phaseLabelC.textContent = 'Cycle reset';
  }

  renderTimeline(sequence);
  updateMoments(sequence);
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

function updateFieldOutputs() {
  outputs.b0.textContent = `${state.b0Tesla.toFixed(2)} T`;
  outputs.larmor.textContent = formatFrequency(larmorFrequencyHz());
  outputs.larmorPeriod.textContent = formatSimulationTime(larmorPeriodSeconds());
}

function updateSliceSelectionOutputs() {
  outputs.sliceCenter.textContent = `${Math.round(state.sliceCenterMm)} mm`;
  outputs.sliceGradient.textContent = `${state.sliceGradientMtM.toFixed(1)} mT/m`;
  outputs.rfBandwidth.textContent = `${state.rfBandwidthKhz.toFixed(1)} kHz`;
  outputs.sliceThickness.textContent = state.sliceGradientEnabled ? `${Math.round(sliceThicknessMm())} mm` : 'Off';
  outputs.rfMode.textContent = rfModeLabel();
  outputs.rfCenter.textContent = formatFrequency(rfCenterFrequencyHz());
  outputs.rfPeakB1.textContent = formatB1Microtesla(peakRfB1TeslaForAngle(state.flipAngle, rfPulseSecondsForAngle(state.flipAngle)));
  const tbw = rfTimeBandwidthProduct(rfPulseSecondsForAngle(state.flipAngle));
  outputs.rfTbw.textContent = tbw === null ? '-' : tbw.toFixed(1);
}

function renderTimeline(sequence) {
  outputs.eventTrack.querySelectorAll('.event-zone, .event-marker').forEach((element) => {
    element.remove();
  });

  const loop = normalizeLoopRange(sequence);
  for (const event of timelineEvents(sequence)) {
    if (event.marker) {
      if (event.time < loop.start || event.time > loop.end) {
        continue;
      }

      const marker = document.createElement('div');
      marker.className = 'event-marker';
      marker.style.left = `${timeToWindowPercent(event.time, loop)}%`;
      marker.style.background = event.color;
      marker.title = event.label;
      outputs.eventTrack.insertBefore(marker, outputs.cursor);
      continue;
    }

    const clippedStart = Math.max(event.start, loop.start);
    const clippedEnd = Math.min(event.end, loop.end);
    if (clippedEnd <= clippedStart) {
      continue;
    }

    const zone = document.createElement('div');
    zone.className = `event-zone ${event.kind}`;
    zone.style.left = `${timeToWindowPercent(clippedStart, loop)}%`;
    zone.style.width = `${((clippedEnd - clippedStart) / loop.span) * 100}%`;
    zone.title = event.label;
    outputs.eventTrack.insertBefore(zone, outputs.cursor);
  }

  renderLoopEditor(sequence, loop);
}

function renderLoopEditor(sequence, loop = normalizeLoopRange(sequence)) {
  controlsUi.loopStrip.querySelectorAll('.loop-zone, .loop-marker').forEach((element) => {
    element.remove();
  });

  for (const event of timelineEvents(sequence)) {
    if (event.marker) {
      const marker = document.createElement('div');
      marker.className = 'loop-marker';
      marker.style.left = `${(event.time / sequence.cycleSeconds) * 100}%`;
      marker.style.background = event.color;
      marker.title = event.label;
      controlsUi.loopStrip.insertBefore(marker, outputs.loopSelection);
      continue;
    }

    const zone = document.createElement('div');
    zone.className = `loop-zone ${event.kind}`;
    zone.style.left = `${(event.start / sequence.cycleSeconds) * 100}%`;
    zone.style.width = `${((event.end - event.start) / sequence.cycleSeconds) * 100}%`;
    zone.title = event.label;
    controlsUi.loopStrip.insertBefore(zone, outputs.loopSelection);
  }

  outputs.loopSelection.style.left = `${(loop.start / sequence.cycleSeconds) * 100}%`;
  outputs.loopSelection.style.width = `${(loop.span / sequence.cycleSeconds) * 100}%`;
  updateLoopReadouts(sequence, loop);
}

function updateLoopReadouts(sequence, loop = normalizeLoopRange(sequence)) {
  outputs.loopStart.textContent = formatTimeCompact(loop.start);
  outputs.loopEnd.textContent = formatTimeCompact(loop.end);
  outputs.zoom.textContent = `${(sequence.cycleSeconds / loop.span).toFixed(1)}x`;
}

function timelineEvents(sequence) {
  if (sequence.type === 'spin-echo') {
    return [
      { kind: 'readout', label: 'Readout window', start: sequence.readoutStart, end: sequence.readoutEnd },
      { marker: true, label: 'Echo time', time: sequence.echoTime, color: '#84d1c5' },
    ];
  }

  return [];
}

function bindLoopControls() {
  controlsUi.loopStartHandle.addEventListener('pointerdown', (event) => {
    beginLoopDrag(event, 'start');
  });
  controlsUi.loopEndHandle.addEventListener('pointerdown', (event) => {
    beginLoopDrag(event, 'end');
  });

  controlsUi.loopStrip.addEventListener('pointerdown', (event) => {
    if (event.target === controlsUi.loopStartHandle || event.target === controlsUi.loopEndHandle) {
      return;
    }

    const sequence = getSequenceConfig();
    const pointerTime = timeFromStripPointer(event, sequence);
    const middle = (state.loopStart + state.loopEnd) / 2;
    beginLoopDrag(event, pointerTime < middle ? 'start' : 'end');
  });

  outputs.eventTrack.addEventListener('pointerdown', (event) => {
    const sequence = getSequenceConfig();
    const loop = normalizeLoopRange(sequence);
    state.elapsed = timeFromWindowPointer(event, outputs.eventTrack, loop);
    updateMoments(sequence);
  });

  [controlsUi.loopStartHandle, controlsUi.loopEndHandle].forEach((handle) => {
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const sequence = getSequenceConfig();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const step = event.shiftKey ? sequence.cycleSeconds * 0.05 : sequence.cycleSeconds * 0.01;
      setLoopBoundary(handle === controlsUi.loopStartHandle ? 'start' : 'end', (
        handle === controlsUi.loopStartHandle ? state.loopStart : state.loopEnd
      ) + direction * step, sequence);
    });
  });

  window.__mrDemoSetLoopRange = (start, end) => {
    const sequence = getSequenceConfig();
    state.loopStart = Number(start);
    state.loopEnd = Number(end);
    const loop = normalizeLoopRange(sequence);
    state.elapsed = loop.start;
    renderTimeline(sequence);
    updateMoments(sequence);
    return { start: loop.start, end: loop.end };
  };

  window.__mrDemoGetSpinEchoEnvelope = (time) => {
    const sequence = getSequenceConfig();
    const envelope = getSpinEchoEnvelope(Number(time), sequence, state.t2Ms / 1000, t2InhomSeconds());
    return {
      ...envelope,
      echoTime: sequence.echoTime,
      refocusStart: sequence.refocusStart,
      refocusEnd: sequence.refocusEnd,
    };
  };

  window.__mrDemoGetSpinEchoProbe = () => {
    const sequence = getSequenceConfig();
    const sample = samples[Math.floor(samples.length / 2)] || samples[0];
    const delta = Math.min(0.000001, sequence.refocusSeconds / 4);
    const before = getSpinEchoMoment(sample, sequence.refocusStart - delta, sequence);
    const justAfterStart = getSpinEchoMoment(sample, sequence.refocusStart + delta, sequence);
    const after = getSpinEchoMoment(sample, sequence.refocusEnd, sequence);
    return {
      before,
      justAfterStart,
      after,
      startDot: before.mx * justAfterStart.mx + before.my * justAfterStart.my + before.mz * justAfterStart.mz,
      endDot: before.mx * after.mx + before.my * after.my + before.mz * after.mz,
      beforeLength: Math.hypot(before.mx, before.my, before.mz),
      justAfterStartLength: Math.hypot(justAfterStart.mx, justAfterStart.my, justAfterStart.mz),
      afterLength: Math.hypot(after.mx, after.my, after.mz),
      refocusStart: sequence.refocusStart,
      refocusEnd: sequence.refocusEnd,
    };
  };

  window.__mrDemoGetSliceProbe = () => {
    const profiles = samples.map((sample) => sliceSelectionProfile(sample));
    const sequence = getSequenceConfig();
    return {
      enabled: state.sliceGradientEnabled,
      centerMm: state.sliceCenterMm,
      gradientMtM: state.sliceGradientMtM,
      bandwidthKhz: state.rfBandwidthKhz,
      thicknessMm: sliceThicknessMm(),
      waveform: sliceGradientWaveform(sequence),
      ssgDuringRf: sliceGradientAt(sequence.rf90Seconds / 2, sequence),
      ssgRephase: sliceGradientAt(sequence.rf90Seconds * 1.25, sequence),
      ssgDuringRefocus: sequence.type === 'spin-echo'
        ? sliceGradientAt(sequence.refocusCenter, sequence)
        : null,
      maxProfile: Math.max(...profiles),
      minProfile: Math.min(...profiles),
      activeSamples: profiles.filter((profile) => profile > 0.5).length,
      inactiveSamples: profiles.filter((profile) => profile < 0.05).length,
    };
  };

  window.__mrDemoGetRfProbe = () => {
    const sequence = getSequenceConfig();
    const pulses = rfPulseEvents(sequence).map((pulse) => {
      const duration = pulse.end - pulse.start;
      const peakTesla = peakRfB1TeslaForAngle(pulse.angle, duration);
      const centerValue = rfPulseB1TeslaAt(duration / 2, duration, pulse.angle);
      const earlyValue = rfPulseB1TeslaAt(duration * 0.1, duration, pulse.angle);
      return {
        ...pulse,
        duration,
        peakTesla,
        centerValue,
        earlyValue,
        tbw: rfTimeBandwidthProduct(duration),
        integral: integrateRfPulseShape(duration),
      };
    });

    return {
      mode: rfModeLabel(),
      sliceGradientEnabled: state.sliceGradientEnabled,
      carrierHz: rfCenterFrequencyHz(),
      gammaRadT: PROTON_GYROMAGNETIC_RATIO_RAD_T,
      pulses,
      chartReadout: outputs.chartRf.textContent,
      modeReadout: outputs.rfMode.textContent,
      centerReadout: outputs.rfCenter.textContent,
      peakReadout: outputs.rfPeakB1.textContent,
      tbwReadout: outputs.rfTbw.textContent,
    };
  };
}

function beginLoopDrag(event, handle) {
  event.preventDefault();
  const sequence = getSequenceConfig();
  const target = handle === 'start' ? controlsUi.loopStartHandle : controlsUi.loopEndHandle;
  target.setPointerCapture?.(event.pointerId);
  setLoopBoundary(handle, timeFromStripPointer(event, sequence), sequence);

  const move = (moveEvent) => {
    setLoopBoundary(handle, timeFromStripPointer(moveEvent, sequence), sequence);
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end, { once: true });
  target.addEventListener('pointercancel', end, { once: true });
}

function setLoopBoundary(handle, time, sequence = getSequenceConfig()) {
  const minSpan = getMinLoopSpan(sequence);
  if (handle === 'start') {
    state.loopStart = clamp(time, 0, state.loopEnd - minSpan);
  } else {
    state.loopEnd = clamp(time, state.loopStart + minSpan, sequence.cycleSeconds);
  }

  const loop = normalizeLoopRange(sequence);
  state.elapsed = clamp(state.elapsed, loop.start, loop.end);
  renderTimeline(sequence);
  updateMoments(sequence);
}

function timeFromStripPointer(event, sequence) {
  const rect = controlsUi.loopStrip.getBoundingClientRect();
  const amount = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  return amount * sequence.cycleSeconds;
}

function timeFromWindowPointer(event, element, loop) {
  const rect = element.getBoundingClientRect();
  const amount = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  return loop.start + amount * loop.span;
}

function bindUi() {
  controlsUi.playPause.addEventListener('click', () => {
    state.playing = !state.playing;
    controlsUi.playPause.innerHTML = state.playing ? '&#10073;&#10073;' : '&#9658;';
    controlsUi.playPause.title = state.playing ? 'Pause' : 'Play';
    controlsUi.playPause.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  });

  controlsUi.resetTime.addEventListener('click', () => {
    state.elapsed = normalizeLoopRange(getSequenceConfig()).start;
    updateMoments();
  });

  controlsUi.resetCamera.addEventListener('click', () => {
    camera.position.set(3.1, 2.2, 3.6);
    orbit.target.set(0, 0, 0);
    orbit.update();
  });

  controlsUi.sequenceType.addEventListener('change', () => {
    state.sequence = controlsUi.sequenceType.value;
    resetLoopRange(getSequenceConfig());
    applySequenceSettings();
  });

  controlsUi.referenceFrame.addEventListener('change', () => {
    state.referenceFrame = controlsUi.referenceFrame.value;
    applySequenceSettings();
  });

  controlsUi.flipAngle.addEventListener('input', () => {
    state.flipAngle = Number(controlsUi.flipAngle.value);
    outputs.flip.textContent = `${state.flipAngle} deg`;
    updateSliceSelectionOutputs();
    applySequenceSettings();
  });

  controlsUi.refocusAngle.addEventListener('input', () => {
    state.refocusAngle = Number(controlsUi.refocusAngle.value);
    outputs.refocus.textContent = `${state.refocusAngle} deg`;
    applySequenceSettings();
  });

  controlsUi.echoTime.addEventListener('input', () => {
    state.echoTime = Number(controlsUi.echoTime.value);
    outputs.te.textContent = formatMs(state.echoTime * 1000);
    resetLoopRange(getSequenceConfig());
    applySequenceSettings();
  });

  controlsUi.b0Rate.addEventListener('input', () => {
    state.b0Tesla = Number(controlsUi.b0Rate.value);
    updateFieldOutputs();
    updateSliceSelectionOutputs();
    updateMoments();
  });

  controlsUi.offRes.addEventListener('input', () => {
    state.offRes = Number(controlsUi.offRes.value);
    outputs.off.textContent = `${state.offRes.toFixed(2)} Hz`;
    updateMoments();
  });

  controlsUi.sliceGradientEnabled.addEventListener('change', () => {
    state.sliceGradientEnabled = controlsUi.sliceGradientEnabled.checked;
    updateSliceSelectionOutputs();
    updateSliceVisual();
    updatePhantomSliceColors();
    applySequenceSettings();
  });

  controlsUi.sliceCenter.addEventListener('input', () => {
    state.sliceCenterMm = Number(controlsUi.sliceCenter.value);
    updateSliceSelectionOutputs();
    updateSliceVisual();
    updatePhantomSliceColors();
    updateMoments();
  });

  controlsUi.sliceGradient.addEventListener('input', () => {
    state.sliceGradientMtM = Number(controlsUi.sliceGradient.value);
    updateSliceSelectionOutputs();
    updateSliceVisual();
    updatePhantomSliceColors();
    updateMoments();
  });

  controlsUi.rfBandwidth.addEventListener('input', () => {
    state.rfBandwidthKhz = Number(controlsUi.rfBandwidth.value);
    updateSliceSelectionOutputs();
    updateSliceVisual();
    updatePhantomSliceColors();
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
    state.speed = speedFromSlider(Number(controlsUi.speed.value));
    outputs.speed.textContent = formatSpeed(state.speed);
    updateMoments();
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

  [controlsUi.showPhantom, controlsUi.showVectors, controlsUi.showNet, controlsUi.showField, controlsUi.showCoil, controlsUi.showSlice].forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });

  bindLoopControls();
  window.addEventListener('resize', resize);
}

function updateVisibility() {
  phantomGroup.visible = controlsUi.showPhantom.checked;
  vectorGroup.visible = controlsUi.showVectors.checked;
  netArrow.visible = controlsUi.showNet.checked;
  fieldGroup.visible = controlsUi.showField.checked;
  coilGroup.visible = controlsUi.showCoil.checked;
  sliceGroup.visible = controlsUi.showSlice.checked && state.sliceGradientEnabled;
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
    return c.setHSL(0.55, 0.5, 0.58);
  }
  if (rho < 0.38) {
    return c.setHSL(0.47, 0.5, 0.56);
  }
  if (rho < 0.68) {
    return c.setHSL(0.09, 0.68, 0.64);
  }
  return c.setHSL(0.01, 0.7, 0.66);
}

function sampleDisplayColor(sample) {
  const color = tissueColor(sample.rho);
  if (!state.sliceGradientEnabled) {
    return color;
  }

  const profile = sliceSelectionProfile(sample);
  const outside = new THREE.Color(0x25312d);
  return outside.lerp(color, 0.22 + 0.78 * profile);
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

function formatTimeCompact(seconds) {
  if (seconds < 1) {
    return formatMs(seconds * 1000);
  }
  return `${seconds.toFixed(2)} s`;
}

function formatSimulationTime(seconds) {
  if (seconds < 1e-6) {
    return `${(seconds * 1e9).toFixed(2)} ns`;
  }
  if (seconds < 1e-3) {
    return `${(seconds * 1e6).toFixed(2)} us`;
  }
  if (seconds < 1) {
    return `${(seconds * 1e3).toFixed(2)} ms`;
  }
  return `${seconds.toFixed(2)} s`;
}

function formatFrequency(hz) {
  if (hz >= 1e6) {
    return `${(hz / 1e6).toFixed(2)} MHz`;
  }
  if (hz >= 1e3) {
    return `${(hz / 1e3).toFixed(2)} kHz`;
  }
  return `${hz.toFixed(2)} Hz`;
}

function formatB1Microtesla(tesla) {
  const microtesla = tesla * 1e6;
  if (Math.abs(microtesla) < 0.01) {
    return `${(tesla * 1e9).toFixed(1)} nT`;
  }
  return `${microtesla.toFixed(2)} uT`;
}

function speedFromSlider(sliderValue) {
  return 10 ** clamp(sliderValue, SPEED_SLIDER_MIN, SPEED_SLIDER_MAX);
}

function formatSpeed(speed) {
  if (speed < 0.001) {
    return `${speed.toExponential(1).replace('.0', '')}x`;
  }
  if (speed < 0.1) {
    return `${speed.toFixed(2)}x`;
  }
  if (speed < 1) {
    return `${speed.toFixed(1)}x`;
  }
  return `${speed.toFixed(1)}x`;
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
updateFieldOutputs();
updateSliceSelectionOutputs();
applySequenceSettings();
requestAnimationFrame(animate);
