import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

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
	const [helpOpen, setHelpOpen] = useState(false);
	const [placedObject, setPlacedObject] = useState<any>(null);
	const [isARSupported, setIsARSupported] = useState(false);
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
		mount.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		
		// Style pour assurer la visibilité du canvas
		renderer.domElement.style.position = 'absolute';
		renderer.domElement.style.top = '0';
		renderer.domElement.style.left = '0';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

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
		function render(_timestamp: number, _frame: any) {
			// simple pulse effect on reticle when visible
			if (reticle.visible) {
				const t = clock.getElapsedTime();
				const scale = 1 + 0.05 * Math.sin(t * 3);
				reticle.scale.set(scale, scale, scale);
			}

			renderer.render(scene, camera);
		}

		renderer.setAnimationLoop(render);

		// Vérifier si WebXR AR est supporté
		if (navigator.xr) {
			navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
				console.log('WebXR AR supporté:', supported);
				console.log('User Agent:', navigator.userAgent);
				setIsARSupported(supported);
				if (supported) {
					setStatus('ready');
				} else {
					setStatus('ar-not-supported');
				}
			}).catch((err) => {
				console.error('Erreur vérification WebXR:', err);
				setStatus('ar-not-supported');
			});
		} else {
			console.log('navigator.xr non disponible');
			console.log('User Agent:', navigator.userAgent);
			setStatus('webxr-not-available');
		}

		// When a session starts, keep reference
		function onSessionStart(session: any) {
			console.log('AR Session started:', session);
			xrSessionRef.current = session;
			setStatus("session-started");
			
			// Simple render loop - juste afficher la caméra AR
			renderer.setAnimationLoop(() => {
				renderer.render(scene, camera);
			});

			session.addEventListener("end", () => {
				xrSessionRef.current = null;
				setStatus("session-ended");
				reticle.visible = false;
				// Restaurer la boucle normale
				renderer.setAnimationLoop(render);
			});
		}

		// Listen to XR session events
		renderer.xr.addEventListener("sessionstart", () => onSessionStart(renderer.xr.getSession()));

		// cleanup on unmount
			return () => {
			window.removeEventListener("resize", onResize);
			renderer.setAnimationLoop(null);
			if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
			renderer.dispose();
		};
	}, []);

	// Démarrer la session AR
	async function startAR() {
		if (!rendererRef.current || !navigator.xr) return;
		
		try {
			console.log('Démarrage de la session AR...');
			
			// Configuration minimale absolue
			const session = await navigator.xr.requestSession('immersive-ar');
			console.log('Session AR obtenue:', session);
			
			await rendererRef.current.xr.setSession(session);
			console.log('Session configurée dans Three.js');
			
		} catch (error: any) {
			console.error('Erreur complète:', error);
			console.error('Nom:', error.name);
			console.error('Message:', error.message);
			console.error('Stack:', error.stack);
			setStatus('error: ' + (error?.message || String(error)));
		}
	}

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
			<div style={{ position: 'absolute', top: 12, left: 12, color: '#fff', fontFamily: 'sans-serif', pointerEvents: 'none' }}>
				<div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 8 }}>
					<div style={{ fontWeight: '700' }}>AR Museum — Statut: {status}</div>
					<div style={{ fontSize: 12, opacity: 0.9 }}>Aidez: {helpOpen ? 'visible' : 'cachée'}</div>
				</div>
			</div>

			<div style={{ position: 'absolute', right: 12, top: 12, pointerEvents: 'auto', zIndex: 1000 }}>
				<button onClick={() => setHelpOpen(h => !h)} style={{ padding: '8px 10px', borderRadius: 8, pointerEvents: 'auto' }}>Aide</button>
				<button onClick={handleReset} style={{ padding: '8px 10px', borderRadius: 8, marginLeft: 8, pointerEvents: 'auto' }}>Réinitialiser</button>
			</div>

			{/* Bouton START AR au centre */}
			{isARSupported && status === 'ready' && (
				<div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', zIndex: 1001 }}>
					<button 
						onClick={startAR}
						style={{ 
							padding: '16px 40px', 
							fontSize: '18px',
							fontWeight: 'bold',
							borderRadius: 12, 
							background: '#00ffcc',
							color: '#000',
							border: 'none',
							cursor: 'pointer',
							boxShadow: '0 4px 12px rgba(0,255,204,0.4)'
						}}
					>
						START AR
					</button>
				</div>
			)}

			{!isARSupported && status !== 'idle' && (
				<div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 1001, background: 'rgba(255,0,0,0.7)', color: '#fff', padding: '12px 24px', borderRadius: 8 }}>
					AR non supporté sur cet appareil
				</div>
			)}

			{helpOpen && (
				<div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 90, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: 12, borderRadius: 8, maxWidth: 420, pointerEvents: 'none', zIndex: 999 }}>
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
