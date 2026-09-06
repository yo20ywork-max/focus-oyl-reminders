package com.focusoyl.app;

import android.content.SharedPreferences;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class FocusOylNotificationListenerService extends NotificationListenerService {
    private static final String PREFS = "focus_oyl";
    private static final String AUTOMATION_CONFIG_KEY = "focusOyl.automationConfig.v1";
    private static final String NOTIFICATION_BUFFER_KEY = "focusOyl.notificationBuffer.v1";
    private static final int MAX_BUFFERED_ITEMS = 80;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!notificationsAllowed()) {
            return;
        }

        CharSequence title = sbn.getNotification().extras.getCharSequence("android.title");
        CharSequence text = sbn.getNotification().extras.getCharSequence("android.text");

        if ((title == null || title.length() == 0) && (text == null || text.length() == 0)) {
            return;
        }

        persistNotification(sbn, title.toString(), text.toString());
    }

    private void persistNotification(StatusBarNotification sbn, String title, String text) {
        SharedPreferences prefs = getSharedPreferences(PREFS, 0);
        JSONArray next = new JSONArray();

        try {
            JSONArray current = new JSONArray(prefs.getString(NOTIFICATION_BUFFER_KEY, "[]"));
            int start = Math.max(0, current.length() - MAX_BUFFERED_ITEMS + 1);
            for (int index = start; index < current.length(); index += 1) {
                next.put(current.getJSONObject(index));
            }

            JSONObject item = new JSONObject();
            item.put("id", sbn.getKey());
            item.put("source", "notifications");
            item.put("packageName", sbn.getPackageName());
            item.put("app", labelForPackage(sbn.getPackageName()));
            item.put("title", title);
            item.put("text", text);
            item.put("capturedAt", System.currentTimeMillis());
            next.put(item);
        } catch (JSONException ignored) {
            // If the local buffer is corrupted, start a fresh on-device buffer.
        }

        prefs.edit().putString(NOTIFICATION_BUFFER_KEY, next.toString()).apply();
    }

    private boolean notificationsAllowed() {
        SharedPreferences prefs = getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(AUTOMATION_CONFIG_KEY, "{}");
        try {
            JSONObject config = new JSONObject(raw);
            if (!config.optBoolean("enabled", false)) return false;
            JSONArray sources = config.optJSONArray("sources");
            if (sources == null) return false;
            for (int index = 0; index < sources.length(); index += 1) {
                if ("notifications".equals(sources.optString(index))) return true;
            }
        } catch (JSONException ignored) {
            return false;
        }
        return false;
    }

    private String labelForPackage(String packageName) {
        try {
            return getPackageManager().getApplicationLabel(
                getPackageManager().getApplicationInfo(packageName, 0)
            ).toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }
}
