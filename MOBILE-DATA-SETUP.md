# PicSecure Renew 0.4.1 — Mobile data setup

## Automatic desktop ↔ Android records

Renewal records remain local-first, but version 0.4.1 can sync them automatically.
Complete `SYNC-SETUP.md`, then sign in from **Settings → Device sync** on Windows
and Android with the same email and password. Existing records from the first
device upload automatically; the second device receives them in realtime.

The first native launch creates a six-digit local vault PIN. Account sign-out is
also protected by that PIN, so an accidental tap cannot disconnect cloud sync.

If cloud sync is not configured, manual backup remains available:

1. On the device that already has the renewals, open **Settings → Local backup**
   and choose **Export backup**.
2. Send that JSON backup to the phone.
3. In the APK, choose **Restore backup** on the empty screen, or open
   **More → Vault settings → Import backup**.

The restored records stay on that phone and local notifications are scheduled
there. No payment credentials are imported.

## Connect live Firebase usage in the APK

The APK must call a deployed HTTPS backend. A private Google service-account key
must never be bundled into an APK.

1. Deploy the PicSecure Renew server/API (Cloudflare is supported by this repo).
2. Keep `FIREBASE_MONITOR_PROJECTS`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` only in the server environment.
3. Open the APK and go to **More → Vault settings → Data connection**.
4. Paste the deployed base address, for example
   `https://renew-api.example.workers.dev` (no `/api/firebase-usage` suffix).
5. Tap **Connect & refresh**, then choose **Firebase usage → Refresh**.

For a preconfigured private build, set `VITE_PICSECURE_API_BASE` in
`.env.local` before running `npm run android:sync`.

## Build the updated APK on Windows

```powershell
npm install
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

Debug APK:

`android\app\build\outputs\apk\debug\app-debug.apk`

Uninstall the older APK first if Android reports a signing conflict. Android may
cache the old launcher icon; reinstalling the app or restarting the launcher
clears that cache.

## Security

If a service-account private key was pasted into chat, email, screenshots or a
repository, revoke/delete that key in Google Cloud IAM and create a replacement.
The replacement belongs only in the backend environment.
