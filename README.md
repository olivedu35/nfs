# Night Rush — mini NFS mobile

Course arcade 3D low-poly de nuit, jouable uniquement sur smartphone en paysage.
Vite + TypeScript strict + Three.js, sans aucun asset externe : géométrie, sons, icône et QR code sont générés en code.

## Lancer en local

```bash
npm install
npm run dev          # http://localhost:5173 (sur desktop : écran QR code)
```

Pour forcer le jeu dans un navigateur desktop (DevTools en mode appareil mobile), ajoutez `?play` à l'URL.

## Tester sur téléphone (réseau local)

```bash
npm run host         # = vite --host, affiche l'URL réseau (ex. http://192.168.1.20:5173)
```

Ouvrez cette URL sur le téléphone (même Wi-Fi), ou scannez le QR code affiché sur la version desktop.
Le gyroscope iOS et le service worker exigent HTTPS : testez-les sur le déploiement Vercel.

## Déployer

```bash
npm run build        # tsc strict + build Vite + service worker
vercel --prod        # ou : connecter le dépôt GitHub dans le dashboard Vercel
```

`vercel.json` déclare le framework Vite, la sortie `dist` et un cache long (`immutable`) pour les assets hashés.

## Contrôles

- **Boutons (par défaut)** : ◀ ▶ à gauche ; GAZ, FREIN/MARCHE ARRIÈRE et NITRO à droite. Multi-touch complet, on peut glisser d'une flèche à l'autre sans lever le doigt.
- **Gyroscope** (à activer dans le garage) : inclinez le téléphone comme un volant. Sur iOS, le bouton « GYROSCOPE » déclenche la demande d'autorisation. Une option « Inverser gyro » corrige le sens si besoin.
- **Drift** : FREIN + direction à haute vitesse → la voiture glisse et recharge la nitro.
- **Nitro** : se recharge en drift et en frôlant le trafic (« NEAR MISS »).
- **Poubelles** : disséminées sur les bas-côtés. Chacune rapporte 1 000 points, avec un combo jusqu'à ×5 si vous les enchaînez en moins de 2,5 s. Ces points servent de monnaie.
- **Boutique** (depuis le garage ou l'écran de fin) : 5 améliorations à 5 niveaux (MOTEUR, TURBO, PNEUS, NITRO, AIMANT À POUBELLES). Elles coûtent de 1 000 à 6 000 points, donc environ une poubelle par niveau au début : la progression est volontairement ridicule de facilité. 5 000 points sont offerts au départ. Les points d'une course sont versés au portefeuille même en cas de BUSTED ou d'abandon.
- **Police** : au-dessus d'environ 150 km/h, la jauge HEAT monte. Pleine, une voiture de police vous prend en chasse. Si elle vous immobilise pendant 3 s : BUSTED. Distancez-la de 260 m pendant 5 s pour la semer. Vous pouvez aussi la détruire : percutez-la 3 fois à 50 km/h ou plus. Vous gagnez alors 5 000 points, la nitro est remplie et la heat est remise à zéro.

## Architecture

```
src/
  main.ts              bootstrap, écrans (titre, garage, pause, résultats, desktop QR, portrait)
  config.ts            TOUT l'équilibrage : voitures, physique, nitro, IA, trafic, police, caméra
  game/Game.ts         boucle à pas fixe (120 Hz) découplée du rendu, états, collisions, classement
  game/Track.ts        spline Catmull-Rom, route/marquages/murets fusionnés, immeubles et lampadaires instanciés
  game/Car.ts          physique arcade du joueur (adhérence latérale, drift, murs)
  game/CarModel.ts     voitures en primitives fusionnées (2 à 3 draw calls par voiture)
  game/Rail.ts         véhicule « sur rail » (abscisse curviligne + file), base de l'IA/trafic/police
  game/AIDriver.ts     IA : vitesse conseillée par la courbure, file qui ondule, évitement, rubber banding
  game/Traffic.ts      trafic civil en InstancedMesh
  game/Police.ts       heat, poursuite (dépasse puis bloque), BUSTED / semée
  game/Camera.ts       caméra chase : lerp, shake, FOV dynamique
  game/Trails.ts       traînées lumineuses de la nitro
  game/Bins.ts         poubelles renversables + déchets (2 InstancedMesh, mini-physique balistique)
  input/TouchControls.ts, input/GyroControls.ts
  ui/Hud.ts            HUD en DOM, écrit seulement quand une valeur change
  ui/Minimap.ts        canvas 2D, tracé pré-rendu
  ui/qr.ts             encodeur QR maison (octets, correction M, v1-6) → SVG
  audio/Sound.ts       Web Audio : moteur (oscillateurs + 5 rapports), crash/nitro (bruit blanc), sirène
  storage/Save.ts      localStorage : meilleurs temps et réglages
```

## Choix techniques

- **IA, trafic et police sont cinématiques sur la spline** (abscisse s + décalage latéral) plutôt que simulés : c'est robuste (aucune sortie de piste), peu coûteux, et facile à équilibrer. Seul le joueur utilise la physique libre. Les collisions joueur ↔ véhicule utilisent des boîtes orientées approximées.
- **Vitesse conseillée de l'IA** : elle est précalculée à partir de la courbure (`v = √(a_lat / κ)`), avec une passe arrière pour anticiper le freinage.
- **Fenêtres des immeubles** : un petit shader procédural (grille + hash) sur un seul `InstancedMesh`, donc pas de texture et un seul draw call pour toute la ville.
- **Rendu** : DPR plafonné à 1,5, pas d'antialiasing ni d'ombres, brouillard à 280 m. Environ 31 draw calls et 35k triangles en course. Bundle d'environ 141 Ko gzip.
- **Pas de rendu interpolé** : la physique tourne à 120 Hz, soit deux pas par frame à 60 fps, ce qui suffit à garder un mouvement fluide.
- **Pause automatique** sur `visibilitychange` et lors du passage en portrait.
- **Fullscreen + verrouillage paysage** au premier tap quand le navigateur le permet (Android). L'iPhone ne propose pas l'API Fullscreen : il faut installer le jeu en PWA (Partager → Sur l'écran d'accueil) pour le plein écran.
- **Icône PWA en SVG** : le manifeste ne déclare que `icon.svg`. Chrome Android et iOS récents l'acceptent ; si un vieux lanceur exige du PNG, il faudra en générer un.
- **Hook de debug** : `?debug` expose `window.game` dans la console.
