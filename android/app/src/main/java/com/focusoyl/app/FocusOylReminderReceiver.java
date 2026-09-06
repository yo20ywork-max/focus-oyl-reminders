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
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class FocusOylReminderReceiver extends BroadcastReceiver {
    private static final String PREFS = "focus_oyl";
    private static final String CHANNEL_ID = "focus_oyl_reminders";
    private static final String PENDING_ACTIONS_KEY = "focusOyl.pendingActions.v1";
    private static final String ACTION_SHOW = "com.focusoyl.app.SHOW_REMINDER";
    private static final String ACTION_DONE = "com.focusoyl.app.COMPLETE_REMINDER";
    private static final String ACTION_SNOOZE = "com.focusoyl.app.SNOOZE_REMINDER";
    private static final int MAX_PENDING_ACTIONS = 80;
    private static final long SNOOZE_MILLIS = 30L * 60L * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String url = intent.getStringExtra("url");

        if (ACTION_DONE.equals(action)) {
            persistAction(context, id, "completed", 0L);
            cancelNotificationAndAlarms(context, id);
            return;
        }

        if (ACTION_SNOOZE.equals(action)) {
            long remindAt = System.currentTimeMillis() + SNOOZE_MILLIS;
            persistAction(context, id, "snoozed", remindAt);
            cancelNotificationAndAlarms(context, id);
            scheduleSnoozedReminder(context, rootSignalId(id), title, body, url, remindAt);
            return;
        }

        if (Build.VERSION.SDK_INT >= 33
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (title == null || title.isEmpty()) title = "Focus Oyl";
        if (body == null || body.isEmpty()) body = "Focus on your life";
        if (url == null || url.isEmpty()) url = "/#timeline";

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        ensureChannel(manager);

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent == null) {
            openIntent = new Intent(context, MainActivity.class);
        }
        openIntent.putExtra("focusOylSignalId", id);
        openIntent.putExtra("url", url);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationIdFor(id),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent doneIntent = actionIntent(context, ACTION_DONE, id, title, body, url, "done");
        PendingIntent snoozeIntent = actionIntent(context, ACTION_SNOOZE, id, title, body, url, "snooze");

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);

        Notification notification = builder
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setShowWhen(true)
            .addAction(R.mipmap.ic_launcher, "完成", doneIntent)
            .addAction(R.mipmap.ic_launcher, "稍後", snoozeIntent)
            .build();

        manager.notify(notificationIdFor(id), notification);
    }

    private void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Focus Oyl reminders",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Local reminders scheduled by Focus Oyl on this device.");
        manager.createNotificationChannel(channel);
    }

    private int notificationIdFor(String id) {
        if (id == null || id.isEmpty()) return 1001;
        return Math.abs(("focus-oyl-" + id).hashCode());
    }

    private PendingIntent actionIntent(
        Context context,
        String action,
        String id,
        String title,
        String body,
        String url,
        String suffix
    ) {
        Intent intent = new Intent(context, FocusOylReminderReceiver.class);
        intent.setAction(action);
        intent.putExtra("id", id);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("url", url);
        return PendingIntent.getBroadcast(
            context,
            notificationIdFor(id + "-" + suffix),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void scheduleSnoozedReminder(Context context, String id, String title, String body, String url, long remindAt) {
        Intent intent = new Intent(context, FocusOylReminderReceiver.class);
        intent.putExtra("id", id);
        intent.putExtra("title", title == null || title.isEmpty() ? "Focus Oyl" : title);
        intent.putExtra("body", body == null || body.isEmpty() ? "Focus on your life" : body);
        intent.putExtra("url", url == null || url.isEmpty() ? "/#timeline" : url);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            notificationIdFor(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, remindAt, pendingIntent);
        }
    }

    private void cancelNotificationAndAlarms(Context context, String id) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(notificationIdFor(id));
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        for (String candidate : relatedReminderIds(id)) {
            Intent intent = new Intent(context, FocusOylReminderReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                notificationIdFor(candidate),
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        }
    }

    private String[] relatedReminderIds(String id) {
        String root = rootSignalId(id);
        return new String[] { root, root + "-followup-1", root + "-followup-2" };
    }

    private String rootSignalId(String id) {
        if (id == null || id.isEmpty()) return "";
        return id.replaceAll("-followup-\\d+$", "");
    }

    private void persistAction(Context context, String id, String action, long remindAt) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        JSONArray next = new JSONArray();
        try {
            JSONArray current = new JSONArray(prefs.getString(PENDING_ACTIONS_KEY, "[]"));
            int start = Math.max(0, current.length() - MAX_PENDING_ACTIONS + 1);
            for (int index = start; index < current.length(); index += 1) {
                next.put(current.getJSONObject(index));
            }

            JSONObject item = new JSONObject();
            item.put("id", id == null ? "" : id);
            item.put("rootId", rootSignalId(id));
            item.put("action", action);
            item.put("at", System.currentTimeMillis());
            if (remindAt > 0L) item.put("remindAt", remindAt);
            next.put(item);
        } catch (JSONException ignored) {
            // If the local action buffer is corrupted, keep the receiver resilient.
        }

        prefs.edit().putString(PENDING_ACTIONS_KEY, next.toString()).apply();
    }
}
