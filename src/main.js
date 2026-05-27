import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './styles.css';

const container = document.querySelector('#scene');

const controlsUi = {
  playPause: document.querySelector('#playPause'),
  resetTime: document.querySelector('#resetTime'),
  resetCamera: document.querySelector('#resetCamera'),
  flipAngle: document.querySelector('#flipAngle'),
  b0Rate: document.querySelector('#b0Rate'),
  offRes: document.querySelector('#offRes'),
  t2: document.querySelector('#t2'),
  speed: document.querySelector('#speed'),
  density: document.querySelector('#density'),
  showPhantom: document.querySelector('#showPhantom'),
  showVectors: document.querySelector('#showVectors'),
  showNet: document.querySelector('#showNet'),
  showField: document.querySelector('#showField'),
};

const outputs = {
  flip: document.querySelector('#flipValue'),
  b0: document.querySelector('#b0Value'),
  off: document.querySelector('#offValue'),
  t2: document.querySelector('#t2Value'),
  speed: document.querySelector('#speedValue'),
  density: document.querySelector('#densityValue'),
  time: document.querySelector('#timeReadout'),
  mxy: document.querySelector('#mxyReadout'),
  mz: document.querySelector('#mzReadout'),
  samples: document.querySelector('#sampleReadout'),
  cursor: document.querySelector('#timeCursor'),
};

const state = {
  playing: true,
  elapsed: 0,
  cycleSeconds: 7.2,
  rfSeconds: 1.05,
  flipAngle: 90,
  b0Rate: 0.85,
  offRes: 0.45,
  t2Ms: 1600,
  speed: 1,
  density: 12,
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
const axesGroup = new THREE.Group();
scene.add(phantomGroup, vectorGroup, fieldGroup, axesGroup);

let samples = [];
let arrowMesh = null;
let phantomPoints = null;
const arrowGeometry = createArrowGeometry();
const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const scale = new THREE.Vector3();
const color = new THREE.Color();
const netDirection = new THREE.Vector3(0, 1, 0);

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

  const localTime = positiveModulo(state.elapsed, state.cycleSeconds);
  const pulseProgress = clamp(localTime / state.rfSeconds, 0, 1);
  const rfEase = smoothstep(pulseProgress);
  const flip = degToRad(state.flipAngle);
  const freeTime = Math.max(0, localTime - state.rfSeconds);
  const theta = localTime < state.rfSeconds ? flip * rfEase : flip;
  const transverseStart = Math.sin(theta);
  const mzDuringPulse = Math.cos(theta);
  const postPulseMz = Math.cos(flip);
  const t1Seconds = 3.4;
  const phaseBase = Math.PI * 2 * state.b0Rate * localTime;

  let sumMx = 0;
  let sumMy = 0;
  let sumMz = 0;
  let sumRho = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const localT2 = (state.t2Ms / 1000) * sample.t2Scale;
    const t2Decay = Math.exp(-freeTime / localT2);
    const transverse = transverseStart * t2Decay;
    const mz = localTime < state.rfSeconds
      ? mzDuringPulse
      : 1 - (1 - postPulseMz) * Math.exp(-freeTime / t1Seconds);
    const phase = sample.phaseOffset + phaseBase + Math.PI * 2 * state.offRes * sample.offResBase * freeTime;
    const mx = transverse * Math.cos(phase);
    const my = transverse * Math.sin(phase);
    const weightedMz = mz * sample.rho;
    const weightedMx = mx * sample.rho;
    const weightedMy = my * sample.rho;

    dir.set(weightedMx, weightedMz, weightedMy);
    const vectorLength = clamp(dir.length(), 0.08, 1.0);
    dir.normalize();

    quat.setFromUnitVectors(yAxis, dir);
    scale.set(1, 0.3 * vectorLength, 1);
    matrix.compose(sample.position, quat, scale);
    arrowMesh.setMatrixAt(i, matrix);

    const hue = positiveModulo(phase / (Math.PI * 2), 1);
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
  outputs.cursor.style.left = `${(localTime / state.cycleSeconds) * 100}%`;

  window.__mrDemoStats = {
    ready: true,
    samples: samples.length,
    localTime,
    mxy,
    mz: normMz,
  };
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
        const rho = phantomDensity(x, y, z);

        if (rho <= 0.035) {
          continue;
        }

        const threePosition = toThreePosition(x, y, z).multiplyScalar(1.35);
        const phaseOffset = Math.PI * 2 * positiveModulo(0.37 * x - 0.21 * y + 0.13 * z + rho * 0.19, 1);
        const offResBase = 0.62 * x - 0.48 * y + 0.32 * z + (rho - 0.35) * 0.42;
        const t2Scale = clamp(0.65 + rho * 0.7 + 0.12 * Math.sin(8 * x + 3 * z), 0.55, 1.45);

        samples.push({
          x,
          y,
          z,
          rho,
          phaseOffset,
          offResBase,
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

  const arrowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.1,
    vertexColors: true,
  });
  arrowMesh = new THREE.InstancedMesh(arrowGeometry, arrowMaterial, samples.length);
  arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrowMesh.frustumCulled = false;
  vectorGroup.add(arrowMesh);

  outputs.samples.textContent = samples.length.toString();
  window.__mrDemoReady = true;
  updateVisibility();
  updateMoments();
}

function disposePhantom() {
  if (phantomPoints) {
    phantomGroup.remove(phantomPoints);
    phantomPoints.geometry.dispose();
    phantomPoints.material.dispose();
    phantomPoints = null;
  }

  if (arrowMesh) {
    vectorGroup.remove(arrowMesh);
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

  controlsUi.flipAngle.addEventListener('input', () => {
    state.flipAngle = Number(controlsUi.flipAngle.value);
    outputs.flip.textContent = `${state.flipAngle} deg`;
    updateMoments();
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

  controlsUi.t2.addEventListener('input', () => {
    state.t2Ms = Number(controlsUi.t2.value);
    outputs.t2.textContent = `${state.t2Ms} ms`;
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

  [controlsUi.showPhantom, controlsUi.showVectors, controlsUi.showNet, controlsUi.showField].forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });

  window.addEventListener('resize', resize);
}

function updateVisibility() {
  phantomGroup.visible = controlsUi.showPhantom.checked;
  vectorGroup.visible = controlsUi.showVectors.checked;
  netArrow.visible = controlsUi.showNet.checked;
  fieldGroup.visible = controlsUi.showField.checked;
}

function resize() {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function createArrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.74, 9, 1, false);
  shaft.translate(0, 0.37, 0);
  const head = new THREE.ConeGeometry(0.055, 0.26, 16, 1);
  head.translate(0, 0.87, 0);
  const geometry = mergeGeometries([shaft, head]);
  geometry.computeVertexNormals();
  return geometry;
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

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
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

buildAxes();
buildB0Field();
rebuildPhantom();
bindUi();
resize();
requestAnimationFrame(animate);
