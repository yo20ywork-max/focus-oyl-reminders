#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Building Focus Oyl web assets..."
npm install
npm run build:mobile-web
npx cap sync ios

echo "Archiving iOS app..."
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/FocusOyl.xcarchive \
  archive

echo "Exporting for App Store Connect/TestFlight..."
xcodebuild \
  -exportArchive \
  -archivePath build/FocusOyl.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ios/App/ExportOptions.TestFlight.template.plist \
  -allowProvisioningUpdates

echo "Done. Check build/export for exported artifacts or Xcode Organizer for upload status."
