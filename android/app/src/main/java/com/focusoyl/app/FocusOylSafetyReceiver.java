package com.focusoyl.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.telephony.SmsMessage;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

public class FocusOylSafetyReceiver extends BroadcastReceiver {
    private static final String PREFS = "focus_oyl";
    private static final String SAFETY_CONFIG_KEY = "focusOyl.safetyConfig.v1";
    private static final String CURRENT_SAFETY_KEY = "focusOyl.nativeSafetyCurrent.v1";
    private static final String PENDING_SAFETY_KEY = "focusOyl.pendingSafetyChecks.v1";
    private static final String PENDING_OPEN_KEY = "focusOyl.pendingOpen.v1";
    private static final String CHANNEL_ID = "focus_oyl_safety";
    private static final String ACTION_SAFE = "com.focusoyl.app.SAFETY_SAFE";
    private static final String ACTION_TIMEOUT = "com.focusoyl.app.SAFETY_TIMEOUT";
    private static final int MAX_PENDING = 40;
    private static final int DEFAULT_TIMEOUT_SECONDS = 30;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(action)) {
            handleSms(context, intent);
            return;
        }

        String id = intent.getStringExtra("id");
        if (ACTION_SAFE.equals(action)) {
            resolveSafetyCheck(context, id, "safe", false);
            return;
        }

        if (ACTION_TIMEOUT.equals(action)) {
            resolveSafetyCheck(context, id, "timeout", true);
        }
    }

    public static JSONObject startLocalCheck(Context context, JSONObject incoming, String mode) {
        JSONObject config = readConfig(context);
        String id = incoming.optString("id", "safe-" + UUID.randomUUID().toString());
        int timeoutSeconds = incoming.optInt("timeoutSeconds", config.optInt("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS));
        long requestedAt = System.currentTimeMillis();
        long expiresAt = requestedAt + Math.max(5, timeoutSeconds) * 1000L;

        JSONObject state = new JSONObject();
        try {
            state.put("id", id);
            state.put("mode", mode == null || mode.isEmpty() ? incoming.optString("mode", "network") : mode);
            state.put("status", "waiting");
            state.put("requestedAt", requestedAt);
            state.put("expiresAt", expiresAt);
            state.put("timeoutSeconds", timeoutSeconds);
            state.put("locationFallback", config.optBoolean("locationFallback", incoming.optBoolean("locationFallback", false)));
            state.put("smsFallback", config.optBoolean("smsFallback", incoming.optBoolean("smsFallback", false)));
            state.put("familyName", safeString(config.optString("familyName", incoming.optString("familyName", ""))));
            state.put("familyPhone", safeString(config.optString("familyPhone", incoming.optString("familyPhone", ""))));
            state.put("backupPhone", safeString(config.optString("backupPhone", incoming.optString("backupPhone", ""))));
            state.put("sourcePhone", safeString(incoming.optString("sourcePhone", "")));
            state.put("testMode", config.optBoolean("testMode", incoming.optBoolean("testMode", true)));
            state.put("locationShared", false);
        } catch (JSONException ignored) {
            // State will still be persisted as far as possible.
        }

        persistCurrent(context, state);
        appendPending(context, state);
        scheduleTimeout(context, id, expiresAt);
        showSafetyNotification(context, state);
        persistOpen(context, id);
        return state;
    }

    public static JSONObject resolveSafetyCheck(Context context, String id, String action, boolean allowLocation) {
        JSONObject state = readCurrent(context);
        String currentId = state.optString("id", "");
        if (id != null && !id.isEmpty() && !id.equals(currentId)) return state;
        if (!"waiting".equals(state.optString("status", ""))) return state;

        cancelTimeout(context, currentId);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(notificationIdFor(currentId));

        long now = System.currentTimeMillis();
        try {
            if ("safe".equals(action)) {
                state.put("status", "safe");
                state.put("respondedAt", now);
                state.put("locationShared", false);
                sendSafeSmsIfAllowed(context, state);
            } else {
                state.put("status", "missed");
                state.put("timedOutAt", now);
                if (allowLocation && state.optBoolean("locationFallback", false)) {
                    sendLocationFallbackIfAllowed(context, state);
                }
            }
        } catch (JSONException ignored) {
            // Keep receiver resilient.
        }

        persistCurrent(context, state);
        appendPending(context, state);
        persistOpen(context, currentId);
        return state;
    }

    public static JSONArray consumePendingSafetyChecks(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(PENDING_SAFETY_KEY, "[]");
        prefs.edit().remove(PENDING_SAFETY_KEY).apply();
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private void handleSms(Context context, Intent intent) {
        JSONObject config = readConfig(context);
        if (!config.optBoolean("smsFallback", false)) return;

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String sender = "";
        for (SmsMessage message : messages) {
            if (message == null) continue;
            body.append(message.getMessageBody() == null ? "" : message.getMessageBody());
            if (sender.isEmpty()) sender = safeString(message.getOriginatingAddress());
        }

        if (!isSafetyCommand(body.toString())) return;
        if (!isTrustedSender(config, sender)) return;

        JSONObject check = new JSONObject();
        try {
            check.put("id", "safe-sms-" + System.currentTimeMillis());
            check.put("mode", "sms");
            check.put("sourcePhone", sender);
            check.put("timeoutSeconds", config.optInt("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS));
        } catch (JSONException ignored) {
            // Plain object defaults are enough.
        }

        startLocalCheck(context, check, "sms");
    }

    private static boolean isSafetyCommand(String body) {
        String normalized = body == null ? "" : body.trim().toUpperCase();
        return "SAFE_CHECK".equals(normalized) || normalized.startsWith("SAFE_CHECK ");
    }

    private static boolean isTrustedSender(String configuredPhone, String sender) {
        String configured = digitsOnly(configuredPhone);
        String incoming = digitsOnly(sender);
        if (configured.isEmpty() || incoming.isEmpty()) return false;
        return incoming.endsWith(configured) || configured.endsWith(incoming);
    }

    private static boolean isTrustedSender(JSONObject config, String sender) {
        return isTrustedSender(config.optString("familyPhone", ""), sender)
            || isTrustedSender(config.optString("backupPhone", ""), sender);
    }

    private static void showSafetyNotification(Context context, JSONObject state) {
        if (Build.VERSION.SDK_INT >= 33
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        ensureChannel(manager);

        String id = state.optString("id", "");
        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent == null) openIntent = new Intent(context, MainActivity.class);
        openIntent.putExtra("focusOylSafetyId", id);
        openIntent.putExtra("url", "/#safety");
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationIdFor(id),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent safeIntent = safetyActionIntent(context, ACTION_SAFE, id, "safe");

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);

        Notification notification = builder
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Focus Oyl 安全確認")
            .setContentText("家人正在確認你是否安全。請按「我沒事」。")
            .setContentIntent(contentIntent)
            .setAutoCancel(false)
            .setOngoing(true)
            .setShowWhen(true)
            .setVibrate(new long[] { 0L, 260L, 120L, 260L })
            .setPriority(Notification.PRIORITY_HIGH)
            .setCategory(Notification.CATEGORY_ALARM)
            .addAction(R.mipmap.ic_launcher, "我沒事", safeIntent)
            .build();

        manager.notify(notificationIdFor(id), notification);
    }

    private static void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Focus Oyl safety checks",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Urgent family safety checks started by Focus Oyl.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private static PendingIntent safetyActionIntent(Context context, String action, String id, String suffix) {
        Intent intent = new Intent(context, FocusOylSafetyReceiver.class);
        intent.setAction(action);
        intent.putExtra("id", id);
        return PendingIntent.getBroadcast(
            context,
            notificationIdFor(id + "-" + suffix),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void scheduleTimeout(Context context, String id, long expiresAt) {
        PendingIntent pendingIntent = safetyActionIntent(context, ACTION_TIMEOUT, id, "timeout");
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, expiresAt, pendingIntent);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, expiresAt, pendingIntent);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, expiresAt, pendingIntent);
        }
    }

    private static void cancelTimeout(Context context, String id) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        PendingIntent pendingIntent = safetyActionIntent(context, ACTION_TIMEOUT, id, "timeout");
        alarmManager.cancel(pendingIntent);
        pendingIntent.cancel();
    }

    private static void sendSafeSmsIfAllowed(Context context, JSONObject state) throws JSONException {
        if (!"sms".equals(state.optString("mode", ""))) return;
        if (state.optBoolean("testMode", true)) {
            state.put("safeReplySent", false);
            state.put("safeReplyStatus", "test-mode");
            return;
        }
        String phone = safetyReplyPhone(state);
        if (phone.isEmpty() || !canSendSms(context)) return;
        SmsManager.getDefault().sendTextMessage(phone, null, "Focus Oyl: 我沒事。", null, null);
        state.put("safeReplySent", true);
    }

    private static void sendLocationFallbackIfAllowed(Context context, JSONObject state) throws JSONException {
        String phone = safetyReplyPhone(state);
        if (state.optBoolean("testMode", true)) {
            state.put("locationShared", false);
            state.put("locationStatus", "test-mode");
            state.put("status", "location-sent");
            return;
        }
        if (phone.isEmpty() || !canSendSms(context)) {
            state.put("locationStatus", "missing-sms-permission-or-family-phone");
            return;
        }

        Location location = lastKnownLocation(context);
        String message = "Focus Oyl: 安全確認逾時。";
        if (location != null) {
            String map = "https://maps.google.com/?q=" + location.getLatitude() + "," + location.getLongitude();
            message += " 目前位置: " + map;
            state.put("locationShared", true);
            state.put("locationStatus", "sent");
            state.put("latitude", location.getLatitude());
            state.put("longitude", location.getLongitude());
        } else {
            message += " 目前無法取得定位。";
            state.put("locationShared", false);
            state.put("locationStatus", "location-unavailable");
        }

        SmsManager.getDefault().sendTextMessage(phone, null, message, null, null);
        state.put("status", "location-sent");
    }

    private static String safetyReplyPhone(JSONObject state) {
        String sourcePhone = safeString(state.optString("sourcePhone", ""));
        String familyPhone = safeString(state.optString("familyPhone", ""));
        String backupPhone = safeString(state.optString("backupPhone", ""));
        if (!sourcePhone.isEmpty()) return sourcePhone;
        return familyPhone.isEmpty() ? backupPhone : familyPhone;
    }

    private static boolean canSendSms(Context context) {
        return context.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    private static Location lastKnownLocation(Context context) {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }

        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return null;
        Location best = null;
        for (String provider : manager.getProviders(true)) {
            try {
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate == null) continue;
                if (best == null || candidate.getTime() > best.getTime()) best = candidate;
            } catch (SecurityException ignored) {
                return null;
            }
        }
        return best;
    }

    private static JSONObject readConfig(Context context) {
        String raw = context.getSharedPreferences(PREFS, 0).getString(SAFETY_CONFIG_KEY, "{}");
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static JSONObject readCurrent(Context context) {
        String raw = context.getSharedPreferences(PREFS, 0).getString(CURRENT_SAFETY_KEY, "{}");
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static void persistCurrent(Context context, JSONObject state) {
        context.getSharedPreferences(PREFS, 0)
            .edit()
            .putString(CURRENT_SAFETY_KEY, state.toString())
            .apply();
    }

    private static void appendPending(Context context, JSONObject state) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        JSONArray next = new JSONArray();
        try {
            JSONArray current = new JSONArray(prefs.getString(PENDING_SAFETY_KEY, "[]"));
            int start = Math.max(0, current.length() - MAX_PENDING + 1);
            for (int index = start; index < current.length(); index += 1) {
                next.put(current.getJSONObject(index));
            }
            next.put(state);
        } catch (JSONException ignored) {
            next.put(state);
        }
        prefs.edit().putString(PENDING_SAFETY_KEY, next.toString()).apply();
    }

    private static void persistOpen(Context context, String id) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("source", "android-safety");
            payload.put("safetyCheckId", id == null ? "" : id);
            payload.put("url", "/#safety");
            payload.put("openedAt", System.currentTimeMillis());
            context.getSharedPreferences(PREFS, 0)
                .edit()
                .putString(PENDING_OPEN_KEY, payload.toString())
                .apply();
        } catch (JSONException ignored) {
            // Opening the app is best effort.
        }
    }

    private static int notificationIdFor(String id) {
        if (id == null || id.isEmpty()) return 2001;
        return Math.abs(("focus-oyl-safety-" + id).hashCode());
    }

    private static String safeString(String value) {
        return value == null ? "" : value.trim();
    }

    private static String digitsOnly(String value) {
        return safeString(value).replaceAll("[^0-9]", "");
    }
}
