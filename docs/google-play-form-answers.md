# Focus Oyl Google Play Form Answers

Use this as a copy-and-paste draft after the developer account verification finishes.

## App Creation

- App name: `Focus Oyl`
- Default language: Traditional Chinese (`zh-TW`) if available; otherwise English.
- App or game: App
- Free or paid: Free for the initial release. Add subscriptions later after Google Play Billing is implemented.
- Category: Productivity
- Tags: productivity, reminders, personal organization, safety

## Store Listing

Short description:

```text
Focus on your life. Local-first reminders from selected text and screenshots.
```

Full description:

```text
Focus Oyl is a calm, local-first reminder layer that helps you focus on life instead of constantly checking apps.

Import text, screenshots, files, or approved device signals, and Focus Oyl helps extract important reminders, understand timing, and arrange them on a simple timeline. The interface stays quiet until something needs attention.

Key features:
- Local-first text analysis and reminder extraction
- OCR for selected screenshots and images
- Timeline for past, current, and upcoming tasks
- Quiet hours and lead-time rules to avoid reminding too early or too late
- One-tap setup designed for low cognitive load
- Safety Check for family reassurance
- Cross-device handoff package for moving data between devices

Focus Oyl does not silently read every chat or every app. You choose what to paste, share, import, or authorize. Sensitive features such as notification access, SMS fallback, and location fallback require explicit permission.
```

Release notes for internal testing:

```text
Initial Android test release. Includes local-first import, OCR, reminder timeline, Safety Check rehearsal mode, and cross-device handoff.
```

## Contact URLs

- Website: `https://danieldowork.com`
- Privacy policy: `https://danieldowork.com/focus-oyl/privacy/`
- Support URL: `https://danieldowork.com/focus-oyl/support/`
- Support email: `support@example.com`

The local HTML files are prepared at:

- `focus-oyl/privacy/index.html`
- `focus-oyl/support/index.html`

Upload those pages to `danieldowork.com` before using the URLs in Play Console.

## App Access

If Google asks whether the app requires login:

```text
No. The app does not require a login account. Reviewers can open the app directly, use local import, OCR, reminders, and the timeline without credentials.
```

Reviewer instructions:

```text
Open the app and tap "one-tap start" if setup appears. Use Import to paste text or select a file/image. The app will analyze content on device and create reminders. Safety Check can be opened from Status or the safety section. Location and SMS fallback are optional and require explicit permissions.
```

## Ads

- Contains ads: No

## Target Audience

- Target age: 18+
- Designed for Families: No
- Child-directed: No

Reason:

```text
Focus Oyl is intended for adults and caregivers. It includes productivity reminders, notification access, optional safety-check features, and optional location/SMS fallback. It is not designed for children.
```

## Content Rating Draft

Expected answers:

- Violence: No
- Sexual content: No
- Profanity: No
- Controlled substances: No
- Gambling: No
- User-generated public sharing: No
- Online interaction with unknown users: No
- Location sharing: Yes, optional, only to a configured family contact during Safety Check timeout.
- Personal data collection: The app processes user-selected/imported content locally. It does not provide a public social feed.

## Data Safety Draft

Important: Google Play Data safety focuses on what is collected or shared, including transfer off device. Local-only processing that does not leave the device should be described carefully and not overstated.

Current build:

- Third-party analytics SDKs: No
- Advertising SDKs: No
- Focus Oyl cloud account: No
- Developer server upload of reminders: No
- Data encrypted in transit: Yes for normal HTTPS web resources; SMS fallback is carrier SMS and not end-to-end encrypted.
- Users can request data deletion: Local data can be cleared in app or by uninstalling. There is no cloud account to delete.

Declare data sharing only where applicable:

| Data type | Collects off device? | Shares? | Purpose | Optional? |
| --- | --- | --- | --- | --- |
| Precise location | No developer-server collection | Yes, only if Safety Check timeout + location fallback + SMS fallback are enabled | Safety/emergency family alert | Yes |
| SMS messages | No developer-server collection | No | Receive trusted `SAFE_CHECK` command and send safety reply/location fallback by SMS | Yes |
| Photos/images | No developer-server collection | No | OCR selected images on device | Yes |
| App notifications | No developer-server collection | No | Local reminder extraction from explicitly authorized notification access | Yes |
| User-entered text/files | No developer-server collection | No | Local reminder extraction | Yes |
| Family contact phone number | No developer-server collection | Used locally to send SMS if Safety Check fallback is enabled | Safety Check | Yes |

Suggested summary:

```text
Focus Oyl is local-first. It stores reminders and settings on the user's device and does not include analytics, ads, or a Focus Oyl cloud account in the current release. If the user enables Safety Check fallback, the app may send an SMS to a configured family contact when a safety check times out. If the user also enables location fallback and grants location permission, that SMS may include current or last known location.
```

## Sensitive Permission Declarations

The release requests sensitive Android permissions. Be ready to complete Play Console App Content declarations.

### SMS

Permissions:

- `RECEIVE_SMS`
- `SEND_SMS`

Use case:

```text
Physical safety / emergency alerts and device automation. Focus Oyl can receive a trusted `SAFE_CHECK` SMS from a configured family contact and start a local 30-second Safety Check. If the user does not respond and has explicitly enabled SMS fallback, the app sends a safety reply or optional location fallback SMS to that configured contact.
```

Important limitation:

```text
Focus Oyl does not read SMS conversations. It only reacts to the exact `SAFE_CHECK` command from trusted configured numbers.
```

### Location

Permissions:

- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`

Use case:

```text
Optional Safety Check timeout fallback. The app only uses location after the user enables the feature, grants permission, and fails to respond to a Safety Check within the timeout. Pressing "I'm OK" does not send location.
```

### Notification access

Use case:

```text
Optional local automation. When the user explicitly enables Android notification access, Focus Oyl buffers notification titles/text locally and extracts reminders on device. It does not upload notification content to a server.
```

### Exact alarms

Use case:

```text
Local reminders and Safety Check timeout countdowns need reliable timing.
```

## Production Risk Notes

Google Play is strict about SMS permissions. Official policy says SMS/Call Log permissions are restricted, must be declared, and should only be used for permitted core functionality. The closest declared use case is physical safety/emergency alerts for `SEND_SMS`; receiving `SAFE_CHECK` may be positioned as device automation, but it still needs review.

For the safest first public release, consider shipping a no-SMS fallback build first, then adding SMS fallback after policy approval. Internal testing can still use the current full-capability build.

Official references:

- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Permissions declaration: https://support.google.com/googleplay/android-developer/answer/9214102
- SMS and Call Log policy: https://support.google.com/googleplay/android-developer/answer/10208820
- Families policy: https://support.google.com/googleplay/android-developer/answer/9893335
