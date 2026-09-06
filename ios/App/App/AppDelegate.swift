import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private let pendingShareKey = "focusOyl.pendingShare.v1"
    private let pendingOpenKey = "focusOyl.pendingOpen.v1"
    private let pendingActionsKey = "focusOyl.pendingActions.v1"
    private let reminderCategory = "FOCUS_OYL_REMINDER"
    private let doneAction = "FOCUS_OYL_DONE"
    private let snoozeAction = "FOCUS_OYL_SNOOZE"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        registerReminderActions(center)
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if handleFocusOylURL(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func handleFocusOylURL(_ url: URL) -> Bool {
        guard url.scheme == "focusoyl" else {
            return false
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let queryItems = components?.queryItems ?? []
        var values: [String: String] = [:]
        queryItems.forEach { item in
            values[item.name] = item.value ?? ""
        }
        let host = url.host ?? ""

        if host == "import" || url.path.contains("import") {
            let payload: [String: Any] = [
                "source": "ios-url-scheme",
                "title": values["title"] ?? "",
                "text": values["text"] ?? values["body"] ?? "",
                "url": values["url"] ?? "",
                "receivedAt": ISO8601DateFormatter().string(from: Date()),
                "hasPayload": true
            ]
            UserDefaults.standard.set(payload, forKey: pendingShareKey)
            return true
        }

        let target = values["target"] ?? values["url"] ?? "/#timeline"
        let payload: [String: Any] = [
            "source": "ios-url-scheme",
            "url": target,
            "openedAt": ISO8601DateFormatter().string(from: Date()),
            "hasPayload": true
        ]
        UserDefaults.standard.set(payload, forKey: pendingOpenKey)
        return true
    }

    private func registerReminderActions(_ center: UNUserNotificationCenter) {
        let complete = UNNotificationAction(
            identifier: doneAction,
            title: "完成",
            options: []
        )
        let snooze = UNNotificationAction(
            identifier: snoozeAction,
            title: "稍後",
            options: []
        )
        let category = UNNotificationCategory(
            identifier: reminderCategory,
            actions: [complete, snooze],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let request = response.notification.request
        let content = request.content
        let id = request.identifier
        let rootId = rootSignalId(id)

        switch response.actionIdentifier {
        case doneAction:
            persistPendingAction(id: id, rootId: rootId, action: "completed", remindAt: nil)
            center.removePendingNotificationRequests(withIdentifiers: relatedReminderIds(rootId))
        case snoozeAction:
            let remindAt = Date().addingTimeInterval(30 * 60)
            persistPendingAction(id: id, rootId: rootId, action: "snoozed", remindAt: remindAt)
            center.removePendingNotificationRequests(withIdentifiers: relatedReminderIds(rootId))
            scheduleSnoozedReminder(center, rootId: rootId, content: content, remindAt: remindAt)
        default:
            let payload: [String: Any] = [
                "source": "ios-notification",
                "signalId": rootId,
                "url": content.userInfo["url"] as? String ?? "/#timeline",
                "openedAt": ISO8601DateFormatter().string(from: Date()),
                "hasPayload": true
            ]
            UserDefaults.standard.set(payload, forKey: pendingOpenKey)
        }

        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    private func persistPendingAction(id: String, rootId: String, action: String, remindAt: Date?) {
        var actions = UserDefaults.standard.array(forKey: pendingActionsKey) as? [[String: Any]] ?? []
        var item: [String: Any] = [
            "id": id,
            "rootId": rootId,
            "action": action,
            "at": ISO8601DateFormatter().string(from: Date())
        ]
        if let remindAt = remindAt {
            item["remindAt"] = ISO8601DateFormatter().string(from: remindAt)
        }
        actions.append(item)
        UserDefaults.standard.set(Array(actions.suffix(80)), forKey: pendingActionsKey)
    }

    private func scheduleSnoozedReminder(
        _ center: UNUserNotificationCenter,
        rootId: String,
        content originalContent: UNNotificationContent,
        remindAt: Date
    ) {
        let content = UNMutableNotificationContent()
        content.title = originalContent.title.isEmpty ? "Focus Oyl" : originalContent.title
        content.body = originalContent.body.isEmpty ? "Focus on your life" : originalContent.body
        content.sound = .default
        content.categoryIdentifier = reminderCategory
        content.userInfo = originalContent.userInfo

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, remindAt.timeIntervalSinceNow), repeats: false)
        let request = UNNotificationRequest(identifier: rootId, content: content, trigger: trigger)
        center.add(request)
    }

    private func rootSignalId(_ id: String) -> String {
        if let range = id.range(of: "-followup-", options: .backwards) {
            return String(id[..<range.lowerBound])
        }
        return id
    }

    private func relatedReminderIds(_ rootId: String) -> [String] {
        [rootId, "\(rootId)-followup-1", "\(rootId)-followup-2"]
    }

}
