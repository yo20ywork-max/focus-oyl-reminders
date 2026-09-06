# Validation Record

Checked on 2026-09-06 against this public source snapshot.

| Check | Result | Scope |
|---|---|---|
| Locked dependency installation | Passed | `npm ci --ignore-scripts --no-audit --no-fund` |
| JavaScript syntax | Passed | `npm run check` |
| Reminder regression suite | Passed | `npm test`; 5 actionable signals and 1 review item in the existing fixture |
| Web/OCR asset build | Passed | `npm run build:mobile-web`; language assets rebuilt from installed packages |
| Capacitor Android sync | Passed | Existing Android project synchronized with the web build |
| Android debug build | Passed | `gradlew.bat :app:assembleDebug --no-daemon --max-workers=2`; 71 tasks executed |

The native build ran on Windows with JDK 21 and Android SDK API 36. The existing reminder fixtures use Taiwan local time, now explicitly configured by the test runner. Syntax and reminder checks also passed in a Linux environment.

The bundled Gradle wrapper JAR matched the [official Gradle checksum reference](https://gradle.org/release-checksums/) for version 8.14.3.

## Limits

This run did not perform an iOS/Xcode build, physical-device acceptance testing, real SMS or location actions, notification/background-delivery testing, OCR accuracy measurement, or store submission. A successful debug build establishes compilation and packaging, not all runtime behavior. No production signing key was used or published.

The original native reference files and historical release drafts may describe a different stage of development. This record reports checks performed during the public import.
