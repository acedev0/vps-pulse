import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Convert Lat/Lon to 3D Cartesian coordinates on sphere of radius R
function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Generate mathematically true Great-Circle SLERP arc points that NEVER clip into the Earth
function generateGreatCircleArc(startLat, startLon, endLat, endLon, radius, numPoints = 48) {
  const p1 = latLonToVector3(startLat, startLon, 1).normalize();
  const p2 = latLonToVector3(endLat, endLon, 1).normalize();

  const dot = Math.max(-1, Math.min(1, p1.dot(p2)));
  const omega = Math.acos(dot);

  if (omega < 0.005) {
    return [p1.clone().multiplyScalar(radius), p2.clone().multiplyScalar(radius)];
  }

  // Altitude envelope: higher for intercontinental routes, gentle for regional
  const maxAltitude = radius * Math.min(0.42, 0.12 + (omega / Math.PI) * 0.32);
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

    // Sine arch ensures altitude is 0 at ends and peaks in the middle
    const alt = maxAltitude * Math.sin(Math.PI * t);
    points.push(unitVec.multiplyScalar(radius + alt));
  }

  return points;
}

export function GlobeVisualizer({ sockets = [], vps = null, streamerMode = false }) {
  const containerRef = useRef(null);
  const socketsRef = useRef(sockets);
  socketsRef.current = sockets;

  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const maskIp = (ip) => {
    if (!streamerMode || !ip) return ip;
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
    return ip;
  };

  const formatSpeed = (bytes) => {
    if (!bytes) return '0.0 Mbps';
    const mbps = (bytes * 8) / 1000000;
    return `${mbps.toFixed(1)} Mbps`;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 25, 110);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls (Google Earth Navigation)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 1.0;
    controls.minDistance = 42; // Deep zoom into continent level
    controls.maxDistance = 220;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    let autoRotateTimer = null;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
    });
    controls.addEventListener('end', () => {
      autoRotateTimer = setTimeout(() => {
        controls.autoRotate = true;
      }, 4000);
    });

    // 3. Realistic Sunlight & Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunLight.position.set(60, 40, 60);
    scene.add(sunLight);

    const backLight = new THREE.DirectionalLight(0x00f3ff, 0.35);
    backLight.position.set(-60, -20, -60);
    scene.add(backLight);

    const GLOBE_RADIUS = 36;
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    // Initial rotation: Face Singapore towards camera
    earthGroup.rotation.y = -Math.PI * 0.45;
    earthGroup.rotation.x = 0.15;

    // 4. Realistic NASA Blue Marble Earth Sphere
    const textureLoader = new THREE.TextureLoader();
    const blueMarbleTex = textureLoader.load('/earth-blue-marble.jpg');
    blueMarbleTex.colorSpace = THREE.SRGBColorSpace;
    const topologyTex = textureLoader.load('/earth-topology.png');

    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const earthMat = new THREE.MeshPhongMaterial({
      map: blueMarbleTex,
      bumpMap: topologyTex,
      bumpScale: 0.08,
      specular: new THREE.Color(0x1a334d),
      shininess: 14
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // 5. Floating Independent Cloud Layer
    const cloudsTex = textureLoader.load('/earth-clouds.png');
    const cloudsGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.006, 64, 64);
    const cloudsMat = new THREE.MeshPhongMaterial({
      map: cloudsTex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    earthGroup.add(cloudsMesh);

    // 6. Atmospheric Blue Halo Rim (Google Earth rim glow)
    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 48, 48);
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
          float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
          gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0) * intensity * 0.85;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosMesh);

    // 7. Singapore VPS Node Origin (Beacon & Ripple Ring)
    const vpsLat = vps?.ll?.[0] ?? 1.2897;
    const vpsLon = vps?.ll?.[1] ?? 103.8501;
    const vpsPos = latLonToVector3(vpsLat, vpsLon, GLOBE_RADIUS);

    const beaconCylinderGeo = new THREE.CylinderGeometry(0.3, 0.6, 4, 16);
    const beaconCylinderMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const beaconMesh = new THREE.Mesh(beaconCylinderGeo, beaconCylinderMat);
    beaconMesh.position.copy(vpsPos);
    beaconMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vpsPos.clone().normalize());
    beaconMesh.translateY(2);
    earthGroup.add(beaconMesh);

    const ringGeo = new THREE.RingGeometry(1.2, 3.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(vpsPos);
    ringMesh.lookAt(new THREE.Vector3(0, 0, 0));
    earthGroup.add(ringMesh);

    // 8. Dynamic Arcs & Particles Container
    const dynamicGroup = new THREE.Group();
    earthGroup.add(dynamicGroup);

    // Raycasting for hover tooltips
    const raycaster = new THREE.Raycaster();
    const mouseNorm = new THREE.Vector2();

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setTooltipPos({ x: mouseX + 16, y: mouseY + 16 });

      mouseNorm.x = (mouseX / width) * 2 - 1;
      mouseNorm.y = -(mouseY / height) * 2 + 1;
      raycaster.setFromCamera(mouseNorm, camera);

      const intersects = raycaster.intersectObjects(dynamicGroup.children, true);
      const hit = intersects.find(i => i.object.userData?.socket);
      setHoveredNode(hit ? hit.object.userData.socket : null);
    };
    container.addEventListener('mousemove', onMouseMove);

    const onResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    const particleStreams = [];

    // Controller for updating sockets without remounting scene
    container._pulseEngine = {
      updateSockets: (newSockets) => {
        while (dynamicGroup.children.length > 0) {
          const obj = dynamicGroup.children[0];
          dynamicGroup.remove(obj);
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        }
        particleStreams.length = 0;

        const display = newSockets.slice(0, 32);
        display.forEach((sock) => {
          const lat = sock.geo?.ll?.[0];
          const lon = sock.geo?.ll?.[1];
          if (lat === undefined || lon === undefined || sock.geo?.isLocal) return;

          const remotePos = latLonToVector3(lat, lon, GLOBE_RADIUS);
          const isInbound = sock.direction === 'inbound';
          const colorHex = isInbound ? 0x00f3ff : 0xec4899; // Cyan for Download, Magenta for Upload

          // True Great-Circle SLERP trajectory
          const arcPoints = generateGreatCircleArc(vpsLat, vpsLon, lat, lon, GLOBE_RADIUS, 48);
          const arcCurve = new THREE.CatmullRomCurve3(arcPoints);

          const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
          const arcMat = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending
          });
          const arcLine = new THREE.Line(arcGeo, arcMat);
          dynamicGroup.add(arcLine);

          // Remote endpoint sphere pin
          const pinGeo = new THREE.SphereGeometry(1.2, 12, 12);
          const pinMat = new THREE.MeshBasicMaterial({ color: colorHex, blending: THREE.AdditiveBlending });
          const pinMesh = new THREE.Mesh(pinGeo, pinMat);
          pinMesh.position.copy(remotePos);
          pinMesh.userData = { socket: sock };
          dynamicGroup.add(pinMesh);

          // Photon laser packets
          const pCount = Math.max(3, Math.min(8, Math.round((sock.speed || 10000) / 100000) + 3));
          const particles = [];
          const offsets = [];
          const speedFactor = Math.min(3.5, Math.max(0.8, Math.log10(sock.speed || 30000) * 0.5));

          const pGeo = new THREE.SphereGeometry(0.75, 8, 8);
          const pMat = new THREE.MeshBasicMaterial({ color: colorHex, blending: THREE.AdditiveBlending });

          for (let p = 0; p < pCount; p++) {
            const pMesh = new THREE.Mesh(pGeo, pMat);
            const initialOffset = p / pCount;
            offsets.push(initialOffset);
            pMesh.position.copy(arcCurve.getPoint(initialOffset));
            dynamicGroup.add(pMesh);
            particles.push(pMesh);
          }

          particleStreams.push({ curve: arcCurve, particles, offsets, isInbound, speedFactor });
        });
      }
    };

    container._pulseEngine.updateSockets(socketsRef.current);

    // Continuous 60 FPS Render Loop
    let clock = new THREE.Clock();
    let animId = null;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Clouds rotate smoothly
      cloudsMesh.rotation.y += 0.0003;

      // Pulse Singapore beacon ring
      const ringScale = 1 + (Math.sin(elapsed * 3.5) * 0.35 + 0.35);
      ringMesh.scale.set(ringScale, ringScale, ringScale);
      ringMat.opacity = Math.max(0.15, 1 - (ringScale - 1) / 0.7);

      // Animate photon particles along great circle curves
      for (let s = 0; s < particleStreams.length; s++) {
        const stream = particleStreams[s];
        const { curve, particles, offsets, isInbound, speedFactor } = stream;
        for (let i = 0; i < particles.length; i++) {
          offsets[i] += delta * speedFactor * 0.35;
          if (offsets[i] > 1) offsets[i] -= 1;
          const t = isInbound ? 1 - offsets[i] : offsets[i];
          particles[i].position.copy(curve.getPoint(t));
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      controls.dispose();
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousemove', onMouseMove);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Run ONCE on mount!

  useEffect(() => {
    const container = containerRef.current;
    if (container?._pulseEngine) {
      container._pulseEngine.updateSockets(sockets);
    }
  }, [sockets]);

  const uniqueCountries = new Set(sockets.map(s => s.geo?.country).filter(Boolean));
  const inboundCount = sockets.filter(s => s.direction === 'inbound').length;
  const outboundCount = sockets.filter(s => s.direction === 'outbound').length;

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl cyber-panel overflow-hidden border border-cyan-500/20">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top HUD Watermark */}
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1.5 z-20">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
          </span>
          <span className="text-[11px] font-display uppercase tracking-[0.25em] text-cyan-400 font-bold">
            Real 3D Earth // Google Earth Style
          </span>
        </div>
        <div className="text-[10px] font-mono-val text-slate-300 leading-relaxed pl-4">
          NODE: <span className="text-emerald-400 font-bold">{(vps?.city || 'NODE').toUpperCase()} [{vps?.country || 'VPS'}]</span> • {Number(vps?.ll?.[0] || 0).toFixed(4)}°, {Number(vps?.ll?.[1] || 0).toFixed(4)}°<br/>
          STREAMS: <span className="text-cyan-300 font-bold">{sockets.length}</span> •
          COUNTRIES: <span className="text-pink-400 font-bold">{uniqueCountries.size}</span>
        </div>
      </div>

      {/* Bottom Legend */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex items-center gap-4 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800/60 text-[10px] font-mono-val">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" />
          <span className="text-slate-300">RX Inbound ({inboundCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ec4899] shadow-[0_0_8px_#ec4899]" />
          <span className="text-slate-300">TX Outbound ({outboundCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
          <span className="text-emerald-300 font-bold">{vps?.city || 'Host'} VPS Node</span>
        </div>
      </div>

      {/* Bottom right instructions badge */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none text-right text-[10px] font-mono-val text-slate-400 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800/60 hidden sm:block">
        ORBIT: DRAG • ZOOM: SCROLL • HOVER NODES
      </div>

      {/* Hover Node Tooltip HUD */}
      {hoveredNode && (
        <div
          className="absolute z-50 pointer-events-none bg-slate-950/95 border border-cyan-400/60 shadow-glow-cyan p-3 rounded-xl text-xs font-mono-val backdrop-blur-md w-64 transition-all duration-75"
          style={{ top: `${tooltipPos.y}px`, left: `${tooltipPos.x}px` }}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="font-bold flex items-center gap-1.5 text-cyan-300">
              <span>{hoveredNode.geo?.flag || '🌐'}</span>
              <span>{hoveredNode.geo?.city || 'Unknown'}</span>
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              hoveredNode.direction === 'inbound'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
            }`}>
              {hoveredNode.direction === 'inbound' ? '▼ DOWNLOAD' : '▲ UPLOAD'}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-[11px] text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <span className="font-bold text-white">{maskIp(hoveredNode.remoteIp)}:{hoveredNode.remotePort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target ASN:</span>
              <span className="text-cyan-400 truncate max-w-[130px]">{hoveredNode.geo?.org || 'Public Transit'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Process:</span>
              <span className="text-purple-300 font-semibold">{hoveredNode.process} ({hoveredNode.pid})</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400">Rate:</span>
              <span className="font-bold text-emerald-400">{formatSpeed(hoveredNode.speed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
