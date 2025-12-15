import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { Modal, Card, Row, Col, Button, Tag } from "antd";
import {
	ArrowRightOutlined,
	CheckCircleOutlined,
	CloseCircleOutlined,
	ExclamationCircleOutlined,
	QrcodeOutlined,
	QuestionCircleOutlined,
	ReloadOutlined,
	SyncOutlined,
} from '@ant-design/icons';
import LogoImage from "/public/images/logo.png";

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

import QRScanner from './components/QRScanner';

// Modèles disponibles
const AVAILABLE_MODELS = [
	{ id: 'nefertitis', name: 'Néfertiti', path: '/models/nefertitis/scene.gltf', scale: 1 },
	{ id: 'cat', name: 'Chat', path: '/models/cat/scene.gltf', scale: 0.5 },
	{ id: 'scarab', name: 'Scarabée', path: '/models/scarab/scene.gltf', scale: 0.01 },
	{ id: 'tutankhamun', name: 'Toutankhamon', path: '/models/tutankhamun/scene.gltf', scale: 0.25 },
];

// Composant de prévisualisation 3D
function ModelPreview({ modelPath }: { modelPath: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (!canvasRef.current) return;

		const canvas = canvasRef.current;
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
		camera.position.set(0, 0, 3);

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
		renderer.setSize(200, 200);
		renderer.setClearColor(0x000000, 0);

		// Lumière
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(1, 2, 1);
		scene.add(directionalLight);

		// Charger le modèle
		const loader = new GLTFLoader();
		let model: THREE.Group | null = null;

		loader.load(
			modelPath,
			(gltf) => {
				model = gltf.scene;

				// Calculer la taille et centrer
				const box = new THREE.Box3().setFromObject(model);
				const size = box.getSize(new THREE.Vector3());
				const center = box.getCenter(new THREE.Vector3());

				// Normaliser la taille
				const maxDim = Math.max(size.x, size.y, size.z);
				const scale = 2 / maxDim;
				model.scale.setScalar(scale);

				// Centrer
				model.position.sub(center.multiplyScalar(scale));

				scene.add(model);
			},
			undefined,
			(error) => console.error('Erreur chargement preview:', error)
		);

		// Animation
		let animationId: number;
		function animate() {
			animationId = requestAnimationFrame(animate);
			if (model) {
				model.rotation.y += 0.01;
			}
			renderer.render(scene, camera);
		}
		animate();

		return () => {
			cancelAnimationFrame(animationId);
			renderer.dispose();
			if (model) {
				scene.remove(model);
			}
		};
	}, [modelPath]);

	return <canvas ref={canvasRef} width={200} height={200} />;
}

export default function App() {
	const mountRef = useRef(null);
	const rendererRef: any = useRef(null);
	const cameraRef: any = useRef(null);
	const sceneRef: any = useRef(null);
	const reticleRef: any = useRef(null);
	const xrSessionRef: any = useRef(null);
	const hitTestSourceRef: any = useRef(null);
	const placedObjectsRef: any = useRef([]);
	const xrRefSpaceRef: any = useRef(null);
	const lightProbeRef: any = useRef(null);
	const directionalLightRef: any = useRef(null);
	const trackedImagesRef: any = useRef(new Map());
	const gltfLoaderRef: any = useRef(null);
	const blockPlacementRef: any = useRef(false);
	const defaultModelRef: any = useRef(AVAILABLE_MODELS[0]);
	const statsRef: any = useRef(null);
	const qrScannerActiveRef: any = useRef(false);
	const [isArStarted, setIsArStarted] = useState(false);

	// Gestion des interactions tactiles
	const touchStateRef: any = useRef({
		isTouching: false,
		touchStart: null,
		lastTouches: [],
		selectedObject: null,
		lastDistance: 0,
		lastAngle: 0
	});

	const [status, setStatus] = useState("idle");
	const [helpOpen, setHelpOpen] = useState(false);
	const [isARSupported, setIsARSupported] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [isSelectingDefault, setIsSelectingDefault] = useState(false);
	const [defaultModel, setDefaultModel] = useState(AVAILABLE_MODELS[0]);

	// QR scanner state
	const [qrScannerOpen, setQrScannerOpen] = useState(false);
	const [qrResult, setQrResult] = useState<string | null>(null);
	const [qrContentModalOpen, setQrContentModalOpen] = useState(false);

	// Fonctions pour gérer la pause/reprise AR
	const pauseAR = async () => {
		const session = xrSessionRef.current;
		if (session) {
			await session.end();
			console.log('Session AR arrêtée pour QR scan');
		}
	};

	const resumeAR = async () => {
		if (rendererRef.current && navigator.xr) {
			try {
				const sessionInit: any = {
					requiredFeatures: ["local-floor"],
					optionalFeatures: ["local", "viewer", "hit-test", "dom-overlay", "light-estimation"],
					domOverlay: { root: document.body }
				};

				const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
				await rendererRef.current.xr.setSession(session);
				console.log('Session AR redémarrée');
			} catch (err) {
				console.error('Erreur redémarrage AR:', err);
			}
		}
	};

	// Synchroniser la ref avec le state
	useEffect(() => {
		defaultModelRef.current = defaultModel;
	}, [defaultModel]);

	function handleQrScan(result: string) {
		console.log('QR Code scanné:', result);
		setQrResult(result);
		setQrContentModalOpen(true);
	}

	// Helper to create a simple 3D object (a museum piece placeholder)
	function createMuseumObject(modelPath: string, modelScale: number, callback: (group: THREE.Group) => void) {
		const group = new THREE.Group();
		group.userData.draggable = true;

		// Charger le modèle GLTF
		if (gltfLoaderRef.current) {
			gltfLoaderRef.current.load(
				modelPath,
				(gltf: any) => {
					const model = gltf.scene;

					// Ajuster la taille du modèle AVANT de calculer la bounding box
					model.scale.set(modelScale, modelScale, modelScale);
					model.updateMatrixWorld(true);

					// Calculer la bounding box après le scaling
					const box = new THREE.Box3().setFromObject(model);
					const center = box.getCenter(new THREE.Vector3());
					// const size = box.getSize(new THREE.Vector3());

					// Repositionner le modèle pour que sa base soit à Y=0
					// et qu'il soit centré en X et Z
					model.position.set(
						-center.x,
						-box.min.y,  // Aligner la base du modèle à Y=0
						-center.z
					);

					// Ajouter au groupe
					group.add(model);
					callback(group);
				},
				undefined,
				(error: any) => {
					console.error('Erreur chargement GLTF:', error);
					// Fallback: créer un objet simple en cas d'erreur
					const fallbackGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
					const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
					const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
					group.add(fallback);
					callback(group);
				}
			);
		}

		return group;
	}

	// Créer un objet contextuel pour l'image tracking
	function createContextualContent() {
		const group = new THREE.Group();

		// Panneau d'information
		const panelGeo = new THREE.PlaneGeometry(0.3, 0.2);
		const panelMat = new THREE.MeshStandardMaterial({
			color: 0x00aaff,
			opacity: 0.9,
			transparent: true
		});
		const panel = new THREE.Mesh(panelGeo, panelMat);
		group.add(panel);

		// Bordure
		const edges = new THREE.EdgesGeometry(panelGeo);
		const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
		const border = new THREE.LineSegments(edges, lineMat);
		group.add(border);

		group.scale.set(1, 1, 1);
		return group;
	}

	useEffect(() => {
		const mount: any = mountRef.current;
		if (!mount) return;

		// Initialiser le GLTF Loader
		gltfLoaderRef.current = new GLTFLoader();

		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true  // IMPORTANT pour capturer le canvas
		});
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
		directionalLightRef.current = dir;

		// Reticle for placement (a ring that sits on detected surfaces)
		const ringGeo = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
		const ringMat = new THREE.MeshBasicMaterial({ color: 0xCBB69B });
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
		function render(_timestamp: number, frame: any) {
			// Mettre à jour les stats
			if (statsRef.current) {
				statsRef.current.begin();
			}

			// simple pulse effect on reticle when visible
			if (reticle.visible) {
				const t = clock.getElapsedTime();
				const scale = 1 + 0.05 * Math.sin(t * 3);
				reticle.scale.set(scale, scale, scale);
			}

			// Hit-test pour positionner le reticle
			if (frame && xrSessionRef.current) {
				const session = xrSessionRef.current;
				const referenceSpace = xrRefSpaceRef.current;

				// Hit-test pour la détection de surface (cacher si scanner QR actif)
				if (hitTestSourceRef.current && referenceSpace && !qrScannerActiveRef.current) {
					const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);
					if (hitTestResults.length > 0) {
						const hit = hitTestResults[0];
						const pose = hit.getPose(referenceSpace);
						if (pose) {
							reticle.visible = true;
							reticle.matrix.fromArray(pose.transform.matrix);
						}
					} else {
						reticle.visible = false;
					}
				} else if (qrScannerActiveRef.current) {
					// Forcer le reticle à être invisible pendant le scan QR
					reticle.visible = false;
				}

				// Light estimation
				const lightEstimate = frame.getLightEstimate && frame.getLightEstimate(lightProbeRef.current);
				if (lightEstimate) {
					// Adapter l'éclairage directionnel
					if (lightEstimate.primaryLightDirection && lightEstimate.primaryLightIntensity) {
						const dir = directionalLightRef.current;
						if (dir) {
							dir.position.set(
								lightEstimate.primaryLightDirection.x,
								lightEstimate.primaryLightDirection.y,
								lightEstimate.primaryLightDirection.z
							);
							dir.intensity = Math.max(0.3, lightEstimate.primaryLightIntensity.x * 2);
						}
					}
				}

				// Image tracking
				if (session.trackedImageScores) {
					const results = frame.getImageTrackingResults && frame.getImageTrackingResults();
					if (results) {
						results.forEach((result: any) => {
							const imageIndex = result.index;
							const trackingState = result.trackingState;

							if (trackingState === 'tracked') {
								const pose = frame.getPose(result.imageSpace, referenceSpace);
								if (pose) {
									let trackedObject = trackedImagesRef.current.get(imageIndex);

									if (!trackedObject) {
										// Créer un nouveau contenu contextuel
										trackedObject = createContextualContent();
										trackedObject.userData.isTrackedImage = true;
										scene.add(trackedObject);
										trackedImagesRef.current.set(imageIndex, trackedObject);
										console.log(`Image ${imageIndex} détectée - contenu créé`);
									}

									// Mettre à jour la position
									trackedObject.visible = true;
									trackedObject.matrix.fromArray(pose.transform.matrix);
									trackedObject.matrixAutoUpdate = false;
								}
							} else {
								// Cacher l'objet si le tracking est perdu
								const trackedObject = trackedImagesRef.current.get(imageIndex);
								if (trackedObject) {
									trackedObject.visible = false;
								}
							}
						});
					}
				}
			}

			renderer.render(scene, camera);

			// Terminer la mesure des stats
			if (statsRef.current) {
				statsRef.current.end();
			}
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

					// Test des types de référence d'espace supportés
					navigator.xr?.requestSession("immersive-ar").then(session => {
						["local", "local-floor", "viewer"].forEach(type => {
							session.requestReferenceSpace(type as XRReferenceSpaceType)
								.then(() => console.log("supported:", type))
								.catch(() => console.log("NOT supported:", type));
						});
						// Fermer la session de test
						session.end();
					}).catch(err => {
						console.error("Erreur lors du test des reference spaces:", err);
					});
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
		async function onSessionStart(session: any) {
			console.log('AR Session started:', session);
			xrSessionRef.current = session;
			setStatus("session-started");

			// Initialiser Stats avec style personnalisé
			const stats = new Stats();
			stats.showPanel(0); // 0: fps, 1: ms, 2: mb
			stats.dom.style.position = 'absolute';
			stats.dom.style.bottom = '10px';
			stats.dom.style.left = '10px';
			stats.dom.style.top = 'auto';
			stats.dom.style.zIndex = '9999';
			stats.dom.style.opacity = '0.9';
			stats.dom.style.borderRadius = '8px';
			stats.dom.style.overflow = 'hidden';
			stats.dom.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
			document.body.appendChild(stats.dom);
			statsRef.current = stats;

			// Obtenir la référence d'espace
			try {
				const refSpace = await session.requestReferenceSpace("local-floor").catch(() =>
					session.requestReferenceSpace("local")
				);
				xrRefSpaceRef.current = refSpace;

				// Initialiser hit-test source
				const viewerSpace = await session.requestReferenceSpace("viewer");
				const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
				hitTestSourceRef.current = hitTestSource;
				console.log("Hit-test source initialisé");

				// Initialiser light probe si disponible
				if (session.requestLightProbe) {
					try {
						const lightProbe = await session.requestLightProbe();
						lightProbeRef.current = lightProbe;
						console.log("Light probe initialisé");
					} catch (err) {
						console.log("Light probe non supporté");
					}
				}

			} catch (err) {
				console.error("Erreur lors de l'initialisation:", err);
			}

			// Gestion des événements tactiles pour le placement et la manipulation
			const canvas = renderer.domElement;

			function onSelect() {
				// Ne pas placer d'objet si le placement est bloqué
				if (blockPlacementRef.current) {
					console.log("Placement bloqué (interaction UI)");
					blockPlacementRef.current = false;
					return;
				}

				if (!reticle.visible) return;

				// Placer le modèle par défaut
				const currentModel = defaultModelRef.current;
				createPlacedObject(currentModel.path, currentModel.scale);
			}

			function onTouchStart(event: TouchEvent) {
				// Vérifier si le touch est sur un élément UI
				const target = event.target as HTMLElement;
				if (target && (target.tagName === 'BUTTON' || target.closest('button'))) {
					blockPlacementRef.current = true;
					console.log("UI touché - placement bloqué");
					return;
				}

				const touches = Array.from(event.touches);
				touchStateRef.current.lastTouches = touches;
				touchStateRef.current.isTouching = true;

				if (touches.length === 1) {
					// Sélection d'objet
					const touch = touches[0];
					const mouse = new THREE.Vector2(
						(touch.clientX / window.innerWidth) * 2 - 1,
						-(touch.clientY / window.innerHeight) * 2 + 1
					);

					const raycaster = new THREE.Raycaster();
					raycaster.setFromCamera(mouse, camera);

					const draggableObjects = placedObjectsRef.current.filter((obj: any) => obj.userData.draggable);
					const intersects = raycaster.intersectObjects(draggableObjects, true);

					if (intersects.length > 0) {
						let selected = intersects[0].object;
						while (selected.parent && !selected.userData.draggable) {
							selected = selected.parent;
						}
						if (selected.userData.draggable) {
							touchStateRef.current.selectedObject = selected;
							touchStateRef.current.touchStart = { x: touch.clientX, y: touch.clientY };
							event.preventDefault();
						}
					}
				} else if (touches.length === 2) {
					// Initialiser pinch et rotation
					const dx = touches[1].clientX - touches[0].clientX;
					const dy = touches[1].clientY - touches[0].clientY;
					touchStateRef.current.lastDistance = Math.sqrt(dx * dx + dy * dy);
					touchStateRef.current.lastAngle = Math.atan2(dy, dx);
					event.preventDefault();
				}
			}

			function onTouchMove(event: TouchEvent) {
				if (!touchStateRef.current.isTouching) return;
				const touches = Array.from(event.touches);

				if (touches.length === 1 && touchStateRef.current.selectedObject && touchStateRef.current.touchStart) {
					// Drag
					const touch = touches[0];
					const deltaX = (touch.clientX - touchStateRef.current.touchStart.x) * 0.001;
					const deltaY = (touch.clientY - touchStateRef.current.touchStart.y) * 0.001;

					touchStateRef.current.selectedObject.position.x += deltaX;
					touchStateRef.current.selectedObject.position.z += deltaY;

					touchStateRef.current.touchStart = { x: touch.clientX, y: touch.clientY };
					event.preventDefault();
				} else if (touches.length === 2 && touchStateRef.current.selectedObject) {
					// Pinch to scale
					const dx = touches[1].clientX - touches[0].clientX;
					const dy = touches[1].clientY - touches[0].clientY;
					const distance = Math.sqrt(dx * dx + dy * dy);

					if (touchStateRef.current.lastDistance > 0) {
						const scaleFactor = distance / touchStateRef.current.lastDistance;
						const newScale = touchStateRef.current.selectedObject.scale.x * scaleFactor;
						const clampedScale = Math.max(0.5, Math.min(3, newScale));
						touchStateRef.current.selectedObject.scale.setScalar(clampedScale);
					}
					touchStateRef.current.lastDistance = distance;

					// Rotation avec deux doigts
					const angle = Math.atan2(dy, dx);
					if (touchStateRef.current.lastAngle !== 0) {
						const deltaAngle = angle - touchStateRef.current.lastAngle;
						touchStateRef.current.selectedObject.rotation.y += deltaAngle;
					}
					touchStateRef.current.lastAngle = angle;

					event.preventDefault();
				}

				touchStateRef.current.lastTouches = touches;
			}

			function onTouchEnd(event: TouchEvent) {
				if (event.touches.length === 0) {
					touchStateRef.current.isTouching = false;
					touchStateRef.current.selectedObject = null;
					touchStateRef.current.touchStart = null;
					touchStateRef.current.lastDistance = 0;
					touchStateRef.current.lastAngle = 0;
				}
				touchStateRef.current.lastTouches = Array.from(event.touches);
			}

			session.addEventListener("select", onSelect);
			canvas.addEventListener("touchstart", onTouchStart, { passive: false });
			canvas.addEventListener("touchmove", onTouchMove, { passive: false });
			canvas.addEventListener("touchend", onTouchEnd);
			canvas.addEventListener("touchcancel", onTouchEnd);

			session.addEventListener("end", () => {
				xrSessionRef.current = null;
				hitTestSourceRef.current = null;
				lightProbeRef.current = null;
				xrRefSpaceRef.current = null;
				setStatus("session-ended");
				reticle.visible = false;

				// Nettoyer Stats
				if (statsRef.current && statsRef.current.dom.parentNode) {
					statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
					statsRef.current = null;
				}

				// Nettoyer les événements
				canvas.removeEventListener("touchstart", onTouchStart);
				canvas.removeEventListener("touchmove", onTouchMove);
				canvas.removeEventListener("touchend", onTouchEnd);
				canvas.removeEventListener("touchcancel", onTouchEnd);
			});
		}

		// Listen to XR session events
		renderer.xr.addEventListener("sessionstart", () => onSessionStart(renderer.xr.getSession()));

		// cleanup on unmount
		return () => {
			window.removeEventListener("resize", onResize);
			renderer.setAnimationLoop(null);
			if (statsRef.current && statsRef.current.dom.parentNode) {
				statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
			}
			if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
			renderer.dispose();
		};
	}, []);

	// Démarrer la session AR
	async function startAR() {
		if (!rendererRef.current || !navigator.xr) return;
		setIsArStarted(true);

		try {
			console.log('Démarrage de la session AR...');

			// Créer une image de référence pour le tracking (exemple avec une URL d'image)
			// Note: En production, remplacer par une vraie image de référence
			const trackedImages: any[] = [];

			// Vous pouvez ajouter des images de référence ici
			// Exemple: créer un bitmap à partir d'une URL
			const img = await fetch('image.jpg').then(r => r.blob());
			const bitmap = await createImageBitmap(img);
			trackedImages.push({ image: bitmap, widthInMeters: 0.2 });

			const sessionInit: any = {
				requiredFeatures: ["local-floor"],
				optionalFeatures: [
					"local",
					"viewer",
					"hit-test",
					"dom-overlay",
					"light-estimation",
				],
				domOverlay: { root: document.body }
			};

			// Ajouter image-tracking si des images sont disponibles
			if (trackedImages.length > 0) {
				sessionInit.optionalFeatures.push("image-tracking");
				sessionInit.trackedImages = trackedImages;
			}

			const session = await navigator.xr.requestSession('immersive-ar', sessionInit);

			await rendererRef.current.xr.setSession(session);

			// Force une référence compatible
			let refSpace = null;
			try {
				refSpace = await session.requestReferenceSpace("local-floor");
				console.log("[WebXR] ReferenceSpace = local-floor");
			} catch (err) {
				console.warn("[WebXR] local-floor non supporté → fallback local");
				refSpace = await session.requestReferenceSpace("local");
				console.log("[WebXR] ReferenceSpace = local");
			}

			rendererRef.current.xr.setReferenceSpace(refSpace);

			setStatus("ar-running");

		} catch (error: any) {
			console.error(error);
			setStatus(`error: ${error.message}`);
		}
	}

	// Placer un objet à la position du reticle
	function createPlacedObject(modelPath: string, modelScale: number) {
		const reticle = reticleRef.current;
		const scene = sceneRef.current;

		if (!reticle || !scene || !reticle.visible) return;

		// Placer un objet au niveau du reticle
		createMuseumObject(modelPath, modelScale, (newObject) => {
			// Extraire seulement la position du reticle (pas toute la matrice)
			const reticlePosition = new THREE.Vector3();
			reticlePosition.setFromMatrixPosition(reticle.matrix);

			// Placer l'objet à cette position exacte
			newObject.position.copy(reticlePosition);
			newObject.matrixAutoUpdate = true;

			scene.add(newObject);
			placedObjectsRef.current.push(newObject);
			console.log("Objet placé:", placedObjectsRef.current.length);
		});
	}

	// Gérer la sélection d'un modèle depuis le modal
	function handleModelSelection(model: typeof AVAILABLE_MODELS[0]) {
		if (isSelectingDefault) {
			// Définir comme modèle par défaut
			setDefaultModel(model);
			setIsSelectingDefault(false);
		} else {
			// Placer le modèle immédiatement
			createPlacedObject(model.path, model.scale);
		}

		// Fermer le modal et bloquer temporairement le placement
		setModalOpen(false);
		blockPlacementRef.current = true;
		setTimeout(() => {
			blockPlacementRef.current = false;
		}, 300);
	}

	// Reset scene: remove placed objects & markers
	function handleReset(event?: any) {
		// Empêcher la propagation pour éviter de déclencher un placement
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}

		const scene = sceneRef.current;
		if (!scene) return;

		// Supprimer les objets placés
		placedObjectsRef.current.forEach((obj: any) => {
			scene.remove(obj);
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
				else obj.material.dispose();
			}
		});
		placedObjectsRef.current = [];

		// Supprimer les objets trackés
		trackedImagesRef.current.forEach((obj: any) => {
			scene.remove(obj);
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
				else obj.material.dispose();
			}
		});
		trackedImagesRef.current.clear();

		// Réinitialiser l'état tactile
		touchStateRef.current = {
			isTouching: false,
			touchStart: null,
			lastTouches: [],
			selectedObject: null,
			lastDistance: 0,
			lastAngle: 0
		};

		setStatus('reset');
		console.log("Scène réinitialisée");
	}

	return (
		<div className={`w-screen h-screen overflow-hidden relative ${!isArStarted && !qrScannerOpen ? 'bg-[#f3e7cf]' : ''}`}>
			<div ref={mountRef} className="w-full h-full" />

			<div className="absolute top-0 left-0 w-full h-14 p-1.5 flex justify-between items-center border border-gray-300 bg-white">
				<div className="flex items-center gap-2 font-museum">
					<img src={LogoImage} alt="AR Museum Logo" className="h-10 object-contain" />
					{status == 'idle' ? (
						<Tag color="processing" icon={<SyncOutlined />} variant='filled'>
							Initialisation...
						</Tag>
					) : status == 'ready' ? (
						<Tag color="success" icon={<CheckCircleOutlined />} variant='filled'>
							Prêt
						</Tag>
					) : status == 'error' ? (
						<Tag color="error" icon={<CloseCircleOutlined />} variant='filled'>
							Erreur
						</Tag>
					) : status == 'ar-running' ? (
						<Tag color="success" icon={<CheckCircleOutlined />} variant='filled'>
							Actif
						</Tag>
					) : status == 'reset' ? (
						<Tag color="default" icon={<ReloadOutlined />} variant='filled'>
							Réinitialisé
						</Tag>
					) : status == 'session-ended' ? (
						<Tag color="warning" icon={<ExclamationCircleOutlined />} variant='filled'>
							Session terminée
						</Tag>
					) : (
						<Tag color="default" variant='filled'>
							{status}
						</Tag>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="text"
						icon={<QuestionCircleOutlined style={{ fontSize: 20 }} />}
						onClick={(e) => { e.stopPropagation(); blockPlacementRef.current = true; setHelpOpen(h => !h); }}
						onPointerDown={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						onTouchStart={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						className="min-w-[44px] h-[44px] p-0 bg-[#CBB69B] text-white rounded"
					/>
				</div>
			</div>

			<div className="absolute left-0 top-[55px] w-full flex justify-center items-center p-2 z-[1000] pointer-events-auto">
				<div className="flex gap-2 bg-white bg-opacity-70 rounded p-2 border border-gray-300">
					<Button
						disabled={!isArStarted}
						onClick={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
							setIsSelectingDefault(true); setModalOpen(true);
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						onTouchStart={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						className="bg-transparent border border-[#CBB69B] rounded px-5 py-2 font-museum"
					>
						Modèle actuel : {defaultModel.name}
					</Button>
					<Button
						disabled={!isArStarted}
						icon={<QrcodeOutlined style={{ fontSize: 16 }} />}
						onClick={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
							qrScannerActiveRef.current = true;
							setQrScannerOpen(true);
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						onTouchStart={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						className="p-0 bg-[#CBB69B] text-white rounded"
					/>
					<Button
						icon={<ReloadOutlined style={{ fontSize: 16 }} />}
						disabled={!isArStarted}
						onClick={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
							handleReset();
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						onTouchStart={(e) => {
							e.stopPropagation();
							blockPlacementRef.current = true;
						}}
						className="p-0 bg-[#CBB69B] text-white rounded"
					/>
				</div>
			</div>

			{/* Bouton START AR au centre */}
			{isARSupported && status === 'ready' && (
				<div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', zIndex: 1001 }}>
					<button
						onClick={startAR}
						className="bg-[#CBB69B] text-white px-6 py-3 rounded-lg text-lg font-semibold shadow-lg hover:bg-[#b99a7f] active:bg-[#a3866b] transition font-museum"
					>
						Entrer dans le musée
						<ArrowRightOutlined style={{ marginLeft: 8 }} />
					</button>
				</div>
			)}

			{!isARSupported && status !== 'idle' && (
				<div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 1001, background: 'rgba(255,0,0,0.7)', color: '#fff', padding: '12px 24px', borderRadius: 8 }} className="font-museum">
					AR non supporté sur cet appareil
				</div>
			)}

			{helpOpen && (
				<div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 120, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: 12, borderRadius: 8, minWidth: 320, pointerEvents: 'none', zIndex: 999 }} className="font-museum">
					<div style={{ fontWeight: 700 }}>Mode d'emploi rapide</div>
					<ul style={{ fontSize: 13 }}>
						<li>- Autorisez l'accès à la caméra.</li>
						<li>- Visez un sol/table pour détecter une surface (anneau visible).</li>
						<li>- Touchez pour placer l'objet; utilisez un doigt pour déplacer, deux pour agrandir/faire tourner.</li>
						<li>- Visez l'affiche/marqueur pour révéler un contenu contextuel basé sur l'image (si pris en charge).</li>
					</ul>
				</div>
			)}

			{/* Composant QR Scanner */}
			<QRScanner
				isOpen={qrScannerOpen}
				onClose={() => {
					setQrScannerOpen(false);
					qrScannerActiveRef.current = false;
					blockPlacementRef.current = true;
					setTimeout(() => {
						blockPlacementRef.current = false;
					}, 300);
				}}
				onScan={handleQrScan}
				onPauseAR={pauseAR}
				onResumeAR={resumeAR}
			/>

			{/* Modal pour afficher le contenu du QR code */}
			<Modal
				title={<span className="font-museum">Contenu QR Code</span>}
				open={qrContentModalOpen}
				onCancel={() => {
					setQrContentModalOpen(false);
					setQrResult(null);
				}}
				footer={null}
				width={800}
				className="museum-panel text-black rounded-lg"
			>
				{qrResult && (
					<div style={{ minHeight: 200 }}>
						{qrResult.startsWith('http') ? (
							<iframe src={qrResult} title="QR Content" style={{ width: '100%', height: '60vh', border: 'none' }} />
						) : (
							<div className="p-4 font-museum whitespace-pre-wrap">{qrResult}</div>
						)}
					</div>
				)}
			</Modal>

			<Modal
				title={
					<span className="font-museum">{isSelectingDefault ? "Choisir le modèle par défaut" : "Choisir un modèle"}</span>
				}
				open={modalOpen}
				className="museum-panel text-black rounded-lg"
				onCancel={() => {
					setModalOpen(false);
					setIsSelectingDefault(false);
					blockPlacementRef.current = true;
					setTimeout(() => {
						blockPlacementRef.current = false;
					}, 300);
				}}
				footer={null}
				width={800}
				style={{ top: 20 }}
			>
				<Row gutter={[16, 16]}>
					{AVAILABLE_MODELS.map((model) => (
						<Col key={model.id} xs={12} sm={12} md={6}>
							<Card
								hoverable
								onClick={() => handleModelSelection(model)}
								style={{
									textAlign: 'center',
									border: defaultModel.id === model.id && isSelectingDefault ? '2px solid #1890ff' : undefined
								}}
								cover={
									<div style={{
										height: 200,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: '#f0f0f0'
									}}>
										<ModelPreview modelPath={model.path} />
									</div>
								}
							>
								<Card.Meta title={<span className="font-museum">{model.name}</span>} />
							</Card>
						</Col>
					))}
				</Row>
			</Modal>
		</div >
	);
}
