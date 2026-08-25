# PicSecure Renew 0.4.0 — Cloudflare deployment

Cloudflare Workers hosts both the app and its two backend routes. The Google service-account key stays in Worker secrets and is never bundled into the EXE or APK.

## First deployment

```powershell
npm install
npx wrangler login
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
npx wrangler secret put FIREBASE_MONITOR_PROJECTS
npx wrangler secret put PICSECURE_ALLOWED_ORIGINS
npm run cloudflare:deploy
```

For `FIREBASE_MONITOR_PROJECTS`, enter:

```text
Development:pic-dev-f28a7,Staging:pic-staging-37f03,Production:pic-87b28
```

For `PICSECURE_ALLOWED_ORIGINS`, enter the installed-app origins plus the final website origin:

```text
capacitor://localhost,https://localhost,http://localhost,https://renew.yourdomain.com
```

## Connect the installed apps automatically

Copy the deployed HTTPS Worker URL into `.env.local`:

```text
VITE_PICSECURE_API_BASE=https://your-worker.workers.dev
```

Then rebuild the EXE/APK. Firebase Usage and domain RDAP checks will use that address automatically. You may also change it later inside **Settings → Data connection** without rebuilding.

## Custom domain

In Cloudflare Dashboard open **Workers & Pages → picsecure-renew → Settings → Domains & Routes → Add → Custom domain** and select the hostname you own. Update `VITE_PICSECURE_API_BASE` and `PICSECURE_ALLOWED_ORIGINS` to that final HTTPS hostname, then rebuild release apps.

## Important security action

The service-account private key previously pasted into chat must be revoked in Google Cloud IAM. Create a fresh key and add only the fresh value with `wrangler secret put`. Do not commit `.env.local`, JSON key files, or private keys to GitHub.
