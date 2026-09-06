# Focus Oyl iOS App Store Release Runbook

This runbook describes the remaining steps to publish Focus Oyl to TestFlight
and then the App Store.

## Current Build State

- App name: Focus Oyl
- Bundle identifier: `com.focusoyl.app`
- iOS project: `ios/App/App.xcodeproj`
- Web assets: synced into `ios/App/App/public`
- URL scheme: `focusoyl://`
- Marketing version: `1.0`
- Build number: `1`
- Minimum iOS: `15.0`
- Export options:
  - `ios/App/ExportOptions.Development.template.plist`
  - `ios/App/ExportOptions.TestFlight.template.plist`

## What Cannot Be Completed On Windows

Apple distribution requires macOS tooling:

- Xcode to archive an iOS app.
- Apple code signing certificates and provisioning profiles.
- App Store Connect or Transporter upload.
- Apple review approval before public App Store availability.

Windows can prepare the Capacitor project and assets, but it cannot create a
signed iOS archive or upload it with Xcode.

## Required Accounts And Devices

- Apple Developer Program membership.
- App Store Connect access.
- A Mac with Xcode, or a cloud Mac/CI provider.
- A real iPhone for device testing is strongly recommended.

Do not commit these items to this repo:

- Apple account password.
- App Store Connect API private key.
- Signing certificates.
- Provisioning profiles.
- App-specific passwords.

## Mac Build Steps

From the project root on macOS:

```sh
npm install
npm run build:mobile-web
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Open the `App` target.
2. Open `Signing & Capabilities`.
3. Select your Apple development team.
4. Keep automatic signing enabled.
5. Confirm the bundle identifier is unique.
6. Connect an iPhone and run a debug build.

If `com.focusoyl.app` is unavailable, change the bundle identifier to one owned
by the Apple Developer account, for example:

```text
com.yourcompany.focusoyl
```

## TestFlight Archive

After signing is configured in Xcode:

```sh
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/FocusOyl.xcarchive \
  archive
```

Export/upload:

```sh
xcodebuild \
  -exportArchive \
  -archivePath build/FocusOyl.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ios/App/ExportOptions.TestFlight.template.plist \
  -allowProvisioningUpdates
```

Alternatively, use Xcode Organizer:

1. Product > Archive.
2. Distribute App.
3. Select TestFlight & App Store.
4. Upload to App Store Connect.

## App Store Connect Setup

Create a new app record:

- Platform: iOS
- Name: Focus Oyl
- Primary language: Traditional Chinese or English
- Bundle ID: the same identifier used in Xcode
- SKU: `focus-oyl-ios-1`
- User access: Full access, unless intentionally restricted

Suggested metadata:

- Subtitle: `Focus on your life`
- Category: Productivity
- Age rating: likely 4+, subject to Apple questionnaire

Short description:

```text
Focus Oyl is a local-first reminder layer that helps turn selected text,
screenshots, files, calendar items, and reminders into a calm personal
timeline.
```

Privacy summary:

```text
Focus Oyl processes user-provided content locally where possible. It does not
silently read other apps' chats or notifications on iOS. Users choose what to
share, import, or grant through Apple permission prompts.
```

## Privacy Questionnaire Notes

Answer based on the actual iOS build:

- Photos: used only when the user grants access or selects images for OCR.
- Calendar: used only after permission, for finding reminder dates.
- Contacts: optional, used for local name recognition.
- Reminders: optional, used after permission.
- Location: only if Safety Check timeout fallback is shipped and permission is
  requested.
- Diagnostics: no custom analytics currently implemented.
- Tracking: no third-party tracking currently implemented.

Do not claim that Focus Oyl reads all iPhone data. iOS does not permit that.

## Review Notes For Apple

Suggested review note:

```text
Focus Oyl is local-first. The app requests user permission for supported iOS
data sources and also accepts user-shared text/files/screenshots. iOS does not
allow reading other apps' chats or notifications, so the app uses user-initiated
sharing and permission prompts instead.
```

## Public Release Gate

Before submitting for App Review:

- Install a TestFlight build on a real iPhone.
- Verify onboarding, import, OCR, timeline, local notifications, and Safety
  Check copy.
- Verify permission prompts match the Info.plist usage descriptions.
- Add App Store screenshots.
- Add a support URL and privacy policy URL.
- Decide whether Safety Check location fallback is enabled in the submitted
  build.

