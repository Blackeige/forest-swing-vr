# Forest Swing VR

Jeu de déplacement aux mains inspiré des mécaniques de Gorilla Tag (contenu 100 % original), pour **Android + Google Cardboard**.
HTML5 / JavaScript (modules ES) / WebGL, empaqueté en APK avec **Capacitor**. Aucune dépendance de jeu, aucun CDN : tout est dans `www/`.

## État réel du projet (lis ceci d'abord)

| Élément | État |
|---|---|
| Jeu web, physique, map, calibration, tracking, multijoueur | Écrits et testés **sur ordinateur** (Node + Chromium headless, WebGL logiciel, caméra factice) |
| APK | **NON compilée** : l'environnement de génération n'avait ni Android SDK ni accès réseau. Le projet est prêt à compiler (voir ci-dessous). |
| Test sur téléphone Android / Cardboard réel | **Non fait.** Caméra réelle, gyroscope réel, perfs sur appareil 4 Go, WebView Capacitor : à valider chez toi. |
| Three.js | **Non utilisé** : pas de réseau pour le télécharger/redistribuer. Un moteur WebGL1 minimal maison (`www/js/gl.js`) rend la scène : plus léger, sans dépendance, hors ligne. |
| WebXR | **Non utilisé volontairement** : WebXR immersif n'est pas fiable dans les WebViews Android ni avec Cardboard, et il empêcherait de contrôler la caméra de tracking. Le rendu stéréo + suivi de tête par capteurs est la voie principale. |
| Assets Internet | Aucun téléchargé (pas de réseau). Map, arbres, rochers, avatar, sons : **générés procéduralement** (aucune licence à respecter). |

## Lancer en développement (PC / téléphone sur le même Wi-Fi)

```bash
node scripts/dev-server.js        # HTTPS auto-signé (openssl requis), ou HTTP=1 node scripts/dev-server.js
```
Ouvre l'URL affichée sur le téléphone (accepte l'avertissement de certificat : HTTPS est nécessaire à la caméra hors `localhost`).
Test PC sans casque : coche « Écran simple », puis **W** avancer, **Espace** sauter, flèches = tête, **M** menu, **C** recalibrer, **G** diagnostic, **R** recentrer.

## Compiler l'APK

Prérequis : Node 18+, JDK 17+, Android SDK (plateforme 34 + build-tools, variable `ANDROID_HOME`), réseau pour npm/Gradle.
```bash
bash scripts/build-apk.sh        # Windows : scripts\build-apk.bat
# -> dist/ForestSwingVR-debug.apk     adb install -r dist/ForestSwingVR-debug.apk
```
Le script : `npm install` → `cap add android` → `scripts/patch-android.mjs` (permissions CAMERA/audio, paysage `sensorLandscape`, mode immersif, demande de la permission caméra au lancement) → `cap sync` → `gradlew assembleDebug`.
Sans SDK local : pousse ce dossier sur GitHub, le workflow `.github/workflows/android.yml` produit l'APK (onglet *Actions → Artifacts*). Les versions Capacitor ^6 n'ont pas pu être vérifiées hors ligne : si Gradle échoue, mets à jour `package.json` vers la dernière version stable.

## Jouer

1. Lance, appuie sur **Jouer**, accepte caméra + capteurs. Place le téléphone dans le Cardboard (paysage).
2. **Calibration (≈ 15 s)** : les boutons se déclenchent **au regard** (maintenir le réticule ~1 s) **ou par tap** sur l'écran (bouton du Cardboard).
   capteurs → mains devant la caméra (la teinte de peau est affinée automatiquement) → tendre les bras et bouger → vérification avec mains virtuelles → *Valider*.
   Échec ou envie de régler à la main : bouton **Manuel** (sensibilité, distance des mains, échelle, décalages, hauteur, lissage, zone morte…). Les réglages sont sauvegardés (`localStorage`).
3. En jeu, **tap** = menu (reprendre, recalibrer rapidement, réglages, recentrer, diagnostic, multijoueur, mode secours).
4. Locomotion : une main qui touche une surface (sol, mur, tronc, plateforme) y reste ancrée et te propulse ; relâcher conserve l'élan. Pousser le sol des deux bras = saut. Trampolines orange = rebond. Tout est agrippable : tours, mur nord, spirale de plateformes.

## Architecture (`www/js/`)

| Fichier | Rôle |
|---|---|
| `main.js` | Boucle de rendu (indépendante), physique à pas fixe 90 Hz, états, UI, avatars |
| `gl.js` | Rendu WebGL stéréo, FBO + distorsion « barillet » (k1/k2 réglables), panneaux HUD |
| `world.js`, `mesh.js` | Map procédurale + colliders AABB (≈170) ; maillage statique unique |
| `physics.js` | Locomotion par ancrage des mains, inertie, collisions sphères/AABB, rebonds |
| `head.js` | Suivi de tête (DeviceOrientation), recentrage ; repli clavier |
| `camera.js` | `getUserMedia`, choix caméra, **HandTracker** (Worker, résolution adaptative 160×120 → 80×60, capture 320×240) |
| `tracker-core.js`, `tracker.worker.js` | Détection des mains sans doigts : masque peau YCbCr adaptatif, composantes connexes, filtre alpha-bêta, prédiction limitée, gestion des pertes |
| `handmap.js` | 2D → 3D (plage calibrée + aire apparente), lissage, zone morte, mains de repos en cas de perte ; simulation de secours |
| `calibration.js`, `hud.js` | Assistant de calibration, panneaux/boutons au regard |
| `net.js`, `server/relay.js` | Multijoueur : positions + mains, interpolation 120 ms ; relais WebSocket sans dépendance |
| `audio.js` | Vent / oiseaux / impacts procéduraux |

**Multijoueur** : `node scripts/dev-server.js` expose aussi `/ws`. Dans *Options* du lancement, saisis `wss://IP:8443/ws` (ou `local` pour deux onglets du même appareil) et la même salle. Pas d'autorité serveur (prototype, pas de triche-proofing). Le solo n'en dépend pas.

## Limites connues (honnêtes)

- **Tracking des mains par couleur** : sensible à l'éclairage et aux fonds proches de la teinte de peau (bois, murs beiges). La calibration affine la teinte ; « Réinitialiser la peau » dans les réglages. Gants/peaux très foncées : à tester, l'affinage s'adapte mais n'a pas été évalué sur de vraies personnes.
- **Profondeur estimée, pas mesurée** : z vient de la taille apparente de la région détectée ; x/y de la plage calibrée. Le centre peut dériver si l'avant-bras est visible.
- **Caméra arrière en Cardboard** : beaucoup de casques ont une ouverture/un cache qui limite le champ vu ; la plupart des téléphones n'autorisent qu'une caméra à la fois (pas de caméra externe garantie ; `Caméra suivante` liste celles exposées par Android).
- **Orientation de l'image caméra** : si l'image est tournée/inversée sur ton appareil, utilise *Rotation caméra* et *Image miroir* (Réglages → Vue/Options).
- **Gyroscope** : `DeviceOrientation` relatif, dérive lente possible ; *Recentrer la vue* dans le menu.
- **Lentilles** : distorsion par défaut approximative, pas un profil exact de ton viewer ; ajuste k1/k2 et l'écart des yeux.
- **Performances** : cible 72/90 FPS non garantie ; réduis *Résolution du rendu* si besoin. Le « temps de rendu » affiché est le temps CPU de soumission, pas le temps GPU.
- Si la caméra reste inaccessible : le **mode secours** (tactile : moitié gauche/droite de l'écran = main gauche/droite) permet de jouer et de tester.

## Tests

```bash
node tests/run-all.mjs                                   # structure, imports, tracker, physique, réseau (Node seul)
NODE_PATH=<chemin node_modules global> node tests/smoke.mjs   # navigateur headless (Playwright requis), captures dans /tmp/shots
```
