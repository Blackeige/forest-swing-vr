@echo off
REM Windows : mêmes étapes que build-apk.sh (Node, JDK 17+, ANDROID_HOME requis)
cd /d %~dp0\..
call npm install || exit /b 1
if not exist android call npx cap add android || exit /b 1
node scripts\patch-android.mjs || exit /b 1
call npx cap sync android || exit /b 1
cd android && call gradlew.bat assembleDebug || exit /b 1
cd .. && if not exist dist mkdir dist
copy /y android\app\build\outputs\apk\debug\app-debug.apk dist\ForestSwingVR-debug.apk
