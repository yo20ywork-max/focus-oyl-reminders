import Capacitor
import Contacts
import EventKit
import Foundation
import Photos
import UIKit
import UserNotifications

@objc(FocusOylNativePlugin)
public class FocusOylNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocusOylNativePlugin"
    public let jsName = "FocusOylNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceHealth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestDataSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openPermissionSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleLocalReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelLocalReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureAutomation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanConsentedSources", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingSafetyChecks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureSafetyCheck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSafetyCheck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveSafetyCheck", returnType: CAPPluginReturnPromise)
    ]

    private let consentKey = "focusOyl.nativeConsents.v1"
    private let automationConfigKey = "focusOyl.automationConfig.v1"
    private let safetyConfigKey = "focusOyl.safetyConfig.v1"
    private let pendingShareKey = "focusOyl.pendingShare.v1"
    private let pendingOpenKey = "focusOyl.pendingOpen.v1"
    private let pendingActionsKey = "focusOyl.pendingActions.v1"
    private let reminderCategory = "FOCUS_OYL_REMINDER"

    @objc public func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "ios",
            "native": true,
            "sources": [
                "photos": "available",
                "calendar": "available",
                "contacts": "available",
                "files": "available",
                "notifications": "limited",
                "chats": "limited",
                "sms": "restricted",
                "location": "permission-required"
            ],
            "safetyCheck": [
                "networkPush": "requires-service",
                "smsFallback": "not-available-on-ios",
                "timeoutLocation": "permission-required"
            ]
        ])
    }

    @objc public func getDeviceHealth(_ call: CAPPluginCall) {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let level: Any
        if UIDevice.current.batteryLevel >= 0 {
            level = Int(round(UIDevice.current.batteryLevel * 100))
        } else {
            level = NSNull()
        }
        let charging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "ok": true,
                "platform": "ios",
                "native": true,
                "online": true,
                "batteryLevel": level,
                "charging": charging,
                "powerSaveMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
                "batteryOptimizationIgnored": true,
                "canScheduleExactAlarms": true,
                "notificationPermission": "\(settings.authorizationStatus.rawValue)",
                "checkedAt": Int(Date().timeIntervalSince1970 * 1000)
            ])
        }
    }

    @objc public func saveConsent(_ call: CAPPluginCall) {
        let sources = call.getArray("sources", JSArray())
        UserDefaults.standard.set(sources, forKey: consentKey)
        call.resolve(["ok": true])
    }

    @objc public func getConsent(_ call: CAPPluginCall) {
        let sources = UserDefaults.standard.array(forKey: consentKey) ?? []
        call.resolve(["sources": sources])
    }

    @objc public func requestDataSource(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? ""
        switch source {
        case "photos":
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                call.resolve(["source": source, "status": "\(status.rawValue)"])
            }
        case "contacts":
            CNContactStore().requestAccess(for: .contacts) { granted, _ in
                call.resolve(["source": source, "granted": granted])
            }
        case "calendar":
            let store = EKEventStore()
            if #available(iOS 17.0, *) {
                store.requestFullAccessToEvents { granted, _ in
                    call.resolve(["source": source, "granted": granted])
                }
            } else {
                store.requestAccess(to: .event) { granted, _ in
                    call.resolve(["source": source, "granted": granted])
                }
            }
        case "notifications":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                call.resolve(["source": source, "granted": granted, "note": "iOS cannot read other apps' notifications."])
            }
        default:
            call.resolve(["source": source, "granted": false, "reason": "Use share sheet, document picker, or official provider APIs."])
        }
    }

    @objc public func openPermissionSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(url) else {
                call.resolve(["ok": false])
                return
            }
            UIApplication.shared.open(url)
            call.resolve(["ok": true])
        }
    }

    @objc public func scheduleLocalReminder(_ call: CAPPluginCall) {
        let reminder = call.getObject("reminder") ?? JSObject()
        let identifier = reminder["id"] as? String ?? UUID().uuidString
        let content = UNMutableNotificationContent()
        content.title = reminder["title"] as? String ?? "Focus Oyl"
        content.body = reminder["body"] as? String ?? "Focus on your life"
        content.sound = .default
        content.categoryIdentifier = reminderCategory
        content.userInfo = [
            "focusOylSignalId": identifier,
            "url": reminder["url"] as? String ?? "/#timeline",
            "title": content.title,
            "body": content.body
        ]

        let fireDate = reminderDate(from: reminder)
        let trigger: UNNotificationTrigger
        if fireDate.timeIntervalSinceNow <= 1 {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        } else {
            trigger = UNCalendarNotificationTrigger(
                dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate),
                repeats: false
            )
        }

        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )

        addNotificationRequest(request, call: call, fireDate: fireDate)
    }

    @objc public func cancelLocalReminder(_ call: CAPPluginCall) {
        let reminder = call.getObject("reminder") ?? JSObject()
        guard let identifier = reminder["id"] as? String else {
            call.resolve(["ok": false, "reason": "missing id"])
            return
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
        call.resolve(["ok": true, "id": identifier])
    }

    @objc public func configureAutomation(_ call: CAPPluginCall) {
        let config = call.getObject("config") ?? JSObject()
        UserDefaults.standard.set(config, forKey: automationConfigKey)
        call.resolve([
            "ok": true,
            "localOnly": true,
            "note": "iOS automation is limited to OS-approved sources such as Calendar, selected Photos, Files, and Share Extension input."
        ])
    }

    @objc public func scanConsentedSources(_ call: CAPPluginCall) {
        call.resolve([
            "ok": true,
            "platform": "ios",
            "localOnly": true,
            "items": [],
            "limits": [
                "iOS cannot silently read other apps' chats or notifications.",
                "Use Share Extension, selected Photos OCR, Calendar/Reminders permissions, Files imports, or official provider APIs."
            ]
        ])
    }

    @objc public func consumePendingShare(_ call: CAPPluginCall) {
        consumePendingPayload(call, key: pendingShareKey)
    }

    @objc public func consumePendingOpen(_ call: CAPPluginCall) {
        consumePendingPayload(call, key: pendingOpenKey)
    }

    @objc public func consumePendingActions(_ call: CAPPluginCall) {
        let actions = UserDefaults.standard.array(forKey: pendingActionsKey) ?? []
        UserDefaults.standard.removeObject(forKey: pendingActionsKey)
        call.resolve([
            "ok": true,
            "actions": actions
        ])
    }

    @objc public func consumePendingSafetyChecks(_ call: CAPPluginCall) {
        call.resolve([
            "ok": true,
            "checks": []
        ])
    }

    @objc public func configureSafetyCheck(_ call: CAPPluginCall) {
        let config = call.getObject("config") ?? JSObject()
        UserDefaults.standard.set(config, forKey: safetyConfigKey)
        call.resolve([
            "ok": true,
            "localOnly": true,
            "testMode": config["testMode"] as? Bool ?? true,
            "familyName": config["familyName"] as? String ?? "",
            "backupPhone": config["backupPhone"] as? String ?? "",
            "note": "iOS cannot silently read SMS. Use APNs, CallKit-like escalation outside this prototype, or Shortcuts/manual fallback."
        ])
    }

    @objc public func startSafetyCheck(_ call: CAPPluginCall) {
        let check = call.getObject("check") ?? JSObject()
        call.resolve([
            "ok": true,
            "id": check["id"] as? String ?? "",
            "timeoutSeconds": check["timeoutSeconds"] as? Int ?? 30,
            "nativeReady": true,
            "note": "The web layer owns the local 30-second confirmation UI; push delivery is service-layer work."
        ])
    }

    @objc public func resolveSafetyCheck(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let wantsLocation = call.getBool("shareLocation") ?? false
        call.resolve([
            "ok": true,
            "action": action,
            "locationShared": false,
            "requiresLocationPermission": wantsLocation,
            "note": wantsLocation
                ? "GPS transmission is intentionally left behind the explicit native consent gate."
                : "Safe response acknowledged without location."
        ])
    }

    private func consumePendingPayload(_ call: CAPPluginCall, key: String) {
        guard let payload = UserDefaults.standard.dictionary(forKey: key) else {
            call.resolve([
                "ok": true,
                "hasPayload": false
            ])
            return
        }
        UserDefaults.standard.removeObject(forKey: key)
        var result = payload
        result["ok"] = true
        result["hasPayload"] = true
        call.resolve(result)
    }

    private func addNotificationRequest(_ request: UNNotificationRequest, call: CAPPluginCall, fireDate: Date) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                center.add(request) { error in
                    call.resolve([
                        "ok": error == nil,
                        "id": request.identifier,
                        "at": ISO8601DateFormatter().string(from: fireDate)
                    ])
                }
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    guard granted else {
                        call.resolve(["ok": false, "reason": "notification permission denied"])
                        return
                    }
                    center.add(request) { error in
                        call.resolve([
                            "ok": error == nil,
                            "id": request.identifier,
                            "at": ISO8601DateFormatter().string(from: fireDate)
                        ])
                    }
                }
            default:
                call.resolve(["ok": false, "reason": "notification permission not granted"])
            }
        }
    }

    private func reminderDate(from reminder: JSObject) -> Date {
        guard let raw = reminder["at"] as? String ?? reminder["remindAt"] as? String else {
            return Date().addingTimeInterval(5)
        }

        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) {
            return date
        }

        let standard = ISO8601DateFormatter()
        if let date = standard.date(from: raw) {
            return date
        }

        return Date().addingTimeInterval(5)
    }
}
