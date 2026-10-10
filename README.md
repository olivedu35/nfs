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

## Modes et circuits

- **Course** : choisissez l'un des 4 circuits et faites la course.
- **Championnat** : les 4 circuits s'enchaînent. Chaque manche rapporte 10, 6, 3 ou 1 point selon la place (BUSTED = dernier). Un classement général s'affiche après chaque manche, et la boutique reste accessible entre les manches. Le podium final verse une prime : 20 000 points pour le champion.
- **Circuits** : DOWNTOWN (équilibré, 3 tours), PORT (docks, longues lignes droites, 3 tours), CHINATOWN (court et serré, 4 tours), AUTOROUTE (grandes courbes rapides, 3 tours). Chacun a son ambiance (ciel, néons, couleur des fenêtres, hauteur des immeubles) et ses propres records.

## Contrôles

- **Boutons (par défaut)** : ◀ ▶ à gauche ; GAZ, FREIN/MARCHE ARRIÈRE et NITRO à droite. Multi-touch complet, on peut glisser d'une flèche à l'autre sans lever le doigt.
- **Gyroscope** (à activer dans le garage) : inclinez le téléphone comme un volant. Sur iOS, le bouton « GYROSCOPE » déclenche la demande d'autorisation. Une option « Inverser gyro » corrige le sens si besoin.
- **Drift** : FREIN + direction à haute vitesse → la voiture glisse et recharge la nitro.
- **Nitro** : se recharge en drift et en frôlant le trafic (« NEAR MISS »).
- **Poubelles** : disséminées sur les bas-côtés. Chacune rapporte 1 000 points, avec un combo jusqu'à ×5 si vous les enchaînez en moins de 2,5 s. Ces points servent de monnaie.
- **Boutique** (depuis le garage ou l'écran de fin) : 5 améliorations à 5 niveaux (MOTEUR, TURBO, PNEUS, NITRO, AIMANT À POUBELLES, qui attire vraiment les poubelles vers la voiture). Elles coûtent de 1 000 à 6 000 points, donc environ une poubelle par niveau au début : la progression est volontairement ridicule de facilité. 5 000 points sont offerts au départ. Les points d'une course sont versés au portefeuille même en cas de BUSTED ou d'abandon.
- **État de la voiture** (jauge DÉGÂTS) : chaque accrochage avec le trafic ou une IA remplit un segment (la police et les murs ne comptent pas, et un même véhicule ne compte qu'une fois par 1,5 s). Au 5ᵉ, la voiture est HS : elle réapparaît au même endroit, au milieu de la route, relancée et invulnérable 2 s, avec la jauge remise à 0. Un choc de face contre le trafic à 150 km/h ou plus provoque une réapparition immédiate. Réglages dans `DAMAGE` (`src/config.ts`).
- **Police** : au-dessus d'environ 150 km/h, la jauge HEAT monte. Pleine, une voiture de police vous prend en chasse. Si elle vous immobilise pendant 3 s : BUSTED. Distancez-la de 260 m pendant 5 s pour la semer. Vous pouvez aussi la détruire : percutez-la 3 fois à 50 km/h ou plus. Vous gagnez alors 5 000 points, la nitro est remplie et la heat est remise à zéro.

## Architecture

```
src/
  main.ts              bootstrap, écrans (titre, garage, pause, résultats, desktop QR, portrait)
  config.ts            TOUT l'équilibrage : voitures, physique, nitro, IA, trafic, police, caméra
  game/Game.ts         boucle à pas fixe (120 Hz) découplée du rendu, états, collisions, classement
  game/tracks.ts       définitions des 4 circuits : tracé, ambiance, nombre de tours, aperçu SVG
  game/Championship.ts points et classement général du championnat
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
- **Plein écran** : sur Android, l'API Fullscreen est relancée à chaque départ de course (si on en est sorti) et un bouton PLEIN ÉCRAN est dans le garage. Un bouton INSTALLER L'APP apparaît quand Chrome propose l'installation. L'iPhone n'autorise pas le plein écran pour un site : un guide (bouton « PLEIN ÉCRAN ? » et astuce sur l'écran titre) explique comment l'installer sur l'écran d'accueil, où il s'ouvre sans aucune barre. Attention, sur iOS l'app installée a sa propre sauvegarde, séparée de celle de Safari.
- **Icônes PWA** : les PNG (180, 192 et 512 px, exigés par iOS) sont générés par `npm run icons` (`scripts/icons.mjs`), avec un rasteriseur et un encodeur PNG maison. Ce sont les mêmes formes que `public/icon.svg`.
- **Hook de debug** : `?debug` expose `window.game` dans la console.
