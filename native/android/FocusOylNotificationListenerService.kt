package com.focusoyl.app.nativebridge

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class FocusOylNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()

        if (title.isBlank() && text.isBlank()) return

        // MVP handoff target:
        // persist locally, then emit into the WebView via FocusOylNative when app is foregrounded.
        // Do not upload notification content.
    }
}
