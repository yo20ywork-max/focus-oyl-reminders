# Focus Oyl mobile app landing path

Goal: turn the current local-first web prototype into an installable iOS / Android app without throwing away the working UI, OCR, and local memory engine.

## Stack

- Capacitor native shell
- Existing HTML / CSS / JS as the WebView app
- Local Tesseract.js OCR bundled into the app assets
- Custom native plugin named `FocusOylNative`

Capacitor is the fast path because it can wrap an existing web app into iOS / Android, while still allowing custom Swift / Android native plugins for protected device data.

## Current repo state

- `capacitor.config.json`: app id, app name, and `www` output folder
- `native-bridge.js`: browser fallback plus future Capacitor plugin facade
- `tools/build-mobile-web.mjs`: copies the app and OCR runtime into `www`
- `native/ios/FocusOylNativePlugin.swift`: iOS plugin skeleton
- `native/android/FocusOylNativePlugin.kt`: Android plugin skeleton
- `native/android/FocusOylNotificationListenerService.kt`: Android notification listener skeleton

## Data-source policy

- Photos, calendar, contacts, files: request OS permissions and read only what the user grants.
- Notifications: Android can support NotificationListenerService after the user enables it in Settings. iOS cannot read other apps' notification content.
- Chats: use share sheet, exports, official APIs, or Android notification previews.
- SMS / call log: restricted and not part of the general MVP.

## Next build commands

These commands require installing Capacitor packages and native toolchains:

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm run build:mobile-web
npx cap add ios
npx cap add android
npx cap sync
```

After that, copy the native plugin skeletons into the generated iOS / Android projects and register them with Capacitor.
