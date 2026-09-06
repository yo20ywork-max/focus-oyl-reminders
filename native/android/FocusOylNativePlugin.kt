package com.focusoyl.app.nativebridge

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FocusOylNative")
class FocusOylNativePlugin : Plugin() {
    private val consentKey = "focusOyl.nativeConsents.v1"

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val sources = JSObject()
        sources.put("photos", "available")
        sources.put("calendar", "available")
        sources.put("contacts", "available")
        sources.put("files", "available")
        sources.put("notifications", "available")
        sources.put("chats", "limited")
        sources.put("sms", "restricted")

        val result = JSObject()
        result.put("platform", "android")
        result.put("native", true)
        result.put("sources", sources)
        call.resolve(result)
    }

    @PluginMethod
    fun saveConsent(call: PluginCall) {
        val sources = call.getArray("sources", JSArray())
        bridge.activity
            .getSharedPreferences("focus_oyl", 0)
            .edit()
            .putString(consentKey, sources.toString())
            .apply()

        val result = JSObject()
        result.put("ok", true)
        call.resolve(result)
    }

    @PluginMethod
    fun getConsent(call: PluginCall) {
        val raw = bridge.activity
            .getSharedPreferences("focus_oyl", 0)
            .getString(consentKey, "[]")

        val result = JSObject()
        result.put("sourcesRaw", raw)
        call.resolve(result)
    }

    @PluginMethod
    fun requestDataSource(call: PluginCall) {
        when (call.getString("source", "")) {
            "photos" -> requestPermissionForAlias("photos", call, Manifest.permission.READ_MEDIA_IMAGES)
            "calendar" -> requestPermissionForAlias("calendar", call, Manifest.permission.READ_CALENDAR)
            "contacts" -> requestPermissionForAlias("contacts", call, Manifest.permission.READ_CONTACTS)
            "notifications" -> openNotificationListenerSettings(call)
            else -> {
                val result = JSObject()
                result.put("ok", false)
                result.put("reason", "Use Android share sheet, document picker, or official provider APIs.")
                call.resolve(result)
            }
        }
    }

    @PluginMethod
    fun openPermissionSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        intent.data = Uri.parse("package:${bridge.activity.packageName}")
        bridge.activity.startActivity(intent)
        val result = JSObject()
        result.put("ok", true)
        call.resolve(result)
    }

    @PluginMethod
    fun scheduleLocalReminder(call: PluginCall) {
        val result = JSObject()
        result.put("ok", false)
        result.put("reason", "Wire to Android AlarmManager or WorkManager after app shell generation.")
        call.resolve(result)
    }

    private fun openNotificationListenerSettings(call: PluginCall) {
        bridge.activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        val result = JSObject()
        result.put("ok", true)
        result.put("opened", "notification_listener_settings")
        call.resolve(result)
    }

    private fun requestPermissionForAlias(source: String, call: PluginCall, permission: String) {
        val result = JSObject()
        result.put("source", source)
        result.put("permission", permission)
        result.put("ok", false)
        result.put("reason", "Register runtime permission aliases inside generated Capacitor Android project.")
        call.resolve(result)
    }
}
