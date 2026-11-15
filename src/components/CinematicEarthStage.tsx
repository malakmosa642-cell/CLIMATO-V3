import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Language } from '../types/climate';

export interface EgyptBeacon {
  id: string;
  labelEn: string;
  labelAr: string;
  lat: number;
  lon: number;
  colorHex: number;
}

export const EGYPT_BEACONS: EgyptBeacon[] = [
  {
    id: 'nile-delta-north',
    labelEn: 'Northern Nile Delta',
    labelAr: 'شمال دلتا النيل',
    lat: 31.22,
    lon: 30.88,
    colorHex: 0x00ff66,
  },
  {
    id: 'greater-cairo',
    labelEn: 'Greater Cairo Basin',
    labelAr: 'حوض القاهرة الكبرى',
    lat: 30.04,
    lon: 31.24,
    colorHex: 0x10b981,
  },
  {
    id: 'upper-egypt-agro',
    labelEn: 'Upper Egypt Agricultural Corridor',
    labelAr: 'الممر الزراعي بالصعيد',
    lat: 27.72,
    lon: 30.82,
    colorHex: 0x34d399,
  },
  {
    id: 'delta-coast',
    labelEn: 'Rosetta & Alexandria Coast',
    labelAr: 'ساحل رشيد والإسكندرية',
    lat: 31.35,
    lon: 30.25,
    colorHex: 0x22ff3a,
  },
];

interface CinematicEarthStageProps {
  lang: Language;
  zoomProgressRef: React.MutableRefObject<number>;
  activeBeaconId: string;
  onSelectBeacon?: (id: string) => void;
  focusCoord?: { lat: number; lon: number } | null;
  resetSignal?: number;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 0, 0);
const _quat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);

function latLonToVector3(lat: number, lon: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  out.x = -radius * Math.sin(phi) * Math.cos(theta);
  out.z = radius * Math.sin(phi) * Math.sin(theta);
  out.y = radius * Math.cos(phi);
  return out;
}

// High-resolution procedural continent contours with detailed Egypt, Mediterranean, Red Sea & Nile geometry
const WORLD_POLYGONS: Array<Array<[number, number]>> = [
  // Africa + detailed Mediterranean & Red Sea coast
  [
    [-17.2, 14.7], [-16.0, 21.0], [-13.2, 27.5], [-6.0, 35.8], [3.0, 36.8], [10.4, 37.2],
    [11.5, 33.2], [20.1, 32.1], [25.2, 31.6], [29.8, 31.2], [30.4, 31.5], [31.2, 31.5],
    [32.3, 31.25], [32.6, 29.9], [33.8, 27.5], [35.5, 24.0], [37.2, 20.0], [43.3, 12.6],
    [51.3, 11.9], [45.0, 2.0], [40.5, -10.5], [35.4, -24.0], [28.0, -33.2], [18.4, -34.8],
    [14.4, -22.5], [12.1, -6.0], [9.4, 3.8], [2.2, 6.3], [-8.0, 4.8], [-17.2, 14.7],
  ],
  // Sinai & Arabian Peninsula & Levant
  [
    [32.3, 31.25], [34.2, 31.3], [35.5, 33.8], [36.0, 36.9], [42.0, 37.2], [48.5, 30.0],
    [56.3, 26.2], [59.8, 22.4], [54.0, 16.8], [43.5, 12.6], [41.5, 17.0], [39.1, 21.5],
    [36.5, 25.5], [34.6, 28.0], [33.8, 27.8], [32.6, 29.9], [32.3, 31.25],
  ],
  // Europe & Northern Mediterranean
  [
    [-9.3, 37.0], [-9.2, 43.1], [-1.8, 43.4], [-4.8, 48.4], [2.2, 51.0], [8.5, 54.2],
    [10.2, 57.8], [18.0, 59.5], [28.0, 70.5], [44.0, 68.0], [56.0, 65.0], [50.0, 48.0],
    [40.0, 43.5], [29.0, 41.2], [26.2, 39.5], [23.8, 37.9], [21.5, 37.0], [18.0, 40.2],
    [15.6, 38.0], [12.4, 41.8], [9.0, 44.4], [3.2, 42.4], [-5.4, 36.0], [-9.3, 37.0],
  ],
  // Asia
  [
    [48.5, 30.0], [56.0, 65.0], [105.0, 75.0], [170.0, 66.0], [160.0, 54.0], [140.0, 42.0],
    [122.0, 38.0], [120.0, 24.0], [108.0, 16.0], [104.0, 2.0], [96.0, 16.0], [88.0, 22.0],
    [78.0, 8.0], [68.0, 24.0], [58.0, 25.2], [48.5, 30.0],
  ],
  // Australia
  [
    [114.0, -22.0], [130.0, -12.0], [142.0, -11.0], [153.0, -26.0], [148.0, -38.0],
    [136.0, -35.0], [115.0, -34.0], [114.0, -22.0],
  ],
  // North America
  [
    [-168.0, 66.0], [-135.0, 69.0], [-90.0, 70.0], [-62.0, 54.0], [-68.0, 44.0], [-80.0, 25.0],
    [-90.0, 21.0], [-96.0, 18.0], [-84.0, 9.0], [-88.0, 14.0], [-105.0, 20.0], [-115.0, 32.0],
    [-125.0, 48.0], [-152.0, 60.0], [-168.0, 66.0],
  ],
  // South America
  [
    [-79.0, 9.0], [-62.0, 10.0], [-50.0, 1.0], [-35.0, -6.0], [-40.0, -22.0], [-54.0, -34.0],
    [-67.0, -54.0], [-74.0, -46.0], [-71.0, -18.0], [-81.0, -5.0], [-79.0, 9.0],
  ],
  // Greenland
  [
    [-52.0, 60.0], [-42.0, 82.0], [-20.0, 78.0], [-38.0, 65.0], [-52.0, 60.0],
  ],
];

function createCinematicEarthTextures() {
  const width = 2048;
  const height = 1024;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = width;
  emissiveCanvas.height = height;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const toXY = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];

  // Deep obsidian-emerald ocean (#050805 -> #010302)
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#040e07');
  oceanGrad.addColorStop(0.5, '#020403');
  oceanGrad.addColorStop(1, '#040c06');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, width, height);

  // Subtle ocean specular smoothness
  rCtx.fillStyle = '#404040';
  rCtx.fillRect(0, 0, width, height);

  // Orbital radar graticule
  ctx.strokeStyle = 'rgba(0, 255, 102, 0.085)';
  ctx.lineWidth = 1;
  eCtx.strokeStyle = 'rgba(0, 255, 102, 0.06)';
  eCtx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const [x] = toXY(lon, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    eCtx.beginPath();
    eCtx.moveTo(x, 0);
    eCtx.lineTo(x, height);
    eCtx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const [, y] = toXY(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    eCtx.beginPath();
    eCtx.moveTo(0, y);
    eCtx.lineTo(width, y);
    eCtx.stroke();
  }

  // Continents with dark emerald fill and crisp neon green coastlines
  for (const poly of WORLD_POLYGONS) {
    ctx.beginPath();
    rCtx.beginPath();
    eCtx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const [x, y] = toXY(lon, lat);
      if (i === 0) {
        ctx.moveTo(x, y);
        rCtx.moveTo(x, y);
        eCtx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        rCtx.lineTo(x, y);
        eCtx.lineTo(x, y);
      }
    });
    ctx.closePath();
    rCtx.closePath();
    eCtx.closePath();

    ctx.fillStyle = '#071c0e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.78)';
    ctx.lineWidth = 2.1;
    ctx.stroke();

    eCtx.fillStyle = 'rgba(0, 255, 102, 0.035)';
    eCtx.fill();
    eCtx.strokeStyle = 'rgba(0, 255, 102, 0.36)';
    eCtx.lineWidth = 1.6;
    eCtx.stroke();

    rCtx.fillStyle = '#d4d4d4';
    rCtx.fill();
  }

  // Egypt border & territorial subtle highlight
  const egyptBorder: Array<[number, number]> = [
    [25.1, 31.6], [25.0, 22.0], [36.8, 22.0], [34.8, 28.0], [34.2, 31.3], [32.3, 31.25], [30.4, 31.5], [25.1, 31.6],
  ];
  ctx.beginPath();
  eCtx.beginPath();
  egyptBorder.forEach(([lon, lat], i) => {
    const [x, y] = toXY(lon, lat);
    if (i === 0) {
      ctx.moveTo(x, y);
      eCtx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      eCtx.lineTo(x, y);
    }
  });
  ctx.closePath();
  eCtx.closePath();
  ctx.fillStyle = 'rgba(0, 255, 102, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 255, 102, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  eCtx.strokeStyle = 'rgba(0, 255, 102, 0.55)';
  eCtx.lineWidth = 1.5;
  eCtx.stroke();

  // Nile Delta fertile fan
  const deltaFan: Array<[number, number]> = [
    [31.18, 30.15], [30.1, 31.25], [30.45, 31.48], [31.25, 31.55], [32.25, 31.25], [31.9, 30.5], [31.18, 30.15],
  ];
  ctx.beginPath();
  eCtx.beginPath();
  deltaFan.forEach(([lon, lat], i) => {
    const [x, y] = toXY(lon, lat);
    if (i === 0) {
      ctx.moveTo(x, y);
      eCtx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      eCtx.lineTo(x, y);
    }
  });
  ctx.closePath();
  eCtx.closePath();
  ctx.fillStyle = 'rgba(0, 255, 102, 0.52)';
  ctx.fill();
  eCtx.fillStyle = 'rgba(0, 255, 102, 0.42)';
  eCtx.fill();

  // Nile River corridor from Lake Nasser through Cairo to Rosetta/Damietta
  const nileMain: Array<[number, number]> = [
    [31.3, 22.2], [32.85, 24.08], [32.64, 25.68], [31.18, 27.18], [30.75, 29.0], [31.23, 30.05], [31.18, 30.18],
  ];
  ctx.beginPath();
  eCtx.beginPath();
  nileMain.forEach(([lon, lat], i) => {
    const [x, y] = toXY(lon, lat);
    if (i === 0) {
      ctx.moveTo(x, y);
      eCtx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      eCtx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = 'rgba(0, 255, 102, 0.98)';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  eCtx.strokeStyle = 'rgba(0, 255, 102, 0.88)';
  eCtx.lineWidth = 2.8;
  eCtx.stroke();

  // Rosetta & Damietta branches
  const [dx0, dy0] = toXY(31.18, 30.18);
  const [rx1, ry1] = toXY(30.4, 31.45);
  const [dx1, dy1] = toXY(31.83, 31.48);
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(rx1, ry1);
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.95)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Subtle radar radiance along Cairo, Alexandria, Nile Delta, and major global hubs
  const addGlow = (lon: number, lat: number, r: number, color: string) => {
    const [x, y] = toXY(lon, lat);
    for (const targetCtx of [ctx, eCtx]) {
      const g = targetCtx.createRadialGradient(x, y, 0.5, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      targetCtx.fillStyle = g;
      targetCtx.beginPath();
      targetCtx.arc(x, y, r, 0, Math.PI * 2);
      targetCtx.fill();
    }
  };

  addGlow(31.24, 30.04, 18, 'rgba(0, 255, 102, 0.6)'); // Cairo
  addGlow(29.92, 31.2, 13, 'rgba(16, 185, 129, 0.52)'); // Alexandria
  addGlow(30.42, 31.4, 12, 'rgba(0, 255, 102, 0.48)'); // Rosetta
  addGlow(32.3, 31.25, 11, 'rgba(52, 211, 153, 0.45)'); // Port Said / Suez
  addGlow(31.5, 22.9, 14, 'rgba(0, 255, 102, 0.42)'); // Toshka / Upper Basin
  addGlow(-0.12, 51.5, 12, 'rgba(16, 185, 129, 0.42)'); // London
  addGlow(139.69, 35.68, 12, 'rgba(0, 255, 102, 0.42)'); // Tokyo
  addGlow(-74.0, 40.71, 12, 'rgba(16, 185, 129, 0.42)'); // New York

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const roughTexture = new THREE.CanvasTexture(roughCanvas);
  roughTexture.colorSpace = THREE.NoColorSpace;
  const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;

  return { colorTexture, roughTexture, emissiveTexture };
}

/**
 * Composite multi-part aerospace satellite model (bus, thermal collar, truss arms,
 * dual solar wings, parabolic dish + feed horn, radiometer aperture, and telemetry strobe).
 */
function buildOrbitalSatellite(accentColor: number): {
  group: THREE.Group;
  beaconMat: THREE.MeshStandardMaterial;
} {
  const sat = new THREE.Group();

  // 1. Octagonal metallic core bus
  const bus = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.026, 0.056, 8),
    new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.25 })
  );
  bus.rotation.z = Math.PI / 2;
  sat.add(bus);

  // 2. Thermal shield accent collar
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.012, 8),
    new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      metalness: 0.85,
      roughness: 0.2,
      emissive: accentColor,
      emissiveIntensity: 0.28,
    })
  );
  collar.rotation.z = Math.PI / 2;
  sat.add(collar);

  // 3. Articulated truss boom spanning solar wings
  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.88, roughness: 0.22 })
  );
  boom.rotation.z = Math.PI / 2;
  sat.add(boom);

  // 4 & 5. Twin solar array wings with neon green cell trace glow
  const wingGeo = new THREE.BoxGeometry(0.135, 0.004, 0.048);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x052e16,
    metalness: 0.78,
    roughness: 0.18,
    emissive: accentColor,
    emissiveIntensity: 0.42,
  });
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(-0.108, 0, 0);
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(0.108, 0, 0);
  sat.add(leftWing, rightWing);

  // 6. Nadir parabolic dish pointing toward Earth (+Z because lookAt(0,0,0) aligns +Z toward target)
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xd1fae5,
    metalness: 0.65,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.006, 0.014, 16, 1, true),
    dishMat
  );
  dish.rotation.x = Math.PI / 2;
  dish.position.set(0, -0.008, 0.032);
  sat.add(dish);

  // 7. Dish feed horn + optical radiometer lens
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0025, 0.004, 0.018, 8),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.85,
      metalness: 0.5,
      roughness: 0.25,
    })
  );
  horn.rotation.x = Math.PI / 2;
  horn.position.set(0, -0.008, 0.044);
  sat.add(horn);

  // 8. Top telemetry beacon dome
  const beaconMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 1.35,
    roughness: 0.15,
    metalness: 0.3,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 12), beaconMat);
  beacon.position.set(0, 0.029, 0);
  sat.add(beacon);

  return { group: sat, beaconMat };
}

export default function CinematicEarthStage({
  lang,
  zoomProgressRef,
  activeBeaconId,
  onSelectBeacon,
  focusCoord = null,
  resetSignal = 0,
}: CinematicEarthStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeBeaconRef = useRef(activeBeaconId);
  activeBeaconRef.current = activeBeaconId;
  const onSelectRef = useRef(onSelectBeacon);
  onSelectRef.current = onSelectBeacon;
  const langRef = useRef(lang);
  langRef.current = lang;
  const focusCoordRef = useRef(focusCoord);
  focusCoordRef.current = focusCoord;

  // Allow external Reset Orbit trigger without recreating WebGL scene
  const dragOffsetRef = useRef({ lon: 0, lat: 0 });
  const lastResetRef = useRef(resetSignal);
  if (resetSignal !== lastResetRef.current) {
    lastResetRef.current = resetSignal;
    dragOffsetRef.current.lon = 0;
    dragOffsetRef.current.lat = 0;
  }

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 720;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    latLonToVector3(24, 22, 4.35, camera.position);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Radar Lighting rig: crisp starlight key + glowing neon green rim + emerald bounce
    const keyLight = new THREE.DirectionalLight(0xf0fdf4, 2.35);
    keyLight.position.set(5.5, 3.2, 5.0);
    scene.add(keyLight);

    const neonRim = new THREE.DirectionalLight(0x00ff66, 2.0);
    neonRim.position.set(-5.2, 1.8, -4.5);
    scene.add(neonRim);

    const emeraldRim = new THREE.DirectionalLight(0x10b981, 1.3);
    emeraldRim.position.set(2.4, -4.0, 2.6);
    scene.add(emeraldRim);

    const hemiLight = new THREE.HemisphereLight(0x34d399, 0x020603, 0.8);
    scene.add(hemiLight);

    // Dual-layer Deep Space Neon-Green Starfield (lightweight on mobile & software GL)
    const starCount = isSoftwareGl || width < 640 ? 480 : 880;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const palette = [
      new THREE.Color(0xecfdf5), // mint white
      new THREE.Color(0x00ff66), // vibrant neon green
      new THREE.Color(0x10b981), // deep emerald
      new THREE.Color(0xffffff), // pure starlight
    ];
    for (let i = 0; i < starCount; i++) {
      const r = 13 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const c = palette[i % palette.length];
      starColors[i * 3] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.068,
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Subtle foreground radar dust particles for depth parallax
    const nodeCount = isSoftwareGl ? 60 : 130;
    const nodePositions = new Float32Array(nodeCount * 3);
    for (let i = 0; i < nodeCount; i++) {
      const r = 3.2 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      nodePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      nodePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      nodePositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: 0x00ff66,
      size: 0.042,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const radarParticles = new THREE.Points(nodeGeo, nodeMat);
    scene.add(radarParticles);

    // Earth Assembly Group
    const earthRadius = 1.48;
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const { colorTexture, roughTexture, emissiveTexture } = createCinematicEarthTextures();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    colorTexture.anisotropy = maxAniso;
    roughTexture.anisotropy = maxAniso;
    emissiveTexture.anisotropy = maxAniso;

    const sphereSegW = isSoftwareGl ? 48 : 68;
    const sphereSegH = isSoftwareGl ? 36 : 50;
    const globeGeo = new THREE.SphereGeometry(earthRadius, sphereSegW, sphereSegH);
    const globeMat = new THREE.MeshStandardMaterial({
      map: colorTexture,
      roughnessMap: roughTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0x00ff66),
      emissiveIntensity: 0.72,
      roughness: 0.66,
      metalness: 0.22,
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    earthGroup.add(globeMesh);

    // Atmospheric Fresnel Glow Shell (Neon Green -> Emerald Radar Halo)
    const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.065, 52, 38);
    const atmosMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        glowColor: { value: new THREE.Color(0x00ff66) },
        accentColor: { value: new THREE.Color(0x10b981) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform vec3 accentColor;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = pow(clamp(0.82 - dot(viewDir, -vNormal), 0.0, 1.0), 2.35);
          vec3 col = mix(glowColor, accentColor, clamp(vWorldPos.y * 0.28 + 0.35, 0.0, 0.75));
          gl_FragColor = vec4(col, rim * 0.96);
        }
      `,
    });
    earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

    // Futuristic Neon Green Wireframe Grid Shell
    const wireGeo = new THREE.SphereGeometry(earthRadius * 1.012, 28, 18);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
    });
    const wireShell = new THREE.Mesh(wireGeo, wireMat);
    earthGroup.add(wireShell);

    // Geodesic Equatorial Radar Scanner Ring around Earth
    const scanRingRadius = earthRadius * 1.15;
    const scanSegments = 96;
    const scanPts = new Float32Array(scanSegments * 3);
    for (let i = 0; i < scanSegments; i++) {
      const a = (i / scanSegments) * Math.PI * 2;
      scanPts[i * 3] = Math.cos(a) * scanRingRadius;
      scanPts[i * 3 + 1] = 0;
      scanPts[i * 3 + 2] = Math.sin(a) * scanRingRadius;
    }
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute('position', new THREE.BufferAttribute(scanPts, 3));
    const scanMat = new THREE.PointsMaterial({
      color: 0x00ff66,
      size: 0.026,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const equatorialScanner = new THREE.Points(scanGeo, scanMat);
    equatorialScanner.rotation.z = 0.08;
    earthGroup.add(equatorialScanner);

    // Searched Weather Location Radar Lock Group (visible when focusCoord is set)
    const searchMarkerGroup = new THREE.Group();
    searchMarkerGroup.visible = false;
    const searchRing = new THREE.Mesh(
      new THREE.RingGeometry(0.036, 0.058, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00ff66,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    searchRing.rotation.x = -Math.PI / 2;
    searchRing.position.y = 0.008;
    const searchCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x00ff66,
        emissive: 0x00ff66,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.5,
      })
    );
    searchCore.position.y = 0.024;
    searchMarkerGroup.add(searchRing, searchCore);
    earthGroup.add(searchMarkerGroup);

    // Egypt Focus Beacons
    const beaconMeshes: Map<string, { ring: THREE.Mesh; pin: THREE.Mesh }> = new Map();
    const clickTargets: THREE.Object3D[] = [];
    const pinGeo = new THREE.ConeGeometry(0.022, 0.068, 12);
    const ringGeo = new THREE.RingGeometry(0.028, 0.042, 28);
    const hitGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    EGYPT_BEACONS.forEach((b) => {
      const group = new THREE.Group();
      const pos = latLonToVector3(b.lat, b.lon, earthRadius + 0.006);
      group.position.copy(pos);
      _vec3A.copy(pos).normalize();
      _quat.setFromUnitVectors(_upAxis, _vec3A);
      group.quaternion.copy(_quat);

      const pinMat = new THREE.MeshStandardMaterial({
        color: b.colorHex,
        emissive: b.colorHex,
        emissiveIntensity: 0.75,
        roughness: 0.25,
        metalness: 0.5,
      });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.y = 0.036;
      pin.rotation.x = Math.PI;

      const ringMat = new THREE.MeshBasicMaterial({
        color: b.colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 0.025;
      hit.layers.set(1);
      hit.userData.beaconId = b.id;

      group.add(pin, ring, hit);
      earthGroup.add(group);
      beaconMeshes.set(b.id, { ring, pin });
      clickTargets.push(hit);
    });

    // Multi-Part Satellites + Luminous Orbital Trails
    const TRAIL_SEGMENTS = 56;
    const TRAIL_SPAN_RAD = 1.45;
    const orbitConfigs = [
      { radius: 1.9, tiltX: 0.44, tiltZ: 0.28, speed: 0.38, color: 0x00ff66, phase: 0.3 },
      { radius: 2.08, tiltX: -0.62, tiltZ: 0.48, speed: 0.27, color: 0x10b981, phase: 2.2 },
      { radius: 2.26, tiltX: 1.08, tiltZ: -0.35, speed: 0.2, color: 0x34d399, phase: 4.1 },
    ];

    const orbitSatellites: Array<{
      sat: THREE.Group;
      beaconMat: THREE.MeshStandardMaterial;
      radius: number;
      speed: number;
      phase: number;
      trailPositions: Float32Array;
      trailGeo: THREE.BufferGeometry;
    }> = [];

    orbitConfigs.forEach((cfg) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(cfg.tiltX, 0, cfg.tiltZ);
      scene.add(pivot);

      // Subtle full orbital guide track
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(cfg.radius - 0.0032, cfg.radius + 0.0032, 120),
        new THREE.MeshBasicMaterial({
          color: cfg.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.16,
        })
      );
      ring.rotation.x = Math.PI / 2;
      pivot.add(ring);

      // Animated luminous neon-green comet trail behind the satellite (zero per-frame alloc)
      const trailPositions = new Float32Array(TRAIL_SEGMENTS * 3);
      const trailColors = new Float32Array(TRAIL_SEGMENTS * 3);
      const baseColor = new THREE.Color(cfg.color);
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        // i=0 is satellite head (brightest), i=TRAIL_SEGMENTS-1 fades to black (transparent under AdditiveBlending)
        const falloff = Math.pow(1 - i / (TRAIL_SEGMENTS - 1), 1.85);
        trailColors[i * 3] = baseColor.r * falloff;
        trailColors[i * 3 + 1] = baseColor.g * falloff;
        trailColors[i * 3 + 2] = baseColor.b * falloff;
      }
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      pivot.add(trailLine);

      const { group: sat, beaconMat } = buildOrbitalSatellite(cfg.color);
      pivot.add(sat);
      orbitSatellites.push({
        sat,
        beaconMat,
        radius: cfg.radius,
        speed: cfg.speed,
        phase: cfg.phase,
        trailPositions,
        trailGeo,
      });
    });

    // Interactive Drag-to-Spin + Damped Pointer Parallax + Beacon Raycasting
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    const parallaxGoal = { x: 0, y: 0 };
    const parallaxCurr = { x: 0, y: 0 };
    let isDragging = false;
    let dragMoved = false;
    let prevPointerX = 0;
    let prevPointerY = 0;

    const updateNormalizedPointer = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const handlePointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      isDragging = true;
      dragMoved = false;
      prevPointerX = ev.clientX;
      prevPointerY = ev.clientY;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const handleWindowPointerMove = (ev: PointerEvent) => {
      // Gentle pointer parallax across Hero viewport
      if (!prefersReducedMotion && window.innerWidth > 0 && window.innerHeight > 0) {
        const nx = (ev.clientX / window.innerWidth) * 2 - 1;
        const ny = (ev.clientY / window.innerHeight) * 2 - 1;
        parallaxGoal.x = THREE.MathUtils.clamp(nx, -1, 1);
        parallaxGoal.y = THREE.MathUtils.clamp(ny, -1, 1);
      }

      if (isDragging) {
        const dx = ev.clientX - prevPointerX;
        const dy = ev.clientY - prevPointerY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          dragMoved = true;
        }
        prevPointerX = ev.clientX;
        prevPointerY = ev.clientY;
        dragOffsetRef.current.lon -= dx * 0.24;
        dragOffsetRef.current.lat = THREE.MathUtils.clamp(dragOffsetRef.current.lat + dy * 0.16, -42, 42);
        return;
      }

      // Hover cursor affordance over Egypt beacons
      if (ev.target === renderer.domElement && updateNormalizedPointer(ev.clientX, ev.clientY)) {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickTargets, false);
        renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
      }
    };

    const handleWindowPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    const handleClick = (ev: MouseEvent) => {
      if (dragMoved) return;
      if (!updateNormalizedPointer(ev.clientX, ev.clientY)) return;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickTargets, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.beaconId as string;
        onSelectRef.current?.(id);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('click', handleClick);
    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    let aspectRatio = width / height;
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      aspectRatio = w / h;
      camera.aspect = aspectRatio;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const rawElapsed = clock.getElapsedTime();
      const elapsed = prefersReducedMotion ? 0 : rawElapsed;

      // Animate satellites + update luminous orbital trails in pre-allocated Float32Array
      for (let sIdx = 0; sIdx < orbitSatellites.length; sIdx++) {
        const orb = orbitSatellites[sIdx];
        const angle = elapsed * orb.speed + orb.phase;
        orb.sat.position.set(Math.cos(angle) * orb.radius, 0, Math.sin(angle) * orb.radius);
        orb.sat.lookAt(0, 0, 0);
        orb.beaconMat.emissiveIntensity = prefersReducedMotion
          ? 1.1
          : 0.9 + Math.sin(rawElapsed * 3.5 + sIdx * 1.4) * 0.55;

        const pts = orb.trailPositions;
        for (let i = 0; i < TRAIL_SEGMENTS; i++) {
          const tAngle = angle - (i / (TRAIL_SEGMENTS - 1)) * TRAIL_SPAN_RAD;
          pts[i * 3] = Math.cos(tAngle) * orb.radius;
          pts[i * 3 + 1] = 0;
          pts[i * 3 + 2] = Math.sin(tAngle) * orb.radius;
        }
        (orb.trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      // Subtle starfield & equatorial scanner rotation
      stars.rotation.y = elapsed * 0.008;
      radarParticles.rotation.y = -elapsed * 0.015;
      equatorialScanner.rotation.y = elapsed * 0.14;

      // Update live searched coordinate marker
      const focus = focusCoordRef.current;
      if (focus) {
        searchMarkerGroup.visible = true;
        latLonToVector3(focus.lat, focus.lon, earthRadius + 0.008, _vec3A);
        searchMarkerGroup.position.copy(_vec3A);
        _vec3A.normalize();
        _quat.setFromUnitVectors(_upAxis, _vec3A);
        searchMarkerGroup.quaternion.copy(_quat);
        const pulseScale = prefersReducedMotion ? 1.1 : 1.05 + Math.sin(rawElapsed * 2.4) * 0.16;
        searchRing.scale.set(pulseScale, pulseScale, 1);
      } else {
        searchMarkerGroup.visible = false;
      }

      // Multi-stage scroll-driven camera flight:
      // Stage 1 (p=0): Deep space orbital Earth centered behind hero card (interactive drag + parallax + gentle drift)
      // Stage 2 (p~0.4): Smooth approach toward Africa & Eastern Mediterranean
      // Stage 3 (p~0.75-1.0): Tight Nile Delta zoom & Egyptian study region lock
      const p = THREE.MathUtils.clamp(zoomProgressRef.current, 0, 1);
      const activeBeacon = EGYPT_BEACONS.find((b) => b.id === activeBeaconRef.current) || EGYPT_BEACONS[0];

      const pAfrica = THREE.MathUtils.smoothstep(p, 0.0, 0.45);
      const pEgypt = THREE.MathUtils.smoothstep(p, 0.45, 1.0);

      // Smoothly damp drag offset back to 0 during Egypt scroll descent so beacon lock remains exact
      if (p > 0.12) {
        dragOffsetRef.current.lon = THREE.MathUtils.damp(dragOffsetRef.current.lon, 0, 4.5, delta);
        dragOffsetRef.current.lat = THREE.MathUtils.damp(dragOffsetRef.current.lat, 0, 4.5, delta);
      }

      // Damped pointer parallax (attenuates as camera approaches Egypt)
      const parallaxStrength = (1 - pAfrica) * (isDragging ? 0 : 1);
      parallaxCurr.x = THREE.MathUtils.damp(parallaxCurr.x, parallaxGoal.x * parallaxStrength, 3.2, delta);
      parallaxCurr.y = THREE.MathUtils.damp(parallaxCurr.y, parallaxGoal.y * parallaxStrength, 3.2, delta);

      const heroBaseLat = THREE.MathUtils.clamp(
        (focus ? focus.lat : 22) + dragOffsetRef.current.lat * (1 - pAfrica) + parallaxCurr.y * 4.5,
        -60,
        65
      );
      const heroBaseLon =
        (focus ? focus.lon : 14) +
        Math.sin(elapsed * 0.12) * (focus ? 4 : 8) +
        dragOffsetRef.current.lon * (1 - pAfrica) +
        parallaxCurr.x * 7.0;

      // Keep Earth + satellite orbits cleanly framed on portrait mobile screens
      const mobileDistBoost = aspectRatio < 0.85 ? 0.68 : aspectRatio < 1.1 ? 0.3 : 0;
      const midLat = THREE.MathUtils.lerp(heroBaseLat, 26.5, pAfrica);
      const midLon = THREE.MathUtils.lerp(heroBaseLon, 28.5, pAfrica);
      const midDist = THREE.MathUtils.lerp(4.25 + mobileDistBoost, 3.05 + mobileDistBoost * 0.35, pAfrica);

      const targetLat = THREE.MathUtils.lerp(midLat, activeBeacon.lat, pEgypt);
      const targetLon = THREE.MathUtils.lerp(midLon, activeBeacon.lon, pEgypt);
      const targetDist = THREE.MathUtils.lerp(midDist, 2.18, pEgypt);

      latLonToVector3(targetLat, targetLon, targetDist, _camGoal);

      // Center Earth in Hero (p=0), then shift gracefully aside for Scene 2 editorial beats
      const isRtl = langRef.current === 'ar';
      const heroShiftX = THREE.MathUtils.lerp(0, isRtl ? 0.34 : -0.34, pAfrica);
      latLonToVector3(targetLat, targetLon, earthRadius * 0.18, _vec3B);
      _lookGoal.set(_vec3B.x * p + heroShiftX, _vec3B.y * p - 0.04, _vec3B.z * p);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 4.2, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 4.2, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 4.2, delta);

      _currentLook.x = THREE.MathUtils.damp(_currentLook.x, _lookGoal.x, 4.2, delta);
      _currentLook.y = THREE.MathUtils.damp(_currentLook.y, _lookGoal.y, 4.2, delta);
      _currentLook.z = THREE.MathUtils.damp(_currentLook.z, _lookGoal.z, 4.2, delta);
      camera.lookAt(_currentLook);

      // Highlight active Egypt beacon
      beaconMeshes.forEach((meshPair, id) => {
        const isActive = id === activeBeaconRef.current;
        const targetScale = isActive ? 1.55 : 0.95;
        const curScale = THREE.MathUtils.damp(meshPair.ring.scale.x, targetScale, 6, delta);
        meshPair.ring.scale.set(curScale, curScale, 1);
        (meshPair.ring.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.95 : 0.42;
        (meshPair.pin.material as THREE.MeshStandardMaterial).emissiveIntensity = isActive ? 1.25 : 0.48;
      });

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('click', handleClick);
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);

      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Line ||
          obj instanceof THREE.Points
        ) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
      colorTexture.dispose();
      roughTexture.dispose();
      emissiveTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Dedicated isolated WebGL mount — zero backdrop-filter over canvas
  return <div ref={mountRef} className="w-full h-full" />;
}
