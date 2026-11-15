import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCw, Pause, Globe2 } from 'lucide-react';
import { AoiLocation, Language } from '../types/climate';

export type GlobeLayerMode = 'composite' | 'thermal' | 'moisture' | 'aerosol';

interface EarthGlobe3DProps {
  lang: Language;
  aois: AoiLocation[];
  selectedAoiId?: string;
  onSelectAoi?: (aoi: AoiLocation) => void;
  heightClass?: string;
  compactDock?: boolean;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();

function latLonToVector3(lat: number, lon: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  out.x = -radius * Math.sin(phi) * Math.cos(theta);
  out.z = radius * Math.sin(phi) * Math.sin(theta);
  out.y = radius * Math.cos(phi);
  return out;
}

// Simplified continental polygons (lon, lat) for crisp procedural Earth map with zero external 404s
const CONTINENTS: Array<Array<[number, number]>> = [
  // Africa + Nile Delta + Red Sea contour
  [
    [-17, 15], [-16, 28], [-6, 36], [10, 37], [12, 33], [25, 32], [30, 31.5], [32.5, 31.2],
    [34, 28], [43, 12], [51, 12], [41, -2], [40, -11], [35, -24], [28, -33], [18, -35],
    [14, -22], [12, -6], [9, 4], [2, 6], [-8, 5], [-17, 15],
  ],
  // Arabian Peninsula & Levant
  [
    [34, 32], [36, 37], [42, 37], [48, 30], [56, 26], [60, 22], [54, 16], [44, 12.6],
    [39, 21], [35, 28], [34, 32],
  ],
  // Europe & Mediterranean North
  [
    [-9, 37], [-9, 43], [-2, 43], [-5, 48], [2, 51], [8, 54], [10, 58], [18, 60],
    [28, 70], [42, 68], [55, 65], [50, 48], [40, 44], [29, 41], [24, 38], [16, 38],
    [12, 42], [8, 44], [3, 42], [-5, 36], [-9, 37],
  ],
  // Asia
  [
    [48, 30], [55, 65], [105, 75], [170, 66], [160, 54], [140, 42], [122, 38], [120, 24],
    [108, 16], [104, 2], [96, 16], [88, 22], [78, 8], [68, 24], [58, 25], [48, 30],
  ],
  // Australia
  [
    [114, -22], [130, -12], [142, -11], [153, -26], [148, -38], [136, -35], [115, -34], [114, -22],
  ],
  // North America
  [
    [-168, 66], [-135, 69], [-90, 70], [-62, 54], [-68, 44], [-80, 25], [-90, 21],
    [-96, 18], [-84, 9], [-88, 14], [-105, 20], [-115, 32], [-125, 48], [-152, 60], [-168, 66],
  ],
  // South America
  [
    [-79, 9], [-62, 10], [-50, 1], [-35, -6], [-40, -22], [-54, -34], [-67, -54],
    [-74, -46], [-71, -18], [-81, -5], [-79, 9],
  ],
  // Greenland
  [
    [-52, 60], [-42, 82], [-20, 78], [-38, 65], [-52, 60],
  ],
];

function createEarthTextures(layerMode: GlobeLayerMode) {
  const width = 1024;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;

  const toXY = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];

  // Deep ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#041209');
  oceanGrad.addColorStop(0.5, '#020704');
  oceanGrad.addColorStop(1, '#041209');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Ocean roughness (smoother water)
  rCtx.fillStyle = '#555555';
  rCtx.fillRect(0, 0, width, height);

  // Subtle lat/lon telemetry grid on ocean
  ctx.strokeStyle = 'rgba(34, 255, 58, 0.08)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const [x] = toXY(lon, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const [, y] = toXY(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Continental landmass fills
  const landColor =
    layerMode === 'thermal'
      ? '#161b12'
      : layerMode === 'moisture'
      ? '#092218'
      : layerMode === 'aerosol'
      ? '#121a14'
      : '#0A2112';
  const coastStroke =
    layerMode === 'thermal'
      ? 'rgba(245, 158, 11, 0.72)'
      : layerMode === 'moisture'
      ? 'rgba(16, 185, 129, 0.8)'
      : layerMode === 'aerosol'
      ? 'rgba(163, 230, 53, 0.72)'
      : 'rgba(34, 255, 58, 0.68)';

  for (const poly of CONTINENTS) {
    ctx.beginPath();
    rCtx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const [x, y] = toXY(lon, lat);
      if (i === 0) {
        ctx.moveTo(x, y);
        rCtx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        rCtx.lineTo(x, y);
      }
    });
    ctx.closePath();
    rCtx.closePath();
    ctx.fillStyle = landColor;
    ctx.fill();
    ctx.strokeStyle = coastStroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    rCtx.fillStyle = '#cfcfcf';
    rCtx.fill();
  }

  // Nile river & delta highlight
  ctx.beginPath();
  const nilePts: Array<[number, number]> = [[32.5, 4], [32.6, 15.6], [32.8, 24], [31.2, 30.0], [30.4, 31.4], [31.2, 30.0], [31.8, 31.4]];
  nilePts.forEach(([lon, lat], i) => {
    const [x, y] = toXY(lon, lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Layer-specific climate overlay patches (clearly illustrative spatial regions)
  const addOverlayBlob = (lon: number, lat: number, radiusPx: number, innerColor: string) => {
    const [x, y] = toXY(lon, lat);
    const g = ctx.createRadialGradient(x, y, 2, x, y, radiusPx);
    g.addColorStop(0, innerColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  };

  if (layerMode === 'thermal') {
    addOverlayBlob(31.2, 30.0, 34, 'rgba(245, 158, 11, 0.55)');
    addOverlayBlob(46.7, 24.7, 38, 'rgba(244, 63, 94, 0.50)');
    addOverlayBlob(55.2, 25.2, 26, 'rgba(245, 158, 11, 0.48)');
    addOverlayBlob(-112, 33.4, 32, 'rgba(245, 158, 11, 0.42)');
  } else if (layerMode === 'moisture') {
    addOverlayBlob(31.0, 31.0, 30, 'rgba(16, 185, 129, 0.60)');
    addOverlayBlob(33.0, 12.0, 38, 'rgba(6, 182, 212, 0.52)');
    addOverlayBlob(-60, -5, 55, 'rgba(16, 185, 129, 0.45)');
  } else if (layerMode === 'aerosol') {
    addOverlayBlob(18, 22, 52, 'rgba(245, 158, 11, 0.45)');
    addOverlayBlob(49.6, 27.0, 34, 'rgba(168, 85, 247, 0.45)');
    addOverlayBlob(78, 26, 40, 'rgba(244, 63, 94, 0.38)');
  } else {
    // Composite subtle telemetry hotspots around MENA & global basins
    addOverlayBlob(31.2, 30.5, 28, 'rgba(16, 185, 129, 0.35)');
    addOverlayBlob(49.6, 27.0, 26, 'rgba(6, 182, 212, 0.32)');
    addOverlayBlob(10, 36, 22, 'rgba(6, 182, 212, 0.25)');
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;

  const roughTexture = new THREE.CanvasTexture(roughCanvas);
  roughTexture.colorSpace = THREE.NoColorSpace;

  return { colorTexture, roughTexture };
}

function buildSatelliteModel(accentColor: number): THREE.Group {
  const sat = new THREE.Group();

  // 1. Central Spacecraft Bus
  const busGeo = new THREE.BoxGeometry(0.055, 0.04, 0.04);
  const busMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.85,
    roughness: 0.28,
  });
  const bus = new THREE.Mesh(busGeo, busMat);
  sat.add(bus);

  // 2. Solar Wing Left & Right
  const wingGeo = new THREE.BoxGeometry(0.14, 0.004, 0.045);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x0f3b66,
    metalness: 0.65,
    roughness: 0.2,
    emissive: accentColor,
    emissiveIntensity: 0.25,
  });
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(-0.11, 0, 0);
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(0.11, 0, 0);
  sat.add(leftWing, rightWing);

  // 3. Optical Sensor Payload Cone
  const sensorGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.028, 12);
  const sensorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.8,
    roughness: 0.25,
  });
  const sensor = new THREE.Mesh(sensorGeo, sensorMat);
  sensor.position.set(0, -0.03, 0);
  sat.add(sensor);

  // 4. Dish Antenna
  const dishGeo = new THREE.SphereGeometry(0.016, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.5,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.set(0, 0.025, 0);
  dish.rotation.x = Math.PI;
  sat.add(dish);

  return sat;
}

export default function EarthGlobe3D({
  lang,
  aois,
  selectedAoiId,
  onSelectAoi,
  heightClass = 'h-[480px] lg:h-[580px]',
  compactDock = false,
}: EarthGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [layerMode, setLayerMode] = useState<GlobeLayerMode>('composite');
  const [autoRotate, setAutoRotate] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const onSelectAoiRef = useRef(onSelectAoi);
  onSelectAoiRef.current = onSelectAoi;
  const aoisRef = useRef(aois);
  aoisRef.current = aois;
  const langRef = useRef(lang);
  langRef.current = lang;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const globeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const focusTargetRef = useRef<THREE.Vector3 | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pinGroupRef = useRef<THREE.Group | null>(null);
  const clickableMeshesRef = useRef<THREE.Object3D[]>([]);

  // Update layer textures dynamically without tearing down the WebGL context
  useEffect(() => {
    const mat = globeMaterialRef.current;
    const renderer = rendererRef.current;
    if (!mat || !renderer) return;
    const { colorTexture, roughTexture } = createEarthTextures(layerMode);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    colorTexture.anisotropy = maxAniso;
    roughTexture.anisotropy = maxAniso;
    const oldMap = mat.map;
    const oldRough = mat.roughnessMap;
    mat.map = colorTexture;
    mat.roughnessMap = roughTexture;
    mat.needsUpdate = true;
    oldMap?.dispose();
    oldRough?.dispose();
  }, [layerMode]);

  // Smoothly pan camera to selected AOI when changed externally
  useEffect(() => {
    if (!selectedAoiId) return;
    const targetAoi = aois.find((a) => a.id === selectedAoiId);
    if (!targetAoi || !cameraRef.current) return;
    const pos = latLonToVector3(targetAoi.lat, targetAoi.lon, 3.65);
    focusTargetRef.current = pos;
    setAutoRotate(false);
  }, [selectedAoiId, aois]);

  // Rebuild 3D AOI coordinate beacons whenever aois or selectedAoiId updates
  useEffect(() => {
    const pinGroup = pinGroupRef.current;
    if (!pinGroup) return;

    while (pinGroup.children.length > 0) {
      const child = pinGroup.children[0];
      pinGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
    }

    const nextClickables: THREE.Object3D[] = [];
    const earthRadius = 1.42;
    const pinGeo = new THREE.ConeGeometry(0.032, 0.095, 10);
    const haloGeo = new THREE.RingGeometry(0.035, 0.052, 24);
    const hitGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    aois.forEach((aoi) => {
      const beacon = new THREE.Group();
      const pos = latLonToVector3(aoi.lat, aoi.lon, earthRadius + 0.01);
      beacon.position.copy(pos);

      _vec3A.copy(pos).normalize();
      _targetQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _vec3A);
      beacon.quaternion.copy(_targetQuat);

      const isSelected = aoi.id === selectedAoiId;
      const pinColor = isSelected ? 0x22ff3a : 0x10b981;

      const pinMat = new THREE.MeshStandardMaterial({
        color: pinColor,
        emissive: pinColor,
        emissiveIntensity: isSelected ? 0.9 : 0.45,
        roughness: 0.3,
        metalness: 0.4,
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.y = 0.05;
      pinMesh.rotation.x = Math.PI;
      pinMesh.layers.enable(1);
      pinMesh.userData.aoi = aoi;

      const haloMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.rotation.x = -Math.PI / 2;
      haloMesh.position.y = 0.008;

      const hitProxy = new THREE.Mesh(hitGeo, hitMat);
      hitProxy.position.y = 0.04;
      hitProxy.layers.set(1);
      hitProxy.userData.aoi = aoi;

      beacon.add(pinMesh, haloMesh, hitProxy);
      pinGroup.add(beacon);
      nextClickables.push(hitProxy);
    });

    clickableMeshesRef.current = nextClickables;
  }, [aois, selectedAoiId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020403);
    scene.fog = new THREE.FogExp2(0x020403, 0.04);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    // Start facing Mediterranean / Nile Delta / MENA hemisphere
    latLonToVector3(26, 31, 4.15, camera.position);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Balanced lighting rig
    const keyLight = new THREE.DirectionalLight(0xf6fff6, 2.3);
    keyLight.position.set(5, 3, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22ff3a, 1.35);
    rimLight.position.set(-5, -2, -4);
    scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0x22ff3a, 0x020704, 0.78);
    scene.add(hemiLight);

    // Subtle deep-space starfield via InstancedMesh / Points
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 16 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.06, transparent: true, opacity: 0.7 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Earth Assembly Group
    const earthRadius = 1.42;
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const { colorTexture, roughTexture } = createEarthTextures('composite');
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    colorTexture.anisotropy = maxAniso;
    roughTexture.anisotropy = maxAniso;

    const globeGeo = new THREE.SphereGeometry(earthRadius, 64, 48);
    const globeMat = new THREE.MeshStandardMaterial({
      map: colorTexture,
      roughnessMap: roughTexture,
      roughness: 0.75,
      metalness: 0.14,
    });
    globeMaterialRef.current = globeMat;
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    earthGroup.add(globeMesh);

    // Atmospheric Fresnel Glow Shell
    const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.045, 48, 36);
    const atmosMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        glowColor: { value: new THREE.Color(0x22ff3a) },
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
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = pow(clamp(0.75 - dot(viewDir, -vNormal), 0.0, 1.0), 2.6);
          gl_FragColor = vec4(glowColor, rim * 0.75);
        }
      `,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosMesh);

    // Telemetry Wireframe Shell
    const gridGeo = new THREE.SphereGeometry(earthRadius * 1.012, 24, 16);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x22ff3a,
      wireframe: true,
      transparent: true,
      opacity: 0.055,
    });
    earthGroup.add(new THREE.Mesh(gridGeo, gridMat));

    // Orbital Rings & Multi-part Satellite Models
    const orbitConfigs = [
      { radius: 1.88, tiltX: 0.42, tiltZ: 0.25, speed: 0.34, color: 0x22ff3a, phase: 0.2, name: 'Sentinel-6' },
      { radius: 2.02, tiltX: -0.68, tiltZ: 0.52, speed: 0.26, color: 0x10b981, phase: 2.1, name: 'MODIS / Terra' },
      { radius: 2.15, tiltX: 1.15, tiltZ: -0.3, speed: 0.21, color: 0x4dff60, phase: 4.0, name: 'Landsat-9' },
      { radius: 1.96, tiltX: -0.22, tiltZ: -0.88, speed: 0.29, color: 0xf59e0b, phase: 5.2, name: 'SMAP / GRACE-FO' },
    ];

    const orbitSatellites: Array<{
      pivot: THREE.Group;
      sat: THREE.Group;
      radius: number;
      speed: number;
      phase: number;
    }> = [];

    orbitConfigs.forEach((cfg) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(cfg.tiltX, 0, cfg.tiltZ);
      scene.add(pivot);

      const ringGeo = new THREE.RingGeometry(cfg.radius - 0.004, cfg.radius + 0.004, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      pivot.add(ring);

      const sat = buildSatelliteModel(cfg.color);
      sat.userData.label = cfg.name;
      pivot.add(sat);
      orbitSatellites.push({ pivot, sat, radius: cfg.radius, speed: cfg.speed, phase: cfg.phase });
    });

    // Interactive 3D AOI Coordinate Beacons
    const pinGroup = new THREE.Group();
    pinGroupRef.current = pinGroup;
    earthGroup.add(pinGroup);

    const clickableMeshes: THREE.Object3D[] = [];
    const pinGeo = new THREE.ConeGeometry(0.032, 0.095, 10);
    const haloGeo = new THREE.RingGeometry(0.035, 0.052, 24);

    aoisRef.current.forEach((aoi) => {
      const beacon = new THREE.Group();
      const pos = latLonToVector3(aoi.lat, aoi.lon, earthRadius + 0.01);
      beacon.position.copy(pos);

      _vec3A.copy(pos).normalize();
      _targetQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _vec3A);
      beacon.quaternion.copy(_targetQuat);

      const isSelected = aoi.id === selectedAoiId;
      const pinColor = isSelected ? 0x22ff3a : 0x10b981;

      const pinMat = new THREE.MeshStandardMaterial({
        color: pinColor,
        emissive: pinColor,
        emissiveIntensity: isSelected ? 0.9 : 0.45,
        roughness: 0.3,
        metalness: 0.4,
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.y = 0.05;
      pinMesh.rotation.x = Math.PI;
      pinMesh.layers.enable(1);
      pinMesh.userData.aoi = aoi;

      const haloMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.rotation.x = -Math.PI / 2;
      haloMesh.position.y = 0.008;

      // Invisible larger hit proxy for effortless clicking
      const hitProxy = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitProxy.position.y = 0.04;
      hitProxy.layers.set(1);
      hitProxy.userData.aoi = aoi;

      beacon.add(pinMesh, haloMesh, hitProxy);
      pinGroup.add(beacon);
      clickableMeshes.push(hitProxy);
    });

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.4;
    controls.maxDistance = 6.5;
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      focusTargetRef.current = null;
    });

    // Raycaster restricted to layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let lastMove = 0;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 55) return;
      lastMove = now;
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitAoi = hits[0].object.userData.aoi as AoiLocation;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredName(langRef.current === 'ar' ? hitAoi.name_ar : hitAoi.name_en);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredName(null);
      }
    };

    const handlePointerClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitAoi = hits[0].object.userData.aoi as AoiLocation;
        onSelectAoiRef.current?.(hitAoi);
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handlePointerClick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
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
      const elapsed = clock.getElapsedTime();

      // Animate orbital satellites
      for (const orb of orbitSatellites) {
        const angle = elapsed * orb.speed + orb.phase;
        orb.sat.position.set(
          Math.cos(angle) * orb.radius,
          0,
          Math.sin(angle) * orb.radius
        );
        orb.sat.lookAt(0, 0, 0);
      }

      // Gentle auto-rotation when no AOI camera focus is active
      if (autoRotateRef.current && !focusTargetRef.current) {
        _vec3B.copy(camera.position);
        const angle = delta * 0.14;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        camera.position.x = _vec3B.x * cos - _vec3B.z * sin;
        camera.position.z = _vec3B.x * sin + _vec3B.z * cos;
        camera.lookAt(0, 0, 0);
      }

      // Smooth damped camera transition to selected AOI
      if (focusTargetRef.current) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, focusTargetRef.current.x, 4.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, focusTargetRef.current.y, 4.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, focusTargetRef.current.z, 4.5, delta);
        camera.lookAt(0, 0, 0);
        if (camera.position.distanceTo(focusTargetRef.current) < 0.04) {
          focusTargetRef.current = null;
        }
      }

      controls.update();
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
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handlePointerClick);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const layerLabels: Record<GlobeLayerMode, { en: string; ar: string }> = {
    composite: { en: 'Composite', ar: 'مركب' },
    thermal: { en: 'Thermal Heat', ar: 'الحرارة' },
    moisture: { en: 'Water & Soil', ar: 'المياه والرطوبة' },
    aerosol: { en: 'Air & Dust', ar: 'الهواء والغبار' },
  };

  return (
    <div className={`relative w-full ${heightClass} overflow-hidden rounded-xl border border-[#22FF3A]/20 bg-[#020403]`}>
      {/* Dedicated isolated WebGL mount — never apply backdrop-filter over canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left minimal coordinate readout */}
      <div className="pointer-events-none absolute top-3 start-3 px-3 py-1.5 rounded-lg bg-[#050C08]/90 border border-[#22FF3A]/20 text-xs text-slate-200 flex items-center gap-2">
        <Globe2 className="w-3.5 h-3.5 text-[#22FF3A] shrink-0" />
        <span className="whitespace-nowrap">
          {hoveredName
            ? hoveredName
            : lang === 'ar'
            ? 'مجسم الأرض التفاعلي · انقر على أي نقطة مراقبة'
            : 'Interactive 3D Earth · Click an orbital beacon'}
        </span>
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(640px,94%)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          className="mb-1.5 px-3 py-1 rounded-md bg-[#050C08]/92 border border-[#22FF3A]/25 text-[11px] font-medium text-slate-300 hover:text-[#22FF3A] transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span>{dockOpen ? (lang === 'ar' ? 'إخفاء شريط التحكم' : 'Hide Globe Controls') : (lang === 'ar' ? 'إظهار شريط التحكم' : 'Show Globe Controls')}</span>
        </button>

        {dockOpen && (
          <div className="w-full rounded-xl bg-[#050C08]/92 border border-[#22FF3A]/25 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Globe overlay layers">
              {(['composite', 'thermal', 'moisture', 'aerosol'] as GlobeLayerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayerMode(mode)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    layerMode === mode
                      ? 'bg-[#22FF3A]/20 text-[#22FF3A] border border-[#22FF3A]/40'
                      : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {layerLabels[mode][lang]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!compactDock && aois.length > 0 && (
                <select
                  aria-label={lang === 'ar' ? 'التركيز على موقع' : 'Focus AOI'}
                  value={selectedAoiId || ''}
                  onChange={(e) => {
                    const found = aois.find((a) => a.id === e.target.value);
                    if (found) onSelectAoi?.(found);
                  }}
                  className="bg-[#08120C] border border-emerald-900/70 text-xs text-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-[#22FF3A] max-w-[165px]"
                >
                  <option value="" disabled>
                    {lang === 'ar' ? 'اختر موقعاً...' : 'Focus region...'}
                  </option>
                  {aois.map((aoi) => (
                    <option key={aoi.id} value={aoi.id}>
                      {lang === 'ar' ? aoi.name_ar : aoi.name_en}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-md border border-emerald-900/70 text-xs text-slate-200 hover:border-[#22FF3A]/50 hover:text-[#22FF3A] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {autoRotate ? <Pause className="w-3.5 h-3.5 text-[#22FF3A]" /> : <RotateCw className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{autoRotate ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تدوير' : 'Orbit')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
