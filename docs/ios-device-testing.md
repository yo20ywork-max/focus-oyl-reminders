# Focus Oyl iPhone device testing

This repo already contains a generated Capacitor iOS project. The remaining
blocker for testing on a real iPhone is Apple code signing, which must be done
from macOS with Xcode.

## Current status

- App name: Focus Oyl
- Tagline: Focus on your life
- Bundle identifier: `com.focusoyl.app`
- iOS project: `ios/App/App.xcodeproj`
- Web assets copied into: `ios/App/App/public`
- Native bridge skeleton: `ios/App/App/FocusOylNativePlugin.swift`
- Permission strings are already present in `ios/App/App/Info.plist`

## What you can and cannot do with only an iPhone

You can install the app on your iPhone only after an Apple-signed build exists.
An unsigned iOS app cannot be installed directly from Windows.

With only an iPhone, the realistic testing paths are:

- Install a TestFlight build someone uploads for you.
- Install a build signed on a borrowed Mac.
- Use the web/PWA preview for interface testing, with limited device access.

For the native app path, you need one of these:

- A Mac with Xcode, connected to your iPhone.
- A remote/cloud Mac with signing credentials.
- A teammate or contractor who can build and upload to TestFlight.

## Test the mobile UI from an iPhone today

This does not install the native iOS app, but it lets you test the mobile
interface, onboarding, import flow, OCR screen, and PWA behavior from your real
iPhone.

Requirements:

- Windows machine and iPhone are on the same Wi-Fi network.
- The Windows firewall allows Python or the selected server through Private
  networks.

On Windows, from this repo:

```powershell
npm run build:mobile-web
python -m http.server 5503 --bind 0.0.0.0 --directory www
```

Find the Windows LAN IP:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object IPAddress,InterfaceAlias
```

On the iPhone, open Safari:

```text
http://WINDOWS_LAN_IP:5503/#import
```

For example:

```text
http://192.168.1.23:5503/#import
```

From Safari, use Share > Add to Home Screen to test the PWA-style launch.

## Path A: Fastest direct iPhone install with a Mac

Use this when you have temporary access to a Mac and your iPhone.

1. Install Xcode from the Mac App Store.
2. Open Xcode once and finish first-launch setup.
3. Connect the iPhone to the Mac with a cable.
4. On the iPhone, trust the Mac when prompted.
5. On the iPhone, enable Developer Mode if iOS asks for it.
6. Copy or clone this project onto the Mac.
7. In Terminal on the Mac, run:

```sh
npm install
npm run build:mobile-web
npx cap sync ios
npx cap open ios
```

8. In Xcode, select the `App` target.
9. Open `Signing & Capabilities`.
10. Set a development team.
11. Keep `Automatically manage signing` enabled.
12. Keep the bundle identifier as `com.focusoyl.app`, or change it to a unique
    identifier owned by the Apple account.
13. Select the connected iPhone as the run destination.
14. Press Run.

If Xcode says the bundle identifier is already taken, change it to something
unique, such as `com.yourcompany.focusoyl`.

## Path B: TestFlight

Use this when you want to test on your iPhone without keeping it connected to a
Mac.

Requirements:

- Apple Developer Program account.
- App Store Connect access.
- A Mac with Xcode for archive/upload, or a configured macOS CI service.

High-level flow:

1. Create an App Store Connect app record.
2. Use the bundle identifier chosen for Focus Oyl.
3. On the Mac, run:

```sh
npm install
npm run build:mobile-web
npx cap sync ios
npx cap open ios
```

4. In Xcode, configure signing for the `App` target.
5. Choose `Product > Archive`.
6. In Organizer, distribute the archive to App Store Connect.
7. In App Store Connect, add the uploaded build to TestFlight.
8. Install Apple's TestFlight app on the iPhone.
9. Accept the invitation and install Focus Oyl.

External testers may require beta app review. Internal testers are faster if
they are App Store Connect users on the team.

## Path C: Cloud Mac or CI

Use this when you do not own a Mac but want repeatable builds.

This is possible, but signing secrets must be handled carefully:

- Apple certificate private key
- Provisioning profile
- App Store Connect API key, if uploading automatically
- Team ID and bundle identifier

Do not commit signing certificates, provisioning profiles, or API keys to this
repo. Store them only in the CI provider's encrypted secrets.

Recommended first CI goal:

1. Build the iOS archive.
2. Export an `.ipa`.
3. Upload manually or automatically to TestFlight.

## Useful commands on macOS

Open the iOS project:

```sh
npx cap open ios
```

Sync web changes into iOS:

```sh
npm run build:mobile-web
npx cap sync ios
```

List iOS targets known to Capacitor:

```sh
npx cap run ios --list
```

Build from Xcode command line, after signing is configured:

```sh
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  build
```

Create an archive:

```sh
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/FocusOyl.xcarchive \
  archive
```

Export a TestFlight/App Store Connect upload package:

```sh
xcodebuild \
  -exportArchive \
  -archivePath build/FocusOyl.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ios/App/ExportOptions.TestFlight.template.plist \
  -allowProvisioningUpdates
```

Before using command-line export in production, check the active Xcode version's
supported export options:

```sh
xcodebuild -help
```

## iOS data-access reality check

Focus Oyl can ask for user consent and use Apple-approved surfaces. It cannot
silently read all iPhone data.

Allowed or realistic:

- Photos selected by the user, for OCR.
- Files imported by the user.
- Text shared into Focus Oyl from another app.
- Calendar, contacts, and reminders after OS permission prompts.
- Local notifications scheduled by Focus Oyl.

Not allowed on iOS:

- Reading every other app's chat database.
- Reading all incoming notifications from every app.
- Background screen scraping.
- Bypassing App Store privacy prompts.

The product direction should stay local-first and permission-first: the user
chooses sources, Focus Oyl processes them on device, then reminds only when it
finds something useful.

## Official references

- Apple: Running your app in Simulator or on a device
  https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device
- Apple: TestFlight overview
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- Capacitor: iOS documentation
  https://capacitorjs.com/docs/ios
