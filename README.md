# Focus Oyl — Local Reminders & Care Companion

A local-first reminder application that turns selected text and images into actionable reminders, with a timeline, quiet-hour scheduling, and native mobile integrations.

**By Daniel Tang.** This repository contains the reminder application previously developed in the `ultramax` folder. It is a separate project from my [FocusOYL local AI translator and agent](https://github.com/2ykrrmyscg-del/FocusOYL).

## What the code implements

- Rule-based extraction of tasks, deadlines, warranty events, and other reminder signals, with a review queue for uncertain matches.
- Local English and Traditional Chinese OCR through Tesseract.js.
- Reminder timing, quiet hours, manual snoozing, and deadline checks.
- A browser interface with local storage, an installable web manifest, and service-worker support.
- Capacitor Android and iOS projects with custom native integrations. Android includes notification access and an optional Safety Check workflow; capabilities differ across platforms.
- User-initiated import, export, and cross-device handoff of local data.

The reminder extraction engine is heuristic; this repository does not train an AI model. Safety Check is experimental and is not a validated emergency-response service.

## Explore the implementation

| Area | Source |
|---|---|
| Application and interface | [`app.js`](app.js), [`index.html`](index.html), [`styles.css`](styles.css) |
| Extraction and scheduling | [`memory-core.js`](memory-core.js), [`time-core.js`](time-core.js) |
| Local OCR and native facade | [`ocr-engine.js`](ocr-engine.js), [`native-bridge.js`](native-bridge.js) |
| Android implementation | [`android/app/src/main/java/com/focusoyl/app`](android/app/src/main/java/com/focusoyl/app) |
| iOS implementation | [`ios/App/App`](ios/App/App) |
| Earlier native reference implementations | [`native`](native) |
| Build and regression checks | [`tools`](tools) |

The `native/` reference files are not the active platform source directories. The existing platform projects contain the integrated implementation.

## Run locally

Use Node.js 22 or newer and Python 3. Install dependencies from the lockfile, then assemble the web app and its local OCR assets:

```bash
npm ci
npm run check
npm test
npm run build:mobile-web
python -m http.server 8000 --bind 127.0.0.1 --directory www
```

Open `http://127.0.0.1:8000`. The interface currently uses Traditional Chinese. Dependencies are downloaded during setup; the OCR language files are copied from installed packages into the local build. OCR accuracy, browser permissions, and mobile background behavior require separate testing.

## Native development

After the web build, synchronize the existing platform projects:

```bash
npx cap sync android
npx cap open android
```

For iOS, use `npx cap sync ios` and `npx cap open ios` on a Mac with Xcode. Follow the [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup). Configure your own signing identity; signing keys and local machine settings are excluded from this repository.

Optional notification, SMS, and location features require explicit device permissions. A browser preview does not establish that these native features work on a particular phone. Store submission documents in `docs/` are development drafts, not approval records.

## Evidence and project context

See [validation scope](VALIDATION.md) and [publication notes](PUBLICATION.md). The existing regression check covers reminder extraction, deduplication, quiet-hour handling, and deadline-aware snoozing. Native-device behavior and safety outcomes are separate validation tasks.

Third-party components include [Capacitor](https://github.com/ionic-team/capacitor), [Tesseract.js](https://github.com/naptha/tesseract.js), and its [language data packages](https://github.com/naptha/tessdata). Their licenses and notices remain applicable.

[Daniel Tang's software and AI portfolio](https://github.com/yo20ywork-max/research-portfolio)
