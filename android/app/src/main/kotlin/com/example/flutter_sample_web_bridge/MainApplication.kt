package com.example.flutter_sample_web_bridge
import io.flutter.app.FlutterApplication;
import com.webengage.webengage_plugin.WebengageInitializer;
import com.webengage.sdk.android.WebEngageConfig;
import com.webengage.sdk.android.LocationTrackingStrategy;

class MainApplication :FlutterApplication(){
    override fun onCreate() {
        super.onCreate()
        val webEngageConfig = WebEngageConfig.Builder()
            .setWebEngageKey("YOUR_LICENSE_CODE")
            .setAutoGCMRegistrationFlag(false)
            .setLocationTrackingStrategy(LocationTrackingStrategy.ACCURACY_BEST)
            .setDebugMode(true) // only in development mode
            .build()
        WebengageInitializer.initialize(this, webEngageConfig)
    }

}