#!/usr/bin/env bash
# Compile l'APK de debug. Prérequis : Node 18+, JDK 17+, Android SDK (ANDROID_HOME ou ANDROID_SDK_ROOT), accès réseau (npm + Gradle).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js manquant"; exit 1; }
command -v java >/dev/null || { echo "JDK 17+ manquant"; exit 1; }
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] || { echo "Définis ANDROID_HOME (Android SDK, plateforme 34 + build-tools)"; exit 1; }
npm install
[ -d android ] || npx cap add android
node scripts/patch-android.mjs
npx cap sync android
(cd android && ./gradlew assembleDebug)
mkdir -p dist && cp android/app/build/outputs/apk/debug/app-debug.apk dist/ForestSwingVR-debug.apk
echo "APK : dist/ForestSwingVR-debug.apk  (installe avec : adb install -r dist/ForestSwingVR-debug.apk)"
