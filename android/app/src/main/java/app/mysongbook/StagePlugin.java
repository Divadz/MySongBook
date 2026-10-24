package app.mysongbook;

import android.os.Build;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mode scène : plein écran (barres système masquées), touches de volume et
 * bouton retour transmis à l'appli au lieu de régler le son ou de la fermer.
 * MainActivity lui passe les touches par handleKey.
 */
@CapacitorPlugin(name = "Stage")
public class StagePlugin extends Plugin {

    private static StagePlugin instance;
    private volatile boolean active;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setActive(PluginCall call) {
        active = call.getBoolean("active", false);
        getActivity().runOnUiThread(() -> immersive(active));
        call.resolve();
    }

    @SuppressWarnings("deprecation")
    private void immersive(boolean on) {
        Window window = getActivity().getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = window.getInsetsController();
            if (c == null) return;
            if (on) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                c.show(WindowInsets.Type.systemBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    /** @return true si la touche est prise par le mode scène. */
    static boolean handleKey(KeyEvent event) {
        StagePlugin p = instance;
        if (p == null || !p.active) return false;
        String key;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_VOLUME_DOWN: key = "volumeDown"; break;
            case KeyEvent.KEYCODE_VOLUME_UP: key = "volumeUp"; break;
            case KeyEvent.KEYCODE_BACK: key = "back"; break;
            default: return false;
        }
        // Une seule action par appui : on ignore le relâchement et la répétition.
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            JSObject data = new JSObject();
            data.put("key", key);
            p.notifyListeners("key", data);
        }
        return true;
    }
}
