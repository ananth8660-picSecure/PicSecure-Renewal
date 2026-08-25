# PicSecure Renew

A private, local-first renewal tracker for domains, email plans, cloud services,
databases, software, certificates, and important documents.

## What works in this MVP

- Genuine empty first-run state; no sample or dummy renewal records
- Live days-left countdown and urgency states
- Active, due-soon, urgent, and expired filters
- Search across services, providers, and categories
- Functional Overview, Renewals, Reminders, Activity, Settings, and Profile views
- Add, edit, and delete renewal records with auto-renew status
- Real public RDAP lookup for domain expiration dates
- Direct links to official provider websites for payment
- Local-first offline storage with optional account-scoped Firebase sync; no card storage
- Automatic realtime desktop ↔ Android renewal, activity, profile, and reminder-setting sync
- Firebase Email/Password account with persistent sign-in and password-reset support
- Owner-only Firestore security rules under `users/{uid}`
- Reminder settings for 30, 15, 7, 3, and 1 day before expiry
- Local activity history and profile customization
- JSON export/import for moving a local backup between browsers
- Premium responsive desktop, tablet, and mobile layouts
- Read-only Firebase Usage workspace for Development, Staging, and Production
- Live Firestore daily reads, writes, deletes, data/index size, remaining allowance, and Pacific reset countdown
- Live Realtime Database storage, monthly download, and active-connection usage
- Live Firebase Hosting storage and daily data transfer
- Live Functions monthly executions/egress, Cloud Storage usage, and Monitoring API free-read consumption
- Quota risk levels at 70%, 85%, and 95%, manual-only refresh, and service-specific delay labels
- Clickable Development/Staging/Production setup cards with an in-app three-step guide
- Check Domains runs the registry refresh and smoothly scrolls to the highlighted results panel
- Custom minimal PS monogram and renewal-loop logo used consistently in desktop, mobile, and the browser favicon
- One shared React + TypeScript UI for web, compact Windows Tauri/WebView2, and Android Capacitor
- Native renewal notifications at 30, 15, 7, 3, 1, and 0 days
- Six-digit local PIN gate with PBKDF2-SHA-256 verification and attempt limiting
- Android fingerprint/face/device-lock unlock with PIN fallback
- Windows background tray mode, encrypted reminder schedule, and launch-at-login reminders

## Run locally on Windows 11

Install Node.js 22 or later, extract this project, and open a terminal inside
the project folder:

```powershell
npm install
npm run dev
```

Open the local address printed in the terminal. Your renewal records stay in
that browser on that device.

Alternatively, double-click `START-WINDOWS.bat`. It installs dependencies when
`node_modules` is absent and starts PicSecure Renew automatically.

## Production build

```powershell
npm run build
npm run start
```

## Compact Windows EXE

Copy `.env.example` to `.env.local` and set `VITE_PICSECURE_API_BASE` to the
HTTPS address of the deployed PicSecure Renew API. Install the Microsoft C++
Build Tools workload **Desktop development with C++** and Rustup stable once,
then run:

```powershell
npm install
npm run desktop:build
```

The NSIS installer is created in
`src-tauri\target\release\bundle\nsis`. Tauri packages only the optimized Rust
shell and the compiled UI; it uses the Windows system WebView2 runtime instead
of bundling Electron's private Chromium and Node runtimes. This is why both the
installer and installed footprint are dramatically smaller. Exact size depends
on the Windows toolchain and Tauri version, so a strict 10 MB ceiling is not
guaranteed. You can also double-click `BUILD-DESKTOP.bat`. Closing the window
keeps PicSecure Renew in the Windows system tray so scheduled renewal
notifications can still fire. Choose **Quit** from the tray menu to stop it.

## Android APK

Install Android Studio with its Android SDK, then run:

```powershell
npm install
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

Or double-click `BUILD-ANDROID.bat`. The helper copies the installable result to
`PicSecure-Renew.apk` in the project root. Android asks for notification
permission on first use. The device may also ask you to allow installation from
the app that opens the APK.

## Private GitHub releases

The included `.github/workflows/native-release.yml` builds both targets. Add
repository secrets `PICSECURE_API_BASE` and `FIREBASE_API_KEY`; add repository
variables `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and
`FIREBASE_APP_ID`. Then push a version tag such as `v0.4.1`. GitHub Releases
receives the compact Windows installer and Android APK.

Never commit `.env.local`, a Google service-account JSON file, a private key,
Android signing keystore, PIN, or exported renewal backup.

## Automatic desktop and Android sync

Follow [SYNC-SETUP.md](SYNC-SETUP.md) once. After Firebase Email/Password Auth,
Firestore, and the included rules are enabled, sign in from **Settings → Device
sync** on every device using the same private account. Existing local data from
the first device is uploaded automatically, realtime updates arrive on the
other device, and offline writes are queued until connectivity returns.

## Cloudflare hosting

Follow [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md), or double-click
`DEPLOY-CLOUDFLARE.bat` after the first Wrangler secret setup. The deployed
Worker hosts the responsive web app, Firebase usage API, and domain RDAP API.

## Privacy boundary

PicSecure Renew tracks renewal information and opens the provider's official page.
It never performs a payment and never stores card or banking details.

## Connect Firebase Usage securely

The dashboard reads Google Cloud Monitoring from a backend API. A service-account
private key must never be added to React code or pasted into the browser.

1. In Google Cloud Console, enable **Cloud Monitoring API** for every Firebase
   project you want to watch.
2. Create one service account and grant it **Monitoring Viewer** on Development,
   Staging, and Production. Do not grant Editor or Owner.
3. Copy `.env.example` to `.env.local`.
4. Add the real Staging and Production project IDs, service-account email, and
   private key to `.env.local`. Keep the `\n` characters in the key exactly as
   shown in the example.
5. Restart `npm run dev`, open **Firebase usage**, and press **Refresh**.

Before credentials are configured, the Development, Staging, and Production
cards are clickable. Select an environment, then select Step 1, 2, or 3 to open
the exact Google Cloud page or copy the safe `.env.local` template. Staging and
Production stay clearly marked as needing a Project ID until their real IDs are
entered; PicSecure Renew never invents them.

`.env.local` is ignored by Git and is not included in the ZIP. The API only
accepts project IDs in `FIREBASE_MONITOR_PROJECTS`, so the browser cannot query
an arbitrary Google Cloud project.

### What the numbers mean

- Firestore daily quotas reset around midnight Pacific time. The dashboard
  calculates and updates that countdown automatically, including daylight saving.
- Functions monthly allowance uses the next UTC calendar-month boundary.
- Monitoring is near-real-time, not instant. Firestore and Functions data can lag
  several minutes; Cloud Storage totals can take longer.
- Blaze projects still receive applicable no-cost allowances, but usage beyond an
  allowance is billed. Firebase Console and Google Cloud Billing are authoritative.
- Realtime Database and Firebase Hosting expose official Cloud Monitoring metrics.
  Their cards now use those metrics; RTDB storage can lag up to a day and Hosting
  can update only every several hours.
- Google Analytics and Firebase Performance Monitoring are free, but they measure
  users/events and app/network performance—not database billing quotas. The quota
  workspace therefore uses the read-only Cloud Monitoring API.
- Cloud Monitoring API reads include the first one million queried time series per
  billing account each month. The dashboard loads once when opened and queries
  again only when the user selects a project or presses Refresh; it never polls
  automatically in the background.

## Add GoDaddy and Zoho Mail

- **GoDaddy domain:** Select `GoDaddy Domain` in Quick Setup, enter only the
  domain name, and save. PicSecure Renew checks the public RDAP registry for the
  expiry date and calculates the live days-left value. A manual date is used
  only when the registry does not return one.
- **Zoho Mail / Workplace:** Select `Zoho Mail`, open Zoho Mail Admin Console,
  go to `Subscription`, copy the next renewal date, and save it in PicSecure Renew.
  Zoho does not expose that private billing date through public RDAP, so the
  tracker cannot read it without authenticated Zoho account integration.

## Native reminder behavior

Local notifications are deliberately used for due-date reminders. They do not
need an FCM message or an always-online server. Android schedules notifications
with the operating system; Windows keeps an encrypted schedule in the current
Windows account and checks it from the tray process. Remote FCM notifications
are only necessary later for server-created events or cross-device changes.
