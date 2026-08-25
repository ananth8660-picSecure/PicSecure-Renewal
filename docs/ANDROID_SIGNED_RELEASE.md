# PicSecure Renew signed Android release

The release build intentionally stops when signing is not configured. This
prevents an unusable `app-release-unsigned.apk` from being mistaken for the
production APK.

## One-time setup on Windows

Keep the keystore outside the repository. If this app already has a keystore,
reuse it. Creating a different key prevents future APK updates over the
installed app.

If no release keystore exists yet, run:

```cmd
mkdir "%USERPROFILE%\PicSecureKeys"
keytool -genkeypair -v -keystore "%USERPROFILE%\PicSecureKeys\picsecure-renew-release.jks" -alias picsecure-renew -keyalg RSA -keysize 2048 -validity 10000
```

Copy the safe template:

```cmd
copy android\keystore.properties.example android\keystore.properties
notepad android\keystore.properties
```

Replace all placeholders with the real keystore path, alias and passwords.
Use forward slashes in the `storeFile` Windows path. The real properties file
and all `.jks`/`.keystore` files are ignored by Git.

## Build the signed APK

From the project root:

```cmd
npm run android:release
```

The signed production APK is created at:

```text
android\app\build\outputs\apk\release\app-release.apk
```

Keep the keystore and both passwords backed up securely. Do not paste them in
chat, source files, GitHub, or Firebase frontend configuration.
