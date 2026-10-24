package app.mysongbook;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Accès au stockage partagé de la tablette, où l'outil de synchro (Autosync)
 * dépose la bibliothèque. Sous Android 11 et plus, lire des .cho hors de
 * l'appli demande l'autorisation « accès à tous les fichiers », accordée par
 * l'utilisateur dans les réglages système.
 */
@CapacitorPlugin(name = "StorageAccess")
public class StorageAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", granted());
        ret.put("root", Environment.getExternalStorageDirectory().getAbsolutePath());
        call.resolve(ret);
    }

    /** Ouvre la page des réglages où l'utilisateur accorde l'accès ; l'appli revérifie au retour. */
    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            try {
                getActivity().startActivity(intent);
            } catch (Exception e) {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
        } else {
            getActivity().requestPermissions(
                new String[] { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 1);
        }
        call.resolve();
    }
}
