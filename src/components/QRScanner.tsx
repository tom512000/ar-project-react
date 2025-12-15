import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/library';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import * as THREE from 'three';

interface QRScannerProps {
	isOpen: boolean;
	onClose: () => void;
	onScan: (result: string) => void;
	renderer?: THREE.WebGLRenderer | null;
}

export default function QRScanner({ isOpen, onClose, onScan, renderer }: QRScannerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isScanning, setIsScanning] = useState(false);
	const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
	const scanIntervalRef = useRef<number | null>(null);
	const [error, setError] = useState<string>('');
	const [lastScanTime, setLastScanTime] = useState<number>(0);

	const stopScanning = () => {
		// Arrêter l'intervalle de scan
		if (scanIntervalRef.current) {
			clearInterval(scanIntervalRef.current);
			scanIntervalRef.current = null;
		}

		// Arrêter le code reader
		if (codeReaderRef.current) {
			codeReaderRef.current.reset();
			codeReaderRef.current = null;
		}

		setIsScanning(false);
		setError('');
	};

	useEffect(() => {
		if (!isOpen) {
			stopScanning();
			return;
		}

		startScanning();

		return () => {
			stopScanning();
		};
	}, [isOpen]);

	const startScanning = async () => {
		if (isScanning) return;

		try {
			setError('');

			// Vérifier que le renderer existe
			if (!renderer) {
				console.error('Renderer non disponible');
				setError('Session AR non active. Démarrez d\'abord la session AR.');
				return;
			}

			console.log('Scanner QR démarré');
			setIsScanning(true);

			const codeReader = new BrowserQRCodeReader();
			codeReaderRef.current = codeReader;

			// Log pour débugger
			let frameCount = 0;

			// Fonction pour capturer et analyser une frame du canvas AR
			const scanFrame = async () => {
				if (!renderer || !canvasRef.current) return;

				frameCount++;
				if (frameCount % 10 === 0) {
					console.log(`Scan frame #${frameCount}, Canvas: ${renderer.domElement.width}x${renderer.domElement.height}`);
				}

				try {
					const arCanvas = renderer.domElement;
					const ctx = canvasRef.current.getContext('2d');

					if (!ctx || !arCanvas.width || !arCanvas.height) return;

					// Copier le canvas AR pour analyse
					canvasRef.current.width = arCanvas.width;
					canvasRef.current.height = arCanvas.height;
					ctx.drawImage(arCanvas, 0, 0);

					// Convertir en data URL pour ZXing
					const dataUrl = canvasRef.current.toDataURL('image/png');

					// Analyser l'image avec ZXing
					const result = await codeReader.decodeFromImageUrl(dataUrl);

					if (result) {
						const scannedText = result.getText();
						const now = Date.now();

						// Éviter les scans en double (délai de 2 secondes)
						if (now - lastScanTime > 2000) {
							console.log('QR Code détecté:', scannedText);
							setLastScanTime(now);
							onScan(scannedText);
							stopScanning();
							onClose();
						}
					}
				} catch (err: any) {
					// NotFoundException est normal quand il n'y a pas de QR code
					if (err.name !== 'NotFoundException') {
						console.error('Erreur scan frame:', err);
					}
				}
			};

			// Scanner toutes les 500ms pour éviter de surcharger
			scanIntervalRef.current = window.setInterval(scanFrame, 500);

		} catch (err: any) {
			console.error('Erreur démarrage scanner:', err);
			setError('Impossible d\'initialiser le scanner QR');
			setIsScanning(false);
		}
	};

	return (
		<>
			{!isOpen ? null : (
				<div className="fixed inset-0 z-[9999] pointer-events-none">
					{/* Canvas caché pour l'analyse */}
					<canvas ref={canvasRef} className="hidden" />

					{/* Header */}
					<div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto">
						<div className="flex items-center justify-between bg-black bg-opacity-90 text-white px-4 py-3 rounded-lg shadow-lg max-w-md mx-auto">
							<span className="font-museum text-lg">📷 Scanner QR Code</span>
							<Button
								type="text"
								icon={<CloseOutlined className="text-white" />}
								onClick={onClose}
								className="text-white hover:bg-white hover:bg-opacity-20"
							/>
						</div>
					</div>

					{/* Zone de scan avec cadre de visée */}
					<div className="absolute inset-0 flex items-center justify-center">
						{!isScanning && !error && (
							<div className="text-center p-6 bg-black bg-opacity-80 text-white rounded-lg pointer-events-none">
								<div className="text-4xl mb-2">🔍</div>
								<div className="text-lg">Initialisation...</div>
							</div>
						)}

						{/* Cadre de visée quand le scan est actif */}
						{isScanning && !error && (
							<>
								{/* Zone de scan transparente au centre */}
								<div className="relative pointer-events-none" style={{ width: '280px', height: '280px' }}>
									{/* Cadre de scan */}
									<div className="absolute inset-0 border-4 border-[#CBB69B] rounded-xl shadow-2xl animate-pulse">
										<div className="absolute -top-1 -left-1 w-12 h-12 border-t-8 border-l-8 border-white rounded-tl-xl"></div>
										<div className="absolute -top-1 -right-1 w-12 h-12 border-t-8 border-r-8 border-white rounded-tr-xl"></div>
										<div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-8 border-l-8 border-white rounded-bl-xl"></div>
										<div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-8 border-r-8 border-white rounded-br-xl"></div>
									</div>
								</div>
							</>
						)}

						{error && (
							<div className="text-center p-6 bg-red-900 bg-opacity-90 text-white rounded-lg pointer-events-auto">
								<div className="text-2xl mb-2">⚠️</div>
								<div className="text-lg font-semibold mb-2">Erreur</div>
								<div className="text-sm mb-4">{error}</div>
								<Button onClick={startScanning} className="bg-white text-red-900 font-semibold">
									Réessayer
								</Button>
							</div>
						)}
					</div>

					{/* Texte instructions en bas */}
					{isScanning && !error && (
						<div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
							<div className="bg-black bg-opacity-80 text-white px-6 py-3 rounded-lg inline-block shadow-lg">
								<div className="text-base font-semibold font-museum">📷 Scan actif</div>
								<div className="text-sm opacity-90 font-museum">Placez le QR code dans le cadre</div>
							</div>
						</div>
					)}
				</div>
			)}
		</>
	);
}
