package com.focusoyl.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.IntentFilter;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "FocusOylNative",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "photos"),
        @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = "calendar"),
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "postNotifications"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS }, alias = "sms")
    }
)
public class FocusOylNativePlugin extends Plugin {
    private static final String PREFS = "focus_oyl";
    private static final String CONSENT_KEY = "focusOyl.nativeConsents.v1";
    private static final String AUTOMATION_CONFIG_KEY = "focusOyl.automationConfig.v1";
    private static final String SAFETY_CONFIG_KEY = "focusOyl.safetyConfig.v1";
    private static final String NOTIFICATION_BUFFER_KEY = "focusOyl.notificationBuffer.v1";
    private static final String PENDING_SHARE_KEY = "focusOyl.pendingShare.v1";
    private static final String PENDING_OPEN_KEY = "focusOyl.pendingOpen.v1";
    private static final String PENDING_ACTIONS_KEY = "focusOyl.pendingActions.v1";
    private static final String PENDING_SAFETY_KEY = "focusOyl.pendingSafetyChecks.v1";

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject sources = new JSObject();
        sources.put("photos", "available");
        sources.put("calendar", "available");
        sources.put("contacts", "available");
        sources.put("files", "available");
        sources.put("notifications", "available");
        sources.put("chats", "limited");
        sources.put("sms", "restricted");
        sources.put("location", "permission-required");

        JSObject safetyCheck = new JSObject();
        safetyCheck.put("networkPush", "requires-service");
        safetyCheck.put("smsFallback", "android-native");
        safetyCheck.put("timeoutLocation", "permission-required");

        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("native", true);
        result.put("sources", sources);
        result.put("safetyCheck", safetyCheck);
        call.resolve(result);
    }

    @PluginMethod
    public void getDeviceHealth(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("platform", "android");
        result.put("native", true);
        result.put("online", isOnline());
        result.put("notificationPermission", getPermissionState("postNotifications") == PermissionState.GRANTED ? "granted" : "not-granted");
        result.put("canScheduleExactAlarms", canScheduleExactAlarms());
        result.put("powerSaveMode", isPowerSaveMode());
        result.put("batteryOptimizationIgnored", isIgnoringBatteryOptimizations());
        result.put("checkedAt", System.currentTimeMillis());

        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            if (level >= 0 && scale > 0) {
                result.put("batteryLevel", Math.round((level * 100.0f) / scale));
            }
            result.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
        }

        call.resolve(result);
    }

    @PluginMethod
    public void saveConsent(PluginCall call) {
        JSArray sources = call.getArray("sources", new JSArray());
        getActivity()
            .getSharedPreferences(PREFS, 0)
            .edit()
            .putString(CONSENT_KEY, sources.toString())
            .apply();

        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getConsent(PluginCall call) {
        String raw = getActivity()
            .getSharedPreferences(PREFS, 0)
            .getString(CONSENT_KEY, "[]");

        JSObject result = new JSObject();
        result.put("sourcesRaw", raw);
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        consumePendingPayload(call, PENDING_SHARE_KEY);
    }

    @PluginMethod
    public void consumePendingOpen(PluginCall call) {
        consumePendingPayload(call, PENDING_OPEN_KEY);
    }

    @PluginMethod
    public void consumePendingActions(PluginCall call) {
        SharedPreferences prefs = getActivity().getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(PENDING_ACTIONS_KEY, "[]");
        prefs.edit().remove(PENDING_ACTIONS_KEY).apply();

        JSObject result = new JSObject();
        try {
            result.put("ok", true);
            result.put("actions", new JSArray(raw));
        } catch (JSONException error) {
            result.put("ok", false);
            result.put("actions", new JSArray());
            result.put("reason", "invalid pending actions");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingSafetyChecks(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        try {
            result.put("checks", new JSArray(FocusOylSafetyReceiver.consumePendingSafetyChecks(getContext()).toString()));
        } catch (JSONException error) {
            result.put("checks", new JSArray());
            result.put("ok", false);
            result.put("reason", "invalid pending safety checks");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestDataSource(PluginCall call) {
        String source = call.getString("source", "");
        String alias = aliasForSource(source);

        if ("notifications".equals(source)) {
            openNotificationListenerSettings(call);
            return;
        }

        if ("exactAlarm".equals(source)) {
            openExactAlarmSettings(call);
            return;
        }

        if ("batteryOptimization".equals(source)) {
            openBatteryOptimizationSettings(call);
            return;
        }

        if (alias == null) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("source", source);
            result.put("reason", "Use Android share sheet, document picker, or official provider APIs.");
            call.resolve(result);
            return;
        }

        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "permissionCallback");
            return;
        }

        resolvePermission(call, source, true);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        String source = call.getString("source", "");
        String alias = aliasForSource(source);
        boolean granted = alias != null && getPermissionState(alias) == PermissionState.GRANTED;
        resolvePermission(call, source, granted);
    }

    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void scheduleLocalReminder(PluginCall call) {
        JSObject reminder = call.getObject("reminder", new JSObject());
        String id = reminder.optString("id", UUID.randomUUID().toString());
        long atMillis = parseReminderTime(reminder.optString("at", reminder.optString("remindAt", "")));

        Intent intent = new Intent(getContext(), FocusOylReminderReceiver.class);
        intent.putExtra("id", id);
        intent.putExtra("title", reminder.optString("title", "Focus Oyl"));
        intent.putExtra("body", reminder.optString("body", "Focus on your life"));
        intent.putExtra("url", reminder.optString("url", "/#timeline"));

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            requestCodeFor(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("id", id);
        result.put("at", atMillis);
        result.put("scheduler", "AlarmManager");
        call.resolve(result);
    }

    @PluginMethod
    public void configureAutomation(PluginCall call) {
        JSObject config = call.getObject("config", new JSObject());
        getActivity()
            .getSharedPreferences(PREFS, 0)
            .edit()
            .putString(AUTOMATION_CONFIG_KEY, config.toString())
            .apply();

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("localOnly", true);
        call.resolve(result);
    }

    @PluginMethod
    public void configureSafetyCheck(PluginCall call) {
        JSObject config = call.getObject("config", new JSObject());
        getActivity()
            .getSharedPreferences(PREFS, 0)
            .edit()
            .putString(SAFETY_CONFIG_KEY, config.toString())
            .apply();

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("localOnly", true);
        result.put("smsFallback", config.optBoolean("smsFallback", false));
        result.put("locationFallback", config.optBoolean("locationFallback", false));
        result.put("testMode", config.optBoolean("testMode", true));
        result.put("familyName", config.optString("familyName", ""));
        result.put("backupPhone", config.optString("backupPhone", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void startSafetyCheck(PluginCall call) {
        JSObject check = call.getObject("check", new JSObject());
        JSONObject nativeState = FocusOylSafetyReceiver.startLocalCheck(getContext(), check, check.optString("mode", "network"));
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("id", nativeState.optString("id", check.optString("id", "")));
        result.put("timeoutSeconds", nativeState.optInt("timeoutSeconds", check.optInt("timeoutSeconds", 30)));
        result.put("nativeReady", true);
        putNativeState(result, nativeState);
        call.resolve(result);
    }

    @PluginMethod
    public void resolveSafetyCheck(PluginCall call) {
        String action = call.getString("action", "");
        boolean wantsLocation = call.getBoolean("shareLocation", false);
        String id = call.getString("id", "");
        JSONObject nativeState = FocusOylSafetyReceiver.resolveSafetyCheck(
            getContext(),
            id,
            "timeout".equals(action) ? "timeout" : "safe",
            wantsLocation
        );
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("action", action);
        result.put("locationShared", nativeState.optBoolean("locationShared", false));
        result.put("requiresLocationPermission", wantsLocation && getPermissionState("location") != PermissionState.GRANTED);
        putNativeState(result, nativeState);
        call.resolve(result);
    }

    @PluginMethod
    public void scanConsentedSources(PluginCall call) {
        JSArray requested = call.getArray("sources", new JSArray());
        JSArray items = new JSArray();
        long sinceMillis = parseOptionalTime(call.getString("since", ""));

        if (containsSource(requested, "notifications")) {
            appendBufferedNotifications(items, sinceMillis);
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("platform", "android");
        result.put("items", items);
        result.put("localOnly", true);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelLocalReminder(PluginCall call) {
        JSObject reminder = call.getObject("reminder", new JSObject());
        String id = reminder.optString("id", "");
        if (id.isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("reason", "missing id");
            call.resolve(result);
            return;
        }

        Intent intent = new Intent(getContext(), FocusOylReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            requestCodeFor(id),
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null && pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("id", id);
        call.resolve(result);
    }

    private String aliasForSource(String source) {
        switch (source) {
            case "photos":
                return "photos";
            case "calendar":
                return "calendar";
            case "contacts":
                return "contacts";
            case "location":
            case "safetyLocation":
                return "location";
            case "sms":
            case "safetySms":
                return "sms";
            case "postNotifications":
            case "notificationsPermission":
                return "postNotifications";
            default:
                return null;
        }
    }

    private void openExactAlarmSettings(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("source", "exactAlarm");

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("granted", true);
            result.put("reason", "exact alarms do not require a special setting on this Android version");
            call.resolve(result);
            return;
        }

        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        boolean canSchedule = alarmManager != null && alarmManager.canScheduleExactAlarms();
        result.put("granted", canSchedule);
        if (!canSchedule) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
            getActivity().startActivity(intent);
            result.put("opened", "exact_alarm_settings");
        }
        call.resolve(result);
    }

    private void openBatteryOptimizationSettings(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("source", "batteryOptimization");
        boolean ignored = isIgnoringBatteryOptimizations();
        result.put("granted", ignored);

        if (!ignored) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
                getActivity().startActivity(intent);
                result.put("opened", "battery_optimization_request");
            } catch (Exception ignoredError) {
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                getActivity().startActivity(intent);
                result.put("opened", "battery_optimization_settings");
            }
        }
        call.resolve(result);
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = manager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        }
        android.net.NetworkInfo info = manager.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    private boolean canScheduleExactAlarms() {
        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return false;
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms();
    }

    private boolean isPowerSaveMode() {
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return manager != null && manager.isPowerSaveMode();
    }

    private boolean isIgnoringBatteryOptimizations() {
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return manager != null && manager.isIgnoringBatteryOptimizations(getActivity().getPackageName());
    }

    private void resolvePermission(PluginCall call, String source, boolean granted) {
        JSObject result = new JSObject();
        result.put("ok", granted);
        result.put("source", source);
        result.put("granted", granted);
        call.resolve(result);
    }

    private void putNativeState(JSObject result, JSONObject nativeState) {
        try {
            result.put("state", JSObject.fromJSONObject(nativeState));
        } catch (JSONException error) {
            result.put("stateRaw", nativeState.toString());
        }
    }

    private void openNotificationListenerSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("opened", "notification_listener_settings");
        call.resolve(result);
    }

    private boolean containsSource(JSArray sources, String source) {
        for (int index = 0; index < sources.length(); index += 1) {
            try {
                if (source.equals(sources.getString(index))) return true;
            } catch (JSONException ignored) {
                try {
                    JSONObject item = sources.getJSONObject(index);
                    if (source.equals(item.optString("id"))) return true;
                } catch (JSONException ignoredObject) {
                    // Ignore malformed source entries.
                }
            }
        }
        return false;
    }

    private void appendBufferedNotifications(JSArray items, long sinceMillis) {
        SharedPreferences prefs = getActivity().getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(NOTIFICATION_BUFFER_KEY, "[]");
        try {
            JSONArray buffered = new JSONArray(raw);
            for (int index = 0; index < buffered.length(); index += 1) {
                JSONObject source = buffered.getJSONObject(index);
                long capturedAt = source.optLong("capturedAt");
                if (sinceMillis > 0 && capturedAt <= sinceMillis) continue;
                JSObject item = new JSObject();
                item.put("id", source.optString("id"));
                item.put("source", source.optString("source", "notifications"));
                item.put("packageName", source.optString("packageName"));
                item.put("app", source.optString("app"));
                item.put("title", source.optString("title"));
                item.put("text", source.optString("text"));
                item.put("capturedAt", capturedAt);
                items.put(item);
            }
        } catch (JSONException ignored) {
            // Keep the local scan resilient; malformed buffers are treated as empty.
        }
    }

    private void consumePendingPayload(PluginCall call, String key) {
        SharedPreferences prefs = getActivity().getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(key, "");
        prefs.edit().remove(key).apply();

        if (raw == null || raw.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("ok", true);
            empty.put("hasPayload", false);
            call.resolve(empty);
            return;
        }

        try {
            JSObject payload = JSObject.fromJSONObject(new JSONObject(raw));
            payload.put("ok", true);
            payload.put("hasPayload", true);
            call.resolve(payload);
        } catch (JSONException error) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("hasPayload", false);
            result.put("reason", "invalid pending payload");
            call.resolve(result);
        }
    }

    private int requestCodeFor(String id) {
        return Math.abs(("focus-oyl-" + id).hashCode());
    }

    private long parseOptionalTime(String raw) {
        if (raw == null || raw.isEmpty()) return 0L;
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX"
        };

        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsed = format.parse(raw);
                if (parsed != null) return parsed.getTime();
            } catch (ParseException ignored) {
                // Try the next ISO-8601 pattern.
            }
        }

        return 0L;
    }

    private long parseReminderTime(String raw) {
        long fallback = System.currentTimeMillis() + 5000L;
        if (raw == null || raw.isEmpty()) return fallback;

        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX"
        };

        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsed = format.parse(raw);
                if (parsed != null) return Math.max(parsed.getTime(), System.currentTimeMillis() + 1000L);
            } catch (ParseException ignored) {
                // Try the next ISO-8601 pattern.
            }
        }

        return fallback;
    }
}
