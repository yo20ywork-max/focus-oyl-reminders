package com.focusoyl.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "focus_oyl";
    private static final String PENDING_SHARE_KEY = "focusOyl.pendingShare.v1";
    private static final String PENDING_OPEN_KEY = "focusOyl.pendingOpen.v1";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FocusOylNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            persistSharedText(intent);
        }

        persistNotificationOpen(intent);
    }

    private void persistSharedText(Intent intent) {
        CharSequence rawText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        CharSequence rawSubject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        String text = rawText == null ? "" : rawText.toString();
        String subject = rawSubject == null ? "" : rawSubject.toString();

        if (text.trim().isEmpty() && subject.trim().isEmpty()) return;

        try {
            JSONObject payload = new JSONObject();
            payload.put("source", "android-share");
            payload.put("title", subject);
            payload.put("text", text);
            payload.put("receivedAt", System.currentTimeMillis());
            storeAndNotify(PENDING_SHARE_KEY, "focusoyl:sharedText", payload);
        } catch (JSONException ignored) {
            // Ignore malformed share payloads; plain text shares should not throw.
        }
    }

    private void persistNotificationOpen(Intent intent) {
        String signalId = intent.getStringExtra("focusOylSignalId");
        String url = intent.getStringExtra("url");
        if ((signalId == null || signalId.isEmpty()) && (url == null || url.isEmpty())) return;

        try {
            JSONObject payload = new JSONObject();
            payload.put("source", "android-notification");
            payload.put("signalId", signalId == null ? "" : signalId);
            payload.put("url", url == null || url.isEmpty() ? "/#timeline" : url);
            payload.put("openedAt", System.currentTimeMillis());
            storeAndNotify(PENDING_OPEN_KEY, "focusoyl:nativeOpen", payload);
        } catch (JSONException ignored) {
            // Notification opens are a convenience; failing here should not block launch.
        }
    }

    private void storeAndNotify(String key, String eventName, JSONObject payload) {
        SharedPreferences prefs = getSharedPreferences(PREFS, 0);
        prefs.edit().putString(key, payload.toString()).apply();

        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent(eventName, payload.toString());
        }
    }
}
