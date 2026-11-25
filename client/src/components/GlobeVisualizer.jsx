import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Compass, Pause, Play, SunMoon, Moon, Cpu } from 'lucide-react';

// Convert Lat/Lon to 3D Cartesian coordinates aligned with NASA equirectangular SphereGeometry UVs
function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Compute great-circle SLERP arc points guaranteed never to dip inside sphere radius
function generateGreatCircleArc(startLat, startLon, endLat, endLon, radius, altitudeBias = 1.0, numPoints = 56) {
  const p1 = latLonToVector3(startLat, startLon, 1).normalize();
  const p2 = latLonToVector3(endLat, endLon, 1).normalize();

  const dot = Math.max(-1, Math.min(1, p1.dot(p2)));
  const omega = Math.acos(dot);

  if (omega < 0.005) {
    return [
      p1.clone().multiplyScalar(radius + 0.35),
      p1.clone().lerp(p2, 0.5).normalize().multiplyScalar(radius + 2.5),
      p2.clone().multiplyScalar(radius + 0.35)
    ];
  }

  const maxAltitude = radius * Math.min(0.46, 0.11 + (omega / Math.PI) * 0.34) * altitudeBias;
  const sinOmega = Math.sin(omega);
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const w1 = Math.sin((1 - t) * omega) / sinOmega;
    const w2 = Math.sin(t * omega) / sinOmega;

    const unitVec = new THREE.Vector3(
      w1 * p1.x + w2 * p2.x,
      w1 * p1.y + w2 * p2.y,
      w1 * p1.z + w2 * p2.z
    ).normalize();

    // Elevated sine arch cleanly clears Earth crust and cloud layer
    const alt = 0.25 + maxAltitude * Math.sin(Math.PI * t);
    points.push(unitVec.multiplyScalar(radius + alt));
  }

  return points;
}

// Procedural radial glow sprite texture (shared across all photon trails & nodes)
function createGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
  g.addColorStop(0.55, 'rgba(255, 255, 255, 0.28)');
  g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Aggregate noisy individual sockets into clean visual geospatial corridors
function aggregateRoutes(sockets) {
  const map = new Map();
  for (const sock of sockets) {
    const rawLat = sock?.geo?.ll?.[0];
    const rawLon = sock?.geo?.ll?.[1];
    if (
      typeof rawLat !== 'number' || !Number.isFinite(rawLat) ||
      typeof rawLon !== 'number' || !Number.isFinite(rawLon) ||
      sock?.geo?.isLocal
    ) continue;

    const lat = rawLat;
    const lon = rawLon;
    // Quantize to ~1.5 deg cells per direction so twin DL/UL hubs stay distinct without 40x overdraw
    const key = `${lat.toFixed(1)}_${lon.toFixed(1)}_${sock.direction}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        lat,
        lon,
        direction: sock.direction,
        speed: 0,
        count: 0,
        sample: sock,
        processes: new Set()
      };
      map.set(key, entry);
    }
    entry.speed += sock.speed || 0;
    entry.count += 1;
    if (sock.process) entry.processes.add(sock.process);
    if ((sock.speed || 0) > (entry.sample.speed || 0)) {
      entry.sample = sock;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.speed - a.speed)
    .slice(0, 28);
}

const EARTH_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const EARTH_FRAGMENT_SHADER = `
  uniform sampler2D uDayTex;
  uniform sampler2D uNightTex;
  uniform sampler2D uSpecTex;
  uniform vec3 uSunDir;
  uniform int uMode; // 0 = Day/Night Hybrid, 1 = City Lights Night, 2 = Cyber Tactical

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 dayColor = texture2D(uDayTex, vUv).rgb;
    vec3 nightColor = texture2D(uNightTex, vUv).rgb;
    float topo = texture2D(uSpecTex, vUv).r;

    if (uMode == 1) {
      // Tactical City Lights Night Mode
      vec3 baseOcean = dayColor * vec3(0.06, 0.11, 0.20);
      vec3 cities = nightColor * vec3(1.55, 1.25, 0.85);
      float rim = pow(1.0 - max(0.0, dot(N, V)), 3.0);
      vec3 col = baseOcean + cities + vec3(0.0, 0.45, 0.75) * rim * 0.45;
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    if (uMode == 2) {
      // Cyber Matrix Hologram Mode with subtle Lat/Lon graticule
      float lum = dot(dayColor, vec3(0.299, 0.587, 0.114));
      float landMask = smoothstep(0.08, 0.35, topo);
      float gridLat = smoothstep(0.96, 1.0, abs(cos(vUv.y * 3.14159 * 12.0)));
      float gridLon = smoothstep(0.97, 1.0, abs(cos(vUv.x * 3.14159 * 24.0)));
      float grid = max(gridLat, gridLon) * 0.18;
      vec3 base = mix(vec3(0.015, 0.035, 0.08), vec3(0.02, 0.18, 0.28), lum * 0.8 + landMask * 0.4);
      vec3 cities = nightColor * vec3(0.0, 0.85, 1.0) * 0.9;
      float rim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
      vec3 col = base + cities + vec3(0.0, 0.95, 1.0) * (grid + rim * 0.55);
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    // Mode 0: Photorealistic Day/Night Satellite Hybrid
    float ndotl = dot(N, L);
    float dayFactor = smoothstep(-0.22, 0.25, ndotl);
    float twilightBand = exp(-pow(ndotl * 4.5, 2.0));

    // Diffuse lit day with subtle ocean specular sheen
    float diffuse = max(0.14, ndotl * 1.15 + 0.18);
    vec3 H = normalize(L + V);
    float oceanMask = 1.0 - smoothstep(0.02, 0.18, topo);
    float spec = pow(max(0.0, dot(N, H)), 28.0) * oceanMask * max(0.0, ndotl) * 0.42;
    vec3 litDay = dayColor * diffuse + vec3(0.45, 0.78, 1.0) * spec;

    // Night side with moonlight ambient and golden metropolis lights
    vec3 litNight = dayColor * vec3(0.07, 0.11, 0.22) + nightColor * vec3(1.55, 1.20, 0.78);

    vec3 surface = mix(litNight, litDay, dayFactor);
    // Warm atmospheric sunset twilight band along the terminator
    surface += vec3(0.28, 0.12, 0.04) * twilightBand * (0.4 + 0.6 * (1.0 - oceanMask));

    // Subtle atmospheric Rayleigh rim haze
    float rim = pow(1.0 - max(0.0, dot(N, V)), 3.2);
    surface += vec3(0.15, 0.65, 1.0) * rim * (0.25 + 0.45 * dayFactor);

    gl_FragColor = vec4(surface, 1.0);
  }
`;

export function GlobeVisualizer({ sockets = [], vps = null, streamerMode = false }) {
  const containerRef = useRef(null);
  const socketsRef = useRef(sockets);
  const vpsRef = useRef(vps);
  socketsRef.current = sockets;
  vpsRef.current = vps;

  const [hoveredRoute, setHoveredRoute] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [globeTheme, setGlobeTheme] = useState('hybrid'); // 'hybrid' | 'night' | 'cyber'
  const [autoRotate, setAutoRotate] = useState(true);

  const maskIp = (ip) => {
    if (!ip) return '';
    const cleaned = ip.replace(/^::ffff:/, '');
    if (!streamerMode) return cleaned;
    const parts = cleaned.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
    return cleaned;
  };

  const formatSpeed = (bytes) => {
    if (!bytes) return '0.0 Mbps';
    const mbps = (bytes * 8) / 1000000;
    if (mbps < 0.1) return `${((bytes * 8) / 1000).toFixed(0)} Kbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 500;
    const GLOBE_RADIUS = 36;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 18, 104);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.95;
    controls.minDistance = 45;
    controls.maxDistance = 210;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;

    let userRotating = false;
    let autoRotateTimer = null;
    controls.addEventListener('start', () => {
      userRotating = true;
      controls.autoRotate = false;
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
    });
    controls.addEventListener('end', () => {
      userRotating = false;
      autoRotateTimer = setTimeout(() => {
        if (container._desiredAutoRotate !== false) {
          controls.autoRotate = true;
        }
      }, 4500);
    });

    // 1. Deep-Space Starfield (multi-tinted stars)
    const starCount = 1600;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 240 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const tint = Math.random();
      if (tint > 0.85) {
        starColors[i * 3] = 0.65; starColors[i * 3 + 1] = 0.92; starColors[i * 3 + 2] = 1.0;
      } else if (tint > 0.75) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.88; starColors[i * 3 + 2] = 0.65;
      } else {
        const b = 0.65 + Math.random() * 0.35;
        starColors[i * 3] = b; starColors[i * 3 + 1] = b; starColors[i * 3 + 2] = b;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      sizeAttenuation: true
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 2. Subtle Orbital HUD Telemetry Rings
    const orbitRingGroup = new THREE.Group();
    scene.add(orbitRingGroup);

    const makeOrbitRing = (r, color, opacity, tiltX, tiltZ) => {
      const geo = new THREE.RingGeometry(r, r + 0.14, 128);
      const mat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = tiltX;
      mesh.rotation.z = tiltZ;
      orbitRingGroup.add(mesh);
      return mesh;
    };
    const ring1 = makeOrbitRing(GLOBE_RADIUS * 1.24, 0x00f3ff, 0.14, Math.PI * 0.44, 0.18);
    const ring2 = makeOrbitRing(GLOBE_RADIUS * 1.38, 0xa855f7, 0.08, -Math.PI * 0.38, -0.25);

    // 3. Earth Group + Textures
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const sunDir = new THREE.Vector3(0.82, 0.28, 0.50).normalize();
    const textureLoader = new THREE.TextureLoader();
    const dayTex = textureLoader.load('/earth-blue-marble.jpg');
    dayTex.colorSpace = THREE.SRGBColorSpace;
    const nightTex = textureLoader.load('/earth-night.jpg');
    nightTex.colorSpace = THREE.SRGBColorSpace;
    const topoTex = textureLoader.load('/earth-topology.png');
    const cloudsTex = textureLoader.load('/earth-clouds.png');

    // Custom GLSL Day/Night + Twilight + Specular Ocean Earth
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDayTex: { value: dayTex },
        uNightTex: { value: nightTex },
        uSpecTex: { value: topoTex },
        uSunDir: { value: sunDir },
        uMode: { value: 0 }
      },
      vertexShader: EARTH_VERTEX_SHADER,
      fragmentShader: EARTH_FRAGMENT_SHADER
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // Independent Atmospheric Cloud Layer
    const cloudsGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 64, 64);
    const cloudsMat = new THREE.MeshBasicMaterial({
      map: cloudsTex,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    earthGroup.add(cloudsMesh);

    // Outer Volumetric Fresnel Halo
    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.09, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
          gl_FragColor = vec4(0.08, 0.68, 1.0, 1.0) * max(0.0, intensity) * 0.9;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosMesh);

    // 4. Host VPS Origin Beacon (Spires + Twin Expanding Shockwaves)
    const glowTex = createGlowTexture();
    const hostGroup = new THREE.Group();
    earthGroup.add(hostGroup);

    const spireGeo = new THREE.CylinderGeometry(0.16, 0.55, 4.8, 16);
    const spireMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const spireMesh = new THREE.Mesh(spireGeo, spireMat);
    hostGroup.add(spireMesh);

    const hostSpriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x34d399,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const hostSprite = new THREE.Sprite(hostSpriteMat);
    hostSprite.scale.set(7.5, 7.5, 1);
    hostGroup.add(hostSprite);

    const makeWaveRing = () => {
      const geo = new THREE.RingGeometry(0.9, 1.45, 36);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      hostGroup.add(mesh);
      return { mesh, mat };
    };
    const shockwave1 = makeWaveRing();
    const shockwave2 = makeWaveRing();

    let currentHostLat = vpsRef.current?.ll?.[0] ?? 1.2897;
    let currentHostLon = vpsRef.current?.ll?.[1] ?? 103.8501;
    let targetRotY = 0;
    let targetRotX = 0;
    let needsOrientationLerp = true;

    const orientToHost = (lat, lon, immediate = false) => {
      currentHostLat = lat;
      currentHostLon = lon;
      const vpsPos = latLonToVector3(lat, lon, GLOBE_RADIUS);
      const norm = vpsPos.clone().normalize();

      spireMesh.position.copy(vpsPos).addScaledVector(norm, 2.4);
      spireMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);

      hostSprite.position.copy(vpsPos).addScaledVector(norm, 4.8);

      [shockwave1.mesh, shockwave2.mesh].forEach((m) => {
        m.position.copy(vpsPos).addScaledVector(norm, 0.35);
        m.lookAt(vpsPos.clone().multiplyScalar(2));
      });

      const unit = latLonToVector3(lat, lon, 1).normalize();
      targetRotY = -Math.atan2(unit.x, unit.z);
      targetRotX = (lat * Math.PI / 180) * 0.42;

      if (immediate) {
        earthGroup.rotation.y = targetRotY;
        earthGroup.rotation.x = targetRotX;
      } else {
        needsOrientationLerp = true;
      }
    };

    orientToHost(currentHostLat, currentHostLon, true);

    // 5. Persistent Dynamic Geodesic Corridors Map (prevents 500ms animation reset!)
    const dynamicGroup = new THREE.Group();
    earthGroup.add(dynamicGroup);

    const routeMap = new Map();
    const sharedCorePGeo = new THREE.SphereGeometry(0.45, 8, 8);
    const sharedPinGeo = new THREE.SphereGeometry(0.82, 12, 12);
    const sharedHitGeo = new THREE.SphereGeometry(2.3, 8, 8);
    const sharedHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const sharedHaloRingGeo = new THREE.RingGeometry(1.1, 1.55, 24);

    const disposeGroup = (grp) => {
      grp.traverse((obj) => {
        if (obj.geometry && obj.geometry !== sharedCorePGeo && obj.geometry !== sharedPinGeo && obj.geometry !== sharedHitGeo && obj.geometry !== sharedHaloRingGeo) {
          obj.geometry.dispose();
        }
        if (obj.material && obj.material !== sharedHitMat) {
          obj.material.dispose();
        }
      });
    };

    const syncRoutes = (newSockets, hostChanged = false) => {
      if (hostChanged) {
        for (const route of routeMap.values()) {
          dynamicGroup.remove(route.group);
          disposeGroup(route.group);
        }
        routeMap.clear();
      }

      const routes = aggregateRoutes(newSockets);
      const activeKeys = new Set(routes.map(r => r.key));

      // Remove stale routes
      for (const [key, rObj] of routeMap.entries()) {
        if (!activeKeys.has(key)) {
          dynamicGroup.remove(rObj.group);
          disposeGroup(rObj.group);
          routeMap.delete(key);
        }
      }

      // Add or smoothly update existing routes WITHOUT resetting photon phase!
      routes.forEach((route) => {
        const isInbound = route.direction === 'inbound';
        const colorHex = isInbound ? 0x00f3ff : 0xf43f9c;
        const speedMbps = (route.speed * 8) / 1000000;
        const speedFactor = Math.min(2.6, Math.max(0.45, 0.55 + Math.log10(Math.max(0.1, speedMbps) + 1) * 0.85));

        const existing = routeMap.get(route.key);
        if (existing) {
          existing.speedFactor = speedFactor;
          existing.routeData = route;
          existing.hitMesh.userData.route = route;
          return;
        }

        const routeGrp = new THREE.Group();
        const altBias = isInbound ? 1.0 : 1.13; // Separate simultaneous DL/UL arcs cleanly
        const arcPoints = generateGreatCircleArc(currentHostLat, currentHostLon, route.lat, route.lon, GLOBE_RADIUS, altBias, 56);
        const arcCurve = new THREE.CatmullRomCurve3(arcPoints);

        // Glowing translucent laser tube body
        const tubeRadius = Math.min(0.28, Math.max(0.11, 0.11 + Math.log10(Math.max(1, speedMbps) + 1) * 0.08));
        const tubeGeo = new THREE.TubeGeometry(arcCurve, 48, tubeRadius, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        routeGrp.add(new THREE.Mesh(tubeGeo, tubeMat));

        // Razor-sharp glowing inner fiber core
        const lineGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const lineMat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        routeGrp.add(new THREE.Line(lineGeo, lineMat));

        // Remote Endpoint Node Pin + Halo Ring + Invisible Generous Hover Hit Sphere
        const remotePos = latLonToVector3(route.lat, route.lon, GLOBE_RADIUS);
        const remoteNorm = remotePos.clone().normalize();

        const pinMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const pinMesh = new THREE.Mesh(sharedPinGeo, pinMat);
        pinMesh.position.copy(remotePos).addScaledVector(remoteNorm, 0.3);
        routeGrp.add(pinMesh);

        const pinSpriteMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: colorHex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const pinSprite = new THREE.Sprite(pinSpriteMat);
        pinSprite.scale.set(4.2, 4.2, 1);
        pinSprite.position.copy(remotePos).addScaledVector(remoteNorm, 0.5);
        routeGrp.add(pinSprite);

        const haloRingMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const haloRing = new THREE.Mesh(sharedHaloRingGeo, haloRingMat);
        haloRing.position.copy(remotePos).addScaledVector(remoteNorm, 0.35);
        haloRing.lookAt(remotePos.clone().multiplyScalar(2));
        routeGrp.add(haloRing);

        const hitMesh = new THREE.Mesh(sharedHitGeo, sharedHitMat);
        hitMesh.position.copy(remotePos);
        hitMesh.userData = { route };
        routeGrp.add(hitMesh);

        // Multi-Packet Comet Streaks (Lead photon + fading plasma trail sprites)
        const trainCount = Math.min(3, 1 + Math.floor(route.count / 6) + (speedMbps > 5 ? 1 : 0));
        const packets = [];
        const pSpriteMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: colorHex,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const pCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        for (let p = 0; p < trainCount; p++) {
          const leadMesh = new THREE.Mesh(sharedCorePGeo, pCoreMat);
          const haloSprite = new THREE.Sprite(pSpriteMat);
          haloSprite.scale.set(3.2, 3.2, 1);

          // 2 subtle tail sprites behind lead
          const tails = [];
          for (let tIdx = 0; tIdx < 2; tIdx++) {
            const tailSprite = new THREE.Sprite(pSpriteMat);
            const scale = tIdx === 0 ? 2.1 : 1.3;
            tailSprite.scale.set(scale, scale, 1);
            routeGrp.add(tailSprite);
            tails.push(tailSprite);
          }

          routeGrp.add(leadMesh);
          routeGrp.add(haloSprite);

          packets.push({
            offset: (p / trainCount) + Math.random() * 0.15,
            leadMesh,
            haloSprite,
            tails
          });
        }

        dynamicGroup.add(routeGrp);
        routeMap.set(route.key, {
          group: routeGrp,
          curve: arcCurve,
          isInbound,
          speedFactor,
          packets,
          haloRing,
          routeData: route,
          hitMesh
        });
      });
    };

    syncRoutes(socketsRef.current);

    // 6. Raycasting for smooth node hover
    const raycaster = new THREE.Raycaster();
    const mouseNorm = new THREE.Vector2();

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Keep tooltip inside panel bounds
      const clampedX = Math.min(rect.width - 275, Math.max(12, mouseX + 16));
      const clampedY = Math.min(rect.height - 170, Math.max(12, mouseY + 16));
      setTooltipPos({ x: clampedX, y: clampedY });

      mouseNorm.x = (mouseX / rect.width) * 2 - 1;
      mouseNorm.y = -(mouseY / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNorm, camera);

      const intersects = raycaster.intersectObjects(dynamicGroup.children, true);
      const hit = intersects.find(i => i.object.userData?.route);
      setHoveredRoute(hit ? hit.object.userData.route : null);
    };
    const onMouseLeave = () => setHoveredRoute(null);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);

    const onResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    // Expose imperative controls for React state toggles without recreating WebGL
    container._pulseEngine = {
      updateSockets: (s) => syncRoutes(s, false),
      updateHost: (lat, lon) => {
        if (Math.abs(lat - currentHostLat) > 0.05 || Math.abs(lon - currentHostLon) > 0.05) {
          orientToHost(lat, lon, false);
          syncRoutes(socketsRef.current, true);
        }
      },
      focusHost: () => {
        controls.reset();
        camera.position.set(0, 18, 104);
        orientToHost(currentHostLat, currentHostLon, false);
      },
      setTheme: (mode) => {
        earthMat.uniforms.uMode.value = mode === 'night' ? 1 : mode === 'cyber' ? 2 : 0;
        cloudsMat.opacity = mode === 'hybrid' ? 0.34 : mode === 'night' ? 0.14 : 0.06;
      },
      setAutoRotate: (enabled) => {
        container._desiredAutoRotate = enabled;
        if (!userRotating) controls.autoRotate = enabled;
      }
    };

    // 7. Continuous 60 FPS Render Loop
    const clock = new THREE.Clock();
    let animId = null;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Smoothly orient globe onto real host coords on arrival / center click (shortest angular path)
      if (needsOrientationLerp) {
        let dy = targetRotY - earthGroup.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        const dx = targetRotX - earthGroup.rotation.x;
        earthGroup.rotation.y += dy * 0.08;
        earthGroup.rotation.x += dx * 0.08;
        if (Math.abs(dy) < 0.002 && Math.abs(dx) < 0.002) {
          needsOrientationLerp = false;
        }
      }

      // Drift clouds & deep-space starfield & telemetry rings
      cloudsMesh.rotation.y += delta * 0.012;
      starField.rotation.y -= delta * 0.003;
      ring1.rotation.z += delta * 0.04;
      ring2.rotation.z -= delta * 0.03;

      // Twin staggered shockwave ripples at VPS host origin
      const p1 = (elapsed * 0.75) % 1;
      const p2 = ((elapsed * 0.75) + 0.5) % 1;
      shockwave1.mesh.scale.setScalar(1 + p1 * 3.8);
      shockwave1.mat.opacity = (1 - p1) * 0.85;
      shockwave2.mesh.scale.setScalar(1 + p2 * 3.8);
      shockwave2.mat.opacity = (1 - p2) * 0.85;

      // Animate continuous photon comet packets along SLERP splines
      for (const route of routeMap.values()) {
        const { curve, isInbound, speedFactor, packets, haloRing, routeData } = route;
        const phaseOffset = (routeData?.lat || 0) * 0.1;
        const pulse = 1 + Math.sin(elapsed * 4 + phaseOffset) * 0.22;
        haloRing.scale.setScalar(pulse);

        for (let i = 0; i < packets.length; i++) {
          const pkt = packets[i];
          pkt.offset = (pkt.offset + delta * speedFactor * 0.32) % 1;

          const tLead = isInbound ? 1 - pkt.offset : pkt.offset;
          const posLead = curve.getPoint(Math.max(0, Math.min(1, tLead)));
          pkt.leadMesh.position.copy(posLead);
          pkt.haloSprite.position.copy(posLead);

          // Tail sprites trail behind motion direction
          for (let j = 0; j < pkt.tails.length; j++) {
            const lag = (j + 1) * 0.024;
            const rawTail = (pkt.offset - lag + 1) % 1;
            const tTail = isInbound ? 1 - rawTail : rawTail;
            pkt.tails[j].position.copy(curve.getPoint(Math.max(0, Math.min(1, tTail))));
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
      controls.dispose();
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      for (const r of routeMap.values()) disposeGroup(r.group);
      routeMap.clear();
      sharedCorePGeo.dispose();
      sharedPinGeo.dispose();
      sharedHitGeo.dispose();
      sharedHitMat.dispose();
      sharedHaloRingGeo.dispose();
      glowTex.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    containerRef.current?._pulseEngine?.updateSockets(sockets);
  }, [sockets]);

  useEffect(() => {
    const lat = vps?.ll?.[0];
    const lon = vps?.ll?.[1];
    if (typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon)) {
      containerRef.current?._pulseEngine?.updateHost(lat, lon);
    }
  }, [vps?.ll?.[0], vps?.ll?.[1]]);

  useEffect(() => {
    containerRef.current?._pulseEngine?.setTheme(globeTheme);
  }, [globeTheme]);

  useEffect(() => {
    containerRef.current?._pulseEngine?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  const uniqueCountries = new Set(sockets.map(s => s.geo?.country).filter(Boolean));
  const inboundCount = sockets.filter(s => s.direction === 'inbound').length;
  const outboundCount = sockets.filter(s => s.direction === 'outbound').length;

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl cyber-panel overflow-hidden">
      {/* Subtle deep-space radial backdrop behind transparent WebGL */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(4, 18, 38, 0.65) 0%, rgba(2, 6, 16, 0.95) 75%)'
        }}
      />

      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Telemetry Watermark */}
      <div className="absolute top-3.5 left-3.5 pointer-events-none flex flex-col gap-1 z-20 bg-slate-950/60 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-500/20">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
          </span>
          <span className="text-[10px] font-display uppercase tracking-[0.22em] text-cyan-400 font-bold">
            3D Planetary Traffic
          </span>
        </div>
        <div className="text-[10px] font-mono-val text-slate-300 leading-relaxed">
          NODE: <span className="text-emerald-400 font-bold">{(vps?.city || 'HOST').toUpperCase()} [{vps?.country || 'VPS'}]</span>
          <span className="text-slate-500 ml-1.5">({Number(vps?.ll?.[0] || 0).toFixed(2)}°, {Number(vps?.ll?.[1] || 0).toFixed(2)}°)</span>
          <div className="flex items-center gap-2.5 mt-0.5 text-[10px]">
            <span>FLOWS: <strong className="text-cyan-300">{sockets.length}</strong></span>
            <span className="text-slate-700">•</span>
            <span>COUNTRIES: <strong className="text-pink-400">{uniqueCountries.size}</strong></span>
          </div>
        </div>
      </div>

      {/* Top-Right Interactive Globe Controls */}
      <div className="absolute top-3.5 right-3.5 z-20 flex flex-wrap items-center justify-end gap-1.5">
        <div className="flex bg-slate-950/80 backdrop-blur-md p-0.5 rounded-lg border border-slate-800/70">
          {[
            { id: 'hybrid', label: 'Day/Night', icon: SunMoon },
            { id: 'night', label: 'Lights', icon: Moon },
            { id: 'cyber', label: 'Matrix', icon: Cpu }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setGlobeTheme(id)}
              title={`Switch globe to ${label} mode`}
              className={`px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-mono-val transition-all
                ${globeTheme === id
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-[0_0_10px_rgba(0,243,255,0.2)]'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setAutoRotate(v => !v)}
          title={autoRotate ? 'Pause earth rotation' : 'Resume earth rotation'}
          className="p-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800/70 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-all"
        >
          {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => containerRef.current?._pulseEngine?.focusHost()}
          title="Center camera on VPS host location"
          className="px-2 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800/70 text-emerald-400 hover:border-emerald-500/50 text-[10px] font-mono-val flex items-center gap-1 transition-all"
        >
          <Compass className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Home</span>
        </button>
      </div>

      {/* Bottom-Left Legend */}
      <div className="absolute bottom-3.5 left-3.5 z-20 pointer-events-none flex items-center gap-3.5 bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800/60 text-[10px] font-mono-val">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" />
          <span className="text-slate-300">RX Inbound <span className="text-cyan-400 font-bold">({inboundCount})</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#f43f9c] shadow-[0_0_8px_#f43f9c]" />
          <span className="text-slate-300">TX Outbound <span className="text-pink-400 font-bold">({outboundCount})</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
          <span className="text-emerald-300 font-bold">{vps?.city || 'Host'} Node</span>
        </div>
      </div>

      {/* Bottom-Right Gesture Hint */}
      <div className="absolute bottom-3.5 right-3.5 z-20 pointer-events-none text-right text-[9px] font-mono-val text-slate-400 bg-slate-950/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800/60 hidden sm:block">
        DRAG ORBIT • SCROLL ZOOM • HOVER NODES
      </div>

      {/* Hover Route Tooltip HUD */}
      {hoveredRoute && (
        <div
          className="absolute z-50 pointer-events-none bg-slate-950/95 border border-cyan-400/60 shadow-glow-cyan p-3 rounded-xl text-xs font-mono-val backdrop-blur-md w-64 transition-opacity duration-100"
          style={{ top: `${tooltipPos.y}px`, left: `${tooltipPos.x}px` }}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="font-bold flex items-center gap-1.5 text-cyan-300 truncate">
              <span>{hoveredRoute.sample.geo?.flag || '🌐'}</span>
              <span className="truncate">{hoveredRoute.sample.geo?.city || 'Unknown'}, {hoveredRoute.sample.geo?.country}</span>
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
              hoveredRoute.direction === 'inbound'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
            }`}>
              {hoveredRoute.direction === 'inbound' ? '▼ DOWNLOAD' : '▲ UPLOAD'}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-[11px] text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <span className="font-bold text-white">{maskIp(hoveredRoute.sample.remoteIp)}:{hoveredRoute.sample.remotePort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target ASN:</span>
              <span className="text-cyan-400 truncate max-w-[140px]">{hoveredRoute.sample.geo?.org || 'Public Transit'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Streams:</span>
              <span className="text-purple-300 font-semibold">
                ×{hoveredRoute.count} ({Array.from(hoveredRoute.processes).slice(0, 2).join(', ') || 'kernel'})
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400">Aggregate Rate:</span>
              <span className="font-bold text-emerald-400">{formatSpeed(hoveredRoute.speed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
