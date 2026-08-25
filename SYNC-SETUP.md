# PicSecure Renew 0.4.0 — automatic desktop and Android sync

PicSecure Renew keeps the local vault available offline and can automatically sync the same vault through Firebase Authentication and Cloud Firestore.

## 1. Configure the Production Firebase project

Use `pic-87b28` for the installed release app. In Firebase Console:

1. Open **Authentication → Sign-in method** and enable **Email/Password**.
2. Open **Firestore Database** and create a Standard database in production mode.
3. Open **Project settings → Your apps → Web app**. Create a Web app named `PicSecure Renew` if one is not present.
4. Copy the six Web App config values into `.env.local` using `.env.example` as the template.

The Web App API key is public configuration. Never put a service-account private key in any `VITE_` variable.

## 2. Deploy the private Firestore rules

Install the Firebase CLI once, sign in, then deploy only the included rules:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

Choose `pic-87b28`. The included rule allows each signed-in account to read and write only its own `users/{uid}` vault.

## 3. Build the installed apps

Keep `.env.local` in the project root, then run:

```powershell
npm install
npm run desktop:build
npm run android:sync
```

Open `android` in Android Studio and build the APK. Sign in once from **Settings → Device sync** on Windows and Android using the same email and password. The first device uploads its existing local records; the other device receives them automatically. Later changes sync in realtime. Offline changes remain local and are uploaded when the connection returns.

The existing PIN/fingerprint lock remains device-local and separate from the Firebase account password.
