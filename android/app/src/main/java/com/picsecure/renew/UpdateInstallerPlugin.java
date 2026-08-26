package com.picsecure.renew;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "UpdateInstaller")
public class UpdateInstallerPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        executor.execute(this::clearCachedUpdates);
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String source = call.getString("url", "");
        String fileName = call.getString("fileName", "PicSecure-Renew-update.apk");
        if (!source.startsWith("https://github.com/ananth8660-picSecure/PicSecure-Renewal/")) {
            call.reject("Only the verified PicSecure Renew GitHub release is allowed.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            permission.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(permission);
            JSObject result = new JSObject();
            result.put("status", "permission_required");
            call.resolve(result);
            return;
        }
        executor.execute(() -> downloadAndOpen(call, source, fileName.replaceAll("[^A-Za-z0-9._-]", "_")));
    }

    private void downloadAndOpen(PluginCall call, String source, String fileName) {
        HttpURLConnection connection = null;
        try {
            File updates = new File(getContext().getCacheDir(), "verified-updates");
            if (!updates.exists() && !updates.mkdirs()) throw new IllegalStateException("Update cache could not be created.");
            clearCachedUpdates();
            File apk = new File(updates, fileName);
            connection = (HttpURLConnection) new URL(source).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("User-Agent", "PicSecure-Renew-Android-Updater");
            connection.connect();
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) throw new IllegalStateException("Update download returned " + connection.getResponseCode());
            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(apk, false)) {
                byte[] buffer = new byte[32768];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                output.flush();
            }
            if (apk.length() < 1024 * 1024) throw new IllegalStateException("Downloaded update is incomplete.");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().runOnUiThread(() -> {
                try {
                    getContext().startActivity(install);
                    JSObject result = new JSObject();
                    result.put("status", "installer_opened");
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("Android installer could not be opened.", error);
                }
            });
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Update download failed." : error.getMessage(), error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void clearCachedUpdates() {
        File updates = new File(getContext().getCacheDir(), "verified-updates");
        File[] cachedFiles = updates.listFiles();
        if (cachedFiles == null) return;
        for (File cachedFile : cachedFiles) {
            if (cachedFile.isFile() && !cachedFile.delete()) {
                cachedFile.deleteOnExit();
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
