import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from 'three/addons/webxr/ARButton.js';

// AR-Museum-Experience
// Single-file React component that sets up a simple AR experience with three.js + WebXR.
// Features implemented (core of the project brief):
// - World / plane placement using hit-test & reticle
// - Image tracking (WebXR Image Tracking API) to trigger contextual content
// - Basic gestures: drag (translate), pinch-to-scale, rotate (two-finger)
// - Light estimation (if available via WebXR Light Probe)
// - Minimal UI: accept camera / explanation overlay, reset button, status messages
// - Robustness: handles loss of tracking, session end, and graceful fallbacks

// Usage notes (short):
// - Test on a secure origin (https) and a WebXR-capable device (Chrome on Android with WebXR flags
//   enabled, or any browser that supports WebXR AR). For image tracking and light estimation, browser
//   support is still experimental—feature-detect and fall back.
// - Bundle with Vite / Create React App. Install three: `npm i three`

export default function App() {
	const mountRef = useRef(null);
	const rendererRef: any = useRef(null);
	const cameraRef: any = useRef(null);
	const sceneRef: any = useRef(null);
	const reticleRef: any = useRef(null);
	const xrSessionRef = useRef(null);
	const [status, setStatus] = useState("idle");
	const [helpOpen, setHelpOpen] = useState(true);
	const [placedObject, setPlacedObject] = useState<any>(null);
	const gestureState: any = useRef({});

	// Helper to create a simple 3D object (a museum piece placeholder)
	function createMuseumObject() {
		const group = new THREE.Group();

		const baseGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32);
		const baseMat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
		const base = new THREE.Mesh(baseGeo, baseMat);
		base.position.y = 0.01;
		group.add(base);

		const artGeo = new THREE.BoxGeometry(0.18, 0.18, 0.05);
		const artMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
		const art = new THREE.Mesh(artGeo, artMat);
		art.position.y = 0.12;
		group.add(art);

		// small label panel
		const labelGeo = new THREE.PlaneGeometry(0.16, 0.05);
		const labelMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
		const label = new THREE.Mesh(labelGeo, labelMat);
		label.position.set(0, 0.05, 0.08);
		label.rotation.x = -0.3;
		group.add(label);

		group.scale.set(1, 1, 1);
		return group;
	}

	useEffect(() => {
		const mount: any = mountRef.current;
		if (!mount) return;

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.xr.enabled = true;
		renderer.setAnimationLoop(() => {}); // set later
		mount.appendChild(renderer.domElement);
		rendererRef.current = renderer;

		const scene = new THREE.Scene();
		sceneRef.current = scene;

		const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
		cameraRef.current = camera;

		// lighting
		const hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 0.6);
		scene.add(hemi);
		const dir = new THREE.DirectionalLight(0xffffff, 0.6);
		dir.position.set(0.5, 2, 0.5);
		scene.add(dir);

		// Reticle for placement (a ring that sits on detected surfaces)
		const ringGeo = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
		const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
		const reticle = new THREE.Mesh(ringGeo, ringMat);
		reticle.matrixAutoUpdate = false;
		reticle.visible = false;
		scene.add(reticle);
		reticleRef.current = reticle;

		// Keep a clock for animations
		const clock = new THREE.Clock();

		// Handle resizing
		const onResize = () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		};
		window.addEventListener("resize", onResize);

		// XR animation loop
		function render() {
			// simple pulse effect on reticle when visible
			if (reticle.visible) {
				const t = clock.getElapsedTime();
				const scale = 1 + 0.05 * Math.sin(t * 3);
				reticle.scale.set(scale, scale, scale);
			}

			renderer.render(scene, camera);
		}

		renderer.setAnimationLoop(render);

		// Start button using three.js ARButton
		const arButton = ARButton.createButton(renderer, {
			requiredFeatures: ["hit-test"],
			optionalFeatures: ["dom-overlay", "light-estimation", "image-tracking", "planes"],
		});
		// Attach the ARButton to the DOM in a readable place
		arButton.style.position = "absolute";
		arButton.style.bottom = "20px";
		arButton.style.left = "20px";
		mount.appendChild(arButton);

		// When a session starts, keep reference
		function onSessionStart(session: any) {
			xrSessionRef.current = session;
			setStatus("session-started");

			// if light probe available, attempt to create one
			(async () => {
				try {
					if (session.requestLightProbe) {
						const probe = await session.requestLightProbe();
						// note: three.js does not automatically integrate; you'd sample probe reflections
						// placeholder: we just set a little extra intensity on directional light
						probe.addEventListener && probe.addEventListener("reflectionchange", () => {
							dir.intensity = 0.8;
						});
					}
				} catch (e) {
					// feature not available or denied; ignore
				}
			})();

			// Setup image tracking if available
			if (session.updateTargetImages) {
				// NOTE: this block uses the (experimental) WebXR Image Tracking API.
				// You must provide images as ImageBitmap with physicalWidth in meters.
				// We'll attempt to fetch an example image and register it.
				(async () => {
					try {
						const resp = await fetch("/assets/marker.jpg"); // developer should include marker.jpg
						const blob = await resp.blob();
						const bitmap = await createImageBitmap(blob);
						// inform the session about target images
						// This API shape may vary between browsers; this is a best-effort example
						const tracked = [{ image: bitmap, widthInMeters: 0.2, id: "poster1" }];
						await session.updateTargetImages(tracked);
						console.log("Image tracking configured");
					} catch (err) {
						console.warn("Unable to setup image tracking:", err);
					}
				})();
			}

			// create a hit-test source for placing objects on planes
			let viewerSpace = null;
			let hitTestSource: any = null;

			(async () => {
				try {
					viewerSpace = await session.requestReferenceSpace("viewer");
					hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
				} catch (err) {
					console.warn("Hit test not available", err);
				}
			})();

			// Listen to XRFrame events via requestAnimationFrame inside render loop
			renderer.setAnimationLoop((xrFrame: any) => {
				if (xrFrame && hitTestSource) {
					const referenceSpace: any = renderer.xr.getReferenceSpace();
					const hitTestResults = xrFrame.getHitTestResults(hitTestSource);
					if (hitTestResults.length > 0) {
						const hit = hitTestResults[0];
						const pose = hit.getPose(referenceSpace);
						reticle.visible = true;
						reticle.matrix.fromArray(pose.transform.matrix);
					} else {
						reticle.visible = false;
					}
				}

				// Image tracking event handling (experimental)
				if (xrFrame && xrFrame.getImageTrackingResults) {
					const results = xrFrame.getImageTrackingResults();
					for (const result of results) {
						// result.index, result.imageSpace, result.trackingState
						const state = result.trackingState; // 'tracked' | 'emulated' | 'not-tracked'
						// When tracked, we can get its pose
						if (state === 'tracked') {
							const imagePose = xrFrame.getPose(result.imageSpace, renderer.xr.getReferenceSpace());
							if (imagePose) {
								// create or update contextual 3D content anchored to the marker
								let markerObject = scene.getObjectByName(`marker-${result.index}`);
								if (!markerObject) {
									markerObject = createMuseumObject();
									markerObject.name = `marker-${result.index}`;
									scene.add(markerObject);
								}
								markerObject.matrixAutoUpdate = false;
								markerObject.matrix.fromArray(imagePose.transform.matrix);
								markerObject.visible = true;
							}
						} else {
							// hide contextual content when not tracked (design choice: hide)
							const markerObject = scene.getObjectByName(`marker-${result.index}`);
							if (markerObject) markerObject.visible = false;
						}
					}
				}

				renderer.render(scene, camera);
			});

			session.addEventListener("end", () => {
				xrSessionRef.current = null;
				setStatus("session-ended");
				reticle.visible = false;
			});

			// Basic pointer-based gestures for placed object (works outside immersive session too)
			let active = false;
			let lastPointers: any = {};

			function onPointerDown(e: any) {
				active = true;
				lastPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
			}
			function onPointerMove(e: any) {
				if (!active) return;
				// multi-touch gestures
				lastPointers[e.pointerId] = { x: e.clientX, y: e.clientY };

				const ids = Object.keys(lastPointers);
				if (!placedObject) return;

				if (ids.length === 1) {
					// single-finger drag -> translate object along camera plane
					// const p = lastPointers[ids[0]];
					// simple translation mapping (not physically accurate but intuitive)
					// move object horizontally & vertically relative to camera
					const dx = (e.movementX || 0) / window.innerWidth;
					const dy = (e.movementY || 0) / window.innerHeight;
					placedObject.position.x += dx * 0.5;
					placedObject.position.y -= dy * 0.5;
				} else if (ids.length === 2) {
					// two-finger: pinch to scale, rotation by angle difference
					const p1 = lastPointers[ids[0]];
					const p2 = lastPointers[ids[1]];
					const curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
					if (!gestureState.current.startDist) gestureState.current.startDist = curDist;
					const scaleFactor = curDist / gestureState.current.startDist;
					placedObject.scale.setScalar(gestureState.current.startScale * scaleFactor);

					// rotation: compute angle between the two pointers
					const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
					if (!gestureState.current.startAngle) gestureState.current.startAngle = angle;
					const delta = angle - gestureState.current.startAngle;
					placedObject.rotation.y = gestureState.current.startRotationY + delta;
				}
			}
			function onPointerUp(e: any) {
				delete lastPointers[e.pointerId];
				if (Object.keys(lastPointers).length === 0) {
					active = false;
					gestureState.current = {};
				} else if (Object.keys(lastPointers).length === 1) {
					// preserve current scale/rotation
					gestureState.current.startScale = placedObject ? placedObject.scale.x : 1;
					gestureState.current.startRotationY = placedObject ? placedObject.rotation.y : 0;
				}
			}

			window.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);

			// Place object when user taps screen and reticle visible
			function onSelect() {
				if (reticle.visible) {
					const obj = createMuseumObject();
					// position object according to reticle
					obj.matrixAutoUpdate = false;
					obj.matrix.copy(reticle.matrix);
					// compute position from matrix
					obj.position.setFromMatrixPosition(reticle.matrix);
					obj.matrixAutoUpdate = true;
					scene.add(obj);
					setPlacedObject(obj);
					setStatus("placed");
				}
			}

			session.addEventListener("select", onSelect);

			// cleanup when session ends
			session.addEventListener("end", () => {
				window.removeEventListener("pointerdown", onPointerDown);
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			});
		}

		// Listen to ARButton session events
		renderer.xr.addEventListener("sessionstart", () => onSessionStart(renderer.xr.getSession()));

		// initial status
		setStatus("ready");

		// cleanup on unmount
		return () => {
			window.removeEventListener("resize", onResize);
			renderer.setAnimationLoop(null);
			if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
			if (arButton && arButton.parentNode) arButton.parentNode.removeChild(arButton);
			renderer.dispose();
		};
	}, []);

	// Reset scene: remove placed objects & markers
	function handleReset() {
		const scene = sceneRef.current;
		if (!scene) return;
		const toRemove: any[] = [];
		scene.traverse((c: any) => {
			if (c.isMesh && c.name !== 'Reticle') toRemove.push(c);
		});
		toRemove.forEach((o) => {
			if (o.parent) o.parent.remove(o);
			if (o.geometry) o.geometry.dispose();
			if (o.material) {
				if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose()); else o.material.dispose();
			}
		});
		setPlacedObject(null);
		setStatus('reset');
	}

	return (
		<div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
			<div ref={mountRef} style={{ width: '100%', height: '100%' }} />

			{/* Minimal overlay UI */}
			<div style={{ position: 'absolute', top: 12, left: 12, color: '#fff', fontFamily: 'sans-serif' }}>
				<div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 8 }}>
					<div style={{ fontWeight: '700' }}>AR Museum — Statut: {status}</div>
					<div style={{ fontSize: 12, opacity: 0.9 }}>Aidez: {helpOpen ? 'visible' : 'cachée'}</div>
				</div>
			</div>

			<div style={{ position: 'absolute', right: 12, top: 12 }}>
				<button onClick={() => setHelpOpen(h => !h)} style={{ padding: '8px 10px', borderRadius: 8 }}>Aide</button>
				<button onClick={handleReset} style={{ padding: '8px 10px', borderRadius: 8, marginLeft: 8 }}>Réinitialiser</button>
			</div>

			{helpOpen && (
				<div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 90, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 12, borderRadius: 8, maxWidth: 420 }}>
					<div style={{ fontWeight: 700 }}>Mode d'emploi rapide</div>
					<ul style={{ fontSize: 13 }}>
						<li>Autorisez l'accès à la caméra.</li>
						<li>Visez un sol/table pour détecter une surface (anneau visible).</li>
						<li>Touchez pour placer l'objet; utilisez un doigt pour déplacer, deux pour agrandir/faire tourner.</li>
						<li>Visez l'affiche/marqueur pour révéler un contenu contextuel basé sur l'image (si pris en charge).</li>
					</ul>
				</div>
			)}
		</div>
	);
}
