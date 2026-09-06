# Focus Oyl Play Submission Checklist

Use this while Google verifies the developer account.

## Already Done Locally

- Signed Google Play AAB created.
- Upload key created and stored under `C:\ultramax\secrets`.
- Demo/sample/test content removed from shipped assets.
- Privacy and support pages prepared under `focus-oyl/`.
- v40 release package prepared under `artifacts/focus-oyl-v40-release`.
- Google Play store assets prepared under `artifacts/focus-oyl-v40-release/store-assets`.

## Still Blocked By Google Verification

- Identity verification approval.
- Phone verification, if not completed.
- Creating the Play Console app record if Google blocks it until verification finishes.
- Uploading AAB to internal testing.
- Completing Data safety, App content, and permissions declarations.

## When Verification Passes

1. Create app record.
2. App name: `Focus Oyl`.
3. Category: Productivity.
4. Upload privacy/support pages to `danieldowork.com`.
5. Fill Store Listing using `docs/google-play-form-answers.md`.
6. Upload `artifacts/focus-oyl-v40-release/android/focus-oyl-v40-release-signed.aab`.
7. Complete App access: no login required.
8. Complete Ads: no ads.
9. Complete Target audience: 18+, not Designed for Families.
10. Complete Content rating questionnaire.
11. Complete Data safety.
12. Complete sensitive permission declarations.
13. Roll out to Internal testing first.

## Store Assets To Upload

- App icon: `artifacts/focus-oyl-v40-release/store-assets/focus-oyl-play-icon-512.png`
- Feature graphic: `artifacts/focus-oyl-v40-release/store-assets/focus-oyl-feature-graphic-1024x500.png`
- Phone screenshots: `artifacts/focus-oyl-v40-release/store-assets/focus-oyl-phone-01-home.png` through `focus-oyl-phone-04-safety.png`

## Recommended First Track

Start with Internal testing, not Production.

Reason: the app requests sensitive capabilities, including SMS, location, exact alarm, and notification access. Internal testing lets you validate Play Console warnings and permission declarations before a public launch.
