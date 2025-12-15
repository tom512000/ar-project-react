import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

interface QRScannerProps {
	isOpen: boolean;
	onClose: () => void;
	onScan: (result: string) => void;
	onPauseAR: () => Promise<void>;
	onResumeAR: () => Promise<void>;
}

export default function QRScanner({ isOpen, onClose, onScan, onPauseAR, onResumeAR }: QRScannerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const scanIntervalRef = useRef<number | null>(null);
	const [error, setError] = useState<string>('');
	const [lastScanTime, setLastScanTime] = useState<number>(0);

	const stopScanning = async () => {
		if (scanIntervalRef.current) {
			clearInterval(scanIntervalRef.current);
			scanIntervalRef.current = null;
		}

		if (streamRef.current) {
			streamRef.current.getTracks().forEach(track => track.stop());
			streamRef.current = null;
		}

		setIsScanning(false);
		setError('');

		// Redémarrer l'AR
		await onResumeAR();
	};

	const startScanning = async () => {
		if (isScanning) return;

		try {
			setError('');

			// ARRÊTER l'AR pour libérer la caméra
			await onPauseAR();

			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 1280 },
					height: { ideal: 720 }
				}
			});

			streamRef.current = stream;

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			setIsScanning(true);

			let frameCount = 0;

			const scanFrame = () => {
				if (!videoRef.current || !canvasRef.current) return;

				const video = videoRef.current;
				const canvas = canvasRef.current;
				const ctx = canvas.getContext('2d');

				if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

				frameCount++;

				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				ctx.drawImage(video, 0, 0);

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

				const code = jsQR(imageData.data, imageData.width, imageData.height, {
					inversionAttempts: 'attemptBoth',
				});

				if (code) {
					const now = Date.now();
					if (now - lastScanTime > 2000) {
						setLastScanTime(now);
						onScan(code.data);
						stopScanning();
						onClose();
					}
				}
			};

			scanIntervalRef.current = window.setInterval(scanFrame, 200);

		} catch (err: any) {
			setError(`Erreur: ${err.message}`);
			setIsScanning(false);
			await onResumeAR();
		}
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
	}, [isOpen]); // Seulement isOpen en dépendance pour éviter la boucle

	return (
		<>
			{!isOpen ? null : (
				<div className="fixed inset-0 z-[9999] bg-black">
					{/* Vidéo en plein écran */}
					<video
						ref={videoRef}
						className="absolute inset-0 w-full h-full object-cover"
						playsInline
						autoPlay
						muted
					/>

					{/* Canvas caché pour la détection */}
					<canvas ref={canvasRef} className="hidden" />

					<div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto z-10">
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

					<div className="absolute inset-0 flex items-center justify-center z-10">
						{!isScanning && !error && (
							<div className="text-center p-6 bg-black bg-opacity-80 text-white rounded-lg pointer-events-none">
								<div className="text-4xl mb-2">⏸️</div>
								<div className="text-lg">Pause AR...</div>
							</div>
						)}

						{isScanning && !error && (
							<div className="relative pointer-events-none" style={{ width: '280px', height: '280px' }}>
								<div className="absolute inset-0 border-4 border-[#CBB69B] rounded-xl shadow-2xl animate-pulse">
									<div className="absolute -top-1 -left-1 w-12 h-12 border-t-8 border-l-8 border-white rounded-tl-xl"></div>
									<div className="absolute -top-1 -right-1 w-12 h-12 border-t-8 border-r-8 border-white rounded-tr-xl"></div>
									<div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-8 border-l-8 border-white rounded-bl-xl"></div>
									<div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-8 border-r-8 border-white rounded-br-xl"></div>
								</div>
							</div>
						)}

						{error && (
							<div className="text-center p-6 bg-red-900 bg-opacity-90 text-white rounded-lg pointer-events-auto">
								<div className="text-2xl mb-2">⚠️</div>
								<div className="text-lg font-semibold mb-2">Erreur</div>
								<div className="text-sm mb-4">{error}</div>
								<Button onClick={onClose} className="bg-white text-red-900 font-semibold">
									Fermer
								</Button>
							</div>
						)}
					</div>

					{isScanning && !error && (
						<div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none z-10">
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
