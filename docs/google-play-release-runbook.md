# Focus Oyl Google Play Release Runbook

This runbook describes the remaining steps to publish Focus Oyl on Google Play.

## Current Build State

- App name: Focus Oyl
- Android application ID: `com.focusoyl.app`
- Version name: `1.0`
- Version code: `1`
- Minimum SDK: `24`
- Target SDK: `36`
- Release bundle: `android/app/build/outputs/bundle/release/app-release.aab`
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Google Play Requirements

Google Play uses Android App Bundles for new apps. Before uploading, the AAB
must be signed with an upload key. Play App Signing then manages the app signing
key used for distribution to users.

Official references:

- Sign your app: https://developer.android.com/guide/publishing/app-signing
- Upload your app bundle: https://developer.android.com/studio/publish/upload-bundle
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756
- Prepare and roll out a release: https://support.google.com/googleplay/android-developer/answer/9859348
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469

## What Is Already Prepared

- Android project builds successfully on Windows.
- `assembleDebug` passes.
- `bundleRelease` passes.
- Gradle release signing is wired to use `android/key.properties` if present.
- `android/key.properties.example` documents the required signing fields.

## What Cannot Be Completed Without Your Account

- Google Play Developer account registration.
- Paying the Play Developer registration fee.
- Creating the Play Console app record.
- Accepting Play App Signing terms.
- Uploading the AAB to Play Console.
- Completing Data safety and App content forms.
- Rolling out to internal testing, closed testing, open testing, or production.

Those actions are account, legal, payment, or public distribution actions and
must be performed or confirmed by the account owner.

## Step 1: Create An Upload Key

Create a secure upload keystore outside the repo and keep a backup.

Recommended location:

```text
C:\ultramax\secrets\focus-oyl-upload.jks
```

Example command:

```powershell
keytool -genkeypair `
  -v `
  -keystore C:\ultramax\secrets\focus-oyl-upload.jks `
  -alias focus-oyl-upload `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000
```

Then copy:

```text
android/key.properties.example -> android/key.properties
```

Fill in:

```properties
storeFile=../secrets/focus-oyl-upload.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=focus-oyl-upload
keyPassword=YOUR_KEY_PASSWORD
```

Do not commit `android/key.properties` or any `.jks` file.

## Step 2: Build Signed AAB

```powershell
cd C:\ultramax\android
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat clean bundleRelease
```

Output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Verify signing:

```powershell
jarsigner -verify -verbose android\app\build\outputs\bundle\release\app-release.aab
```

## Step 3: Create Play Console App

In Google Play Console:

1. Create app.
2. App name: `Focus Oyl`
3. Default language: Traditional Chinese or English.
4. App or game: App.
5. Free or paid: choose business model.
6. Declarations: complete accurately.

Suggested category:

```text
Productivity
```

Suggested short description:

```text
Focus on your life. Local-first reminders from selected text and screenshots.
```

Suggested full description:

```text
Focus Oyl is a calm, local-first reminder layer. It helps turn selected text,
screenshots, imported files, and user-approved device sources into a personal
timeline. It is designed to stay quiet until something needs attention.

Focus Oyl does not silently read all chats or all phone data. Users choose what
to paste, share, import, or authorize. OCR and reminder extraction are designed
to run locally where possible.
```

## Step 4: Data Safety Draft

For the current build:

- Data collection: disclose only what the shipped app actually collects.
- Data sharing: no third-party analytics or ad SDK is currently integrated.
- Sensitive sources: selected photos/screenshots, calendar/reminder data, and
  contacts are permission-based.
- Location: only disclose if Safety Check location fallback is enabled and
  permission is requested in the shipped Android build.
- Account deletion: no Focus Oyl cloud account is currently implemented.

Do not claim the app reads every app or every message on the phone.

## Step 5: Upload Release

Start with Internal testing:

1. Testing > Internal testing.
2. Create new release.
3. Upload the signed AAB.
4. Add release notes.
5. Review release.
6. Roll out to internal testing.

Suggested release notes:

```text
Initial Focus Oyl Android test release. Includes local-first import, OCR,
timeline reminders, Safety Check prototype, and cross-device handoff package.
```

After internal testing, complete store listing, screenshots, privacy policy,
Data safety, App content, and production release.
