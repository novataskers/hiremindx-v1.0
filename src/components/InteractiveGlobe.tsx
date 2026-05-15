"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  type?: string;
  color?: string;
}

export interface GlobeHandle {
  flyTo: (lat: number, lng: number, altitude?: number) => void;
  addMarker: (marker: GlobeMarker) => void;
  clearMarkers: () => void;
}

interface Props {
  markers?: GlobeMarker[];
  onMarkerClick?: (marker: GlobeMarker) => void;
  className?: string;
}

// Convert lat/lng to 3D point on sphere
function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Build arc curve between two points on sphere
function buildArc(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  radius: number,
  arcHeight = 0.35
): THREE.CatmullRomCurve3 {
  const start = latLngToVec3(lat1, lng1, radius);
  const end = latLngToVec3(lat2, lng2, radius);
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(radius * (1 + arcHeight));
  return new THREE.CatmullRomCurve3([start, mid, end], false, "chordal", 0.5);
}

const InteractiveGlobe = forwardRef<GlobeHandle, Props>(
  ({ markers = [], onMarkerClick, className = "" }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const globeGroupRef = useRef<THREE.Group | null>(null);
    const markerGroupRef = useRef<THREE.Group | null>(null);
    const arcGroupRef = useRef<THREE.Group | null>(null);
    const frameRef = useRef<number>(0);
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const autoRotateRef = useRef(true);
    const autoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rotationRef = useRef({ x: 0.3, y: 0 }); // tilt slightly
    const markersRef = useRef<GlobeMarker[]>(markers);
    const RADIUS = 1.0;

    markersRef.current = markers;

    const buildMarkers = useCallback(() => {
      const group = markerGroupRef.current;
      if (!group) return;
      // Clear old
      while (group.children.length) group.remove(group.children[0]);

      const mks = markersRef.current;
      mks.forEach((m) => {
        const pos = latLngToVec3(m.lat, m.lng, RADIUS + 0.012);
        const isUser = m.id === "__my_location__";
        // User location = golden circle, others = orange square (or custom color)
        const markerColor = isUser ? 0xf5c518 : (m.color ? new THREE.Color(m.color).getHex() : 0xff6600);
        const size = isUser ? 0.055 : 0.045;
        const geo = isUser
          ? new THREE.CircleGeometry(size / 2, 16)
          : new THREE.PlaneGeometry(size, size);
        const mat = new THREE.MeshBasicMaterial({
          color: markerColor,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.lookAt(pos.clone().multiplyScalar(2));
        mesh.userData = m;
        group.add(mesh);

        // Golden pulse ring for user location
        if (isUser) {
          const ringGeo = new THREE.RingGeometry(size * 0.7, size * 1.0, 24);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xf5c518,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthTest: false,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.copy(pos);
          ring.lookAt(pos.clone().multiplyScalar(2));
          group.add(ring);
        }
      });

      // Rebuild arcs — skip user location marker
      const arcGroup = arcGroupRef.current;
      if (!arcGroup) return;
      while (arcGroup.children.length) arcGroup.remove(arcGroup.children[0]);

      const workerMarkers = mks.filter(m => m.id !== "__my_location__");

      // Draw arcs between all pairs of markers
        const arcMat = new THREE.LineBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        });
      for (let i = 0; i < workerMarkers.length; i++) {
        for (let j = i + 1; j < workerMarkers.length; j++) {
          const curve = buildArc(workerMarkers[i].lat, workerMarkers[i].lng, workerMarkers[j].lat, workerMarkers[j].lng, RADIUS);
          const points = curve.getPoints(64);
          const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
          arcGroup.add(new THREE.Line(arcGeo, arcMat.clone()));
        }
      }
    }, []);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      // Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Camera
      const W = mount.clientWidth || 600;
      const H = mount.clientHeight || 600;
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.z = 2.6;
      cameraRef.current = camera;

      // Renderer — transparent background
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Globe group
      const globeGroup = new THREE.Group();
      globeGroup.rotation.x = rotationRef.current.x;
      scene.add(globeGroup);
      globeGroupRef.current = globeGroup;

        // Pure black sphere base
        const sphereGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        globeGroup.add(new THREE.Mesh(sphereGeo, sphereMat));

        // Country outline lines from TopoJSON
        fetch("/countries-110m.json")
          .then((r) => r.json())
          .then((topo: Topology) => {
            const countries = feature(
              topo,
              topo.objects.countries as GeometryCollection
            );
            const lineMat = new THREE.LineBasicMaterial({
              color: 0xcccccc,
              transparent: true,
              opacity: 0.85,
            });

          (countries as GeoJSON.FeatureCollection).features.forEach((f) => {
            const geom = f.geometry as GeoJSON.Geometry;
            const polygons: number[][][][] = [];

            if (geom.type === "Polygon") {
              polygons.push(geom.coordinates as number[][][]);
            } else if (geom.type === "MultiPolygon") {
              (geom.coordinates as number[][][][]).forEach((p) => polygons.push(p));
            }

            polygons.forEach((poly) => {
              poly.forEach((ring) => {
                const pts: THREE.Vector3[] = [];
                ring.forEach(([lng, lat]) => {
                  pts.push(latLngToVec3(lat, lng, RADIUS + 0.002));
                });
                if (pts.length < 2) return;
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                globeGroup.add(new THREE.Line(geo, lineMat));
              });
            });
          });
        });

      // Marker & arc groups (on top of globe rotation)
      const markerGroup = new THREE.Group();
      const arcGroup = new THREE.Group();
      globeGroup.add(markerGroup);
      globeGroup.add(arcGroup);
      markerGroupRef.current = markerGroup;
      arcGroupRef.current = arcGroup;

      buildMarkers();

      // Animate
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        if (autoRotateRef.current && !isDraggingRef.current) {
          globeGroup.rotation.y += 0.0015;
        }
        renderer.render(scene, camera);
      };
      animate();

      // Resize
      const ro = new ResizeObserver(() => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(mount);

      return () => {
        cancelAnimationFrame(frameRef.current);
        ro.disconnect();
        renderer.dispose();
        mount.removeChild(renderer.domElement);
      };
    }, [buildMarkers]);

    // Rebuild markers when prop changes
    useEffect(() => {
      buildMarkers();
    }, [markers, buildMarkers]);

    // Mouse drag
    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const onDown = (e: MouseEvent) => {
        isDraggingRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        autoRotateRef.current = false;
        if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
        mount.style.cursor = "grabbing";
      };
      const onMove = (e: MouseEvent) => {
        if (!isDraggingRef.current || !globeGroupRef.current) return;
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        globeGroupRef.current.rotation.y += dx * 0.005;
        globeGroupRef.current.rotation.x = Math.max(
          -1.0, Math.min(1.0, globeGroupRef.current.rotation.x + dy * 0.005)
        );
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      };
      const onUp = () => {
        isDraggingRef.current = false;
        mount.style.cursor = "grab";
        autoTimeoutRef.current = setTimeout(() => { autoRotateRef.current = true; }, 5000);
      };

      // Scroll wheel zoom
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const camera = cameraRef.current;
        if (!camera) return;
        const delta = e.deltaY * 0.002;
        camera.position.z = Math.max(1.4, Math.min(5.0, camera.position.z + delta));
      };

      // Touch pinch zoom
      let lastPinchDist = 0;
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        } else if (e.touches.length === 1) {
          isDraggingRef.current = true;
          lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          autoRotateRef.current = false;
          if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const delta = (lastPinchDist - dist) * 0.01;
          lastPinchDist = dist;
          const camera = cameraRef.current;
          if (camera) camera.position.z = Math.max(1.4, Math.min(5.0, camera.position.z + delta));
        } else if (e.touches.length === 1 && isDraggingRef.current && globeGroupRef.current) {
          const dx = e.touches[0].clientX - lastMouseRef.current.x;
          const dy = e.touches[0].clientY - lastMouseRef.current.y;
          globeGroupRef.current.rotation.y += dx * 0.005;
          globeGroupRef.current.rotation.x = Math.max(-1.0, Math.min(1.0, globeGroupRef.current.rotation.x + dy * 0.005));
          lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      };
      const onTouchEnd = () => {
        isDraggingRef.current = false;
        autoTimeoutRef.current = setTimeout(() => { autoRotateRef.current = true; }, 5000);
      };

      mount.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      mount.addEventListener("wheel", onWheel, { passive: false });
      mount.addEventListener("touchstart", onTouchStart, { passive: false });
      mount.addEventListener("touchmove", onTouchMove, { passive: false });
      mount.addEventListener("touchend", onTouchEnd);
      mount.style.cursor = "grab";

      return () => {
        mount.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        mount.removeEventListener("wheel", onWheel);
        mount.removeEventListener("touchstart", onTouchStart);
        mount.removeEventListener("touchmove", onTouchMove);
        mount.removeEventListener("touchend", onTouchEnd);
        if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
      };
    }, []);

    // Click markers
    useEffect(() => {
      const mount = mountRef.current;
      if (!mount || !onMarkerClick) return;
      const onClick = (e: MouseEvent) => {
        const camera = cameraRef.current;
        const markerGroup = markerGroupRef.current;
        if (!camera || !markerGroup) return;
        const rect = mount.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(markerGroup.children, true);
        if (hits.length > 0) {
          const marker = hits[0].object.userData as GlobeMarker;
          if (marker?.id) onMarkerClick(marker);
        }
      };
      mount.addEventListener("click", onClick);
      return () => mount.removeEventListener("click", onClick);
    }, [onMarkerClick]);

    useImperativeHandle(ref, () => ({
      flyTo: (lat: number, lng: number) => {
        const globe = globeGroupRef.current;
        if (!globe) return;
        autoRotateRef.current = false;
        if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
        // Rotate globe so the point faces camera
        globe.rotation.y = -lng * (Math.PI / 180);
        globe.rotation.x = lat * (Math.PI / 180) * 0.5;
        autoTimeoutRef.current = setTimeout(() => { autoRotateRef.current = true; }, 10000);
      },
      addMarker: (marker: GlobeMarker) => {
        markersRef.current = [...markersRef.current.filter((m) => m.id !== marker.id), marker];
        buildMarkers();
      },
      clearMarkers: () => {
        markersRef.current = [];
        buildMarkers();
      },
    }));

    return (
      <div
        ref={mountRef}
        className={`w-full h-full ${className}`}
        style={{ background: "transparent" }}
      />
    );
  }
);

InteractiveGlobe.displayName = "InteractiveGlobe";
export default InteractiveGlobe;
