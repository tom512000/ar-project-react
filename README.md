# AR Project
Ce projet React utilise Three.js et React Three Fiber pour afficher des modèles 3D en réalité augmentée.

## Installation
1. Clonez le dépôt :
	```bash
	git clone https://github.com/tom512000/ar-project-react.git
	```

2. Accédez au répertoire du projet :
	```bash
	cd ar-project-react
	```

3. Installez les dépendances :
	```bash
	npm install
	```

4. (Optionnel) Installer TailwindCSS et générer les fichiers de configuration si nécessaire :
	```bash
	npm install -D tailwindcss postcss autoprefixer
	npx tailwindcss init -p
	```


5. Construisez le projet :
	```bash
	npm run build
	```

5. Lancez le serveur de prévisualisation avec l'option `--host` pour permettre l'accès depuis d'autres appareils sur le même réseau :
	```bash
	npm run preview -- --host
	```

6. Téléchargez et installez ngrok depuis [ngrok.com](https://ngrok.com/), puis exécutez la commande suivante dans une nouvelle fenêtre de terminal :
	```bash
	ngrok.exe http 4173
	```

7. Utilisez l'URL fournie par ngrok pour accéder à l'application depuis votre appareil mobile.

## Utilisation
- Ouvrez l'application sur votre appareil mobile en utilisant l'URL fournie par ngrok.
- Autorisez l'accès à la caméra lorsque vous y êtes invité.
- Pointez la caméra vers une surface plane pour voir le modèle 3D en réalité augmentée.
- Interagissez avec le modèle 3D en utilisant les contrôles tactiles (zoom, rotation, déplacement).

## Modèles 3D
Les modèles 3D sont situés dans le répertoire `public/models`. Vous pouvez remplacer les fichiers `.gltf` par vos propres modèles pour personnaliser l'expérience AR.

## Technologies utilisées
- React
- Three.js
- React Three Fiber
- GLTFLoader
- Vite
- ngrok
