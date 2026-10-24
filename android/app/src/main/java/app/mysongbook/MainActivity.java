package app.mysongbook;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        registerPlugin(StagePlugin.class);
        super.onCreate(savedInstanceState);
        // Sur scène, l'écran ne doit pas se mettre en veille pendant un morceau.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (StagePlugin.handleKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }
}
