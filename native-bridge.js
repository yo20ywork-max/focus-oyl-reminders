/* Focus Oyl native bridge facade.
   Web fallback today, Capacitor native plugin tomorrow. */

(() => {
  const CONSENT_KEY = "focusOyl.nativeConsents.v1";
  const AUTOMATION_CONFIG_KEY = "focusOyl.automationConfig.v1";
  const SHARED_TEXT_EVENT = "focusoyl:sharedText";

  function getCapacitorPlugin() {
    return window.Capacitor?.Plugins?.FocusOylNative || null;
  }

  function getPlatform() {
    try {
      return window.Capacitor?.getPlatform?.() || "web";
    } catch {
      return "web";
    }
  }

  function isNativeApp() {
    const platform = getPlatform();
    return platform === "ios" || platform === "android";
  }

  async function invoke(name, payload, fallback) {
    const plugin = getCapacitorPlugin();
    if (plugin && typeof plugin[name] === "function") {
      return plugin[name](payload || {});
    }
    return typeof fallback === "function" ? fallback(payload || {}) : fallback;
  }

  async function getCapabilities() {
    return invoke("getCapabilities", {}, () => ({
      platform: getPlatform(),
      native: isNativeApp(),
      sources: {
        photos: "available",
        calendar: "available",
        contacts: "available",
        files: "available",
        notifications: getPlatform() === "android" ? "available" : "limited",
        chats: "limited",
        sms: "restricted",
        location: "permission-required",
      },
      safetyCheck: {
        networkPush: "requires-service",
        smsFallback: getPlatform() === "android" ? "native-only" : "not-available",
        timeoutLocation: "permission-required",
      },
    }));
  }

  async function getDeviceHealth() {
    const fallback = async () => {
      const result = {
        ok: true,
        platform: getPlatform(),
        native: isNativeApp(),
        online: navigator.onLine !== false,
        notificationPermission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        batteryLevel: null,
        charging: null,
        powerSaveMode: null,
        batteryOptimizationIgnored: null,
        canScheduleExactAlarms: null,
        checkedAt: new Date().toISOString(),
      };
      try {
        const battery = await navigator.getBattery?.();
        if (battery) {
          result.batteryLevel = Math.round(Number(battery.level || 0) * 100);
          result.charging = Boolean(battery.charging);
        }
      } catch {
        result.batteryUnavailable = true;
      }
      return result;
    };
    return invoke("getDeviceHealth", {}, fallback);
  }

  async function saveConsent(sources) {
    const payload = {
      sources: Array.isArray(sources) ? sources : [],
      savedAt: new Date().toISOString(),
    };
    return invoke("saveConsent", payload, () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
      return { ok: true, stored: "localStorage" };
    });
  }

  async function getConsent() {
    return invoke("getConsent", {}, () => {
      try {
        return JSON.parse(localStorage.getItem(CONSENT_KEY) || '{"sources":[]}');
      } catch {
        return { sources: [] };
      }
    });
  }

  async function requestDataSource(source) {
    return invoke("requestDataSource", { source }, () => ({
      ok: false,
      source,
      reason: "Native app bridge is not available in browser preview.",
    }));
  }

  async function openPermissionSettings(source) {
    return invoke("openPermissionSettings", { source }, () => ({
      ok: false,
      source,
      reason: "Settings can only be opened from the native app.",
    }));
  }

  async function scheduleLocalReminder(reminder) {
    return invoke("scheduleLocalReminder", { reminder }, () => ({
      ok: false,
      reason: "Use browser Notification fallback in web preview.",
    }));
  }

  async function cancelLocalReminder(reminder) {
    return invoke("cancelLocalReminder", { reminder }, () => ({
      ok: false,
      reason: "Native reminder cancellation is not available in browser preview.",
    }));
  }

  async function configureAutomation(config) {
    return invoke("configureAutomation", { config }, () => {
      localStorage.setItem(AUTOMATION_CONFIG_KEY, JSON.stringify(config || {}));
      return { ok: true, stored: "localStorage" };
    });
  }

  async function scanConsentedSources(request) {
    return invoke("scanConsentedSources", request || {}, (payload) => ({
      ok: false,
      platform: getPlatform(),
      items: [],
      preview: Boolean(payload.preview),
      reason: "Browser preview cannot read other apps. Native builds scan only OS-authorized local sources.",
    }));
  }

  async function consumePendingShare() {
    return invoke("consumePendingShare", {}, () => ({
      ok: true,
      hasPayload: false,
    }));
  }

  async function consumePendingOpen() {
    return invoke("consumePendingOpen", {}, () => ({
      ok: true,
      hasPayload: false,
    }));
  }

  async function consumePendingActions() {
    return invoke("consumePendingActions", {}, () => ({
      ok: true,
      actions: [],
    }));
  }

  async function consumePendingSafetyChecks() {
    return invoke("consumePendingSafetyChecks", {}, () => ({
      ok: true,
      checks: [],
    }));
  }

  async function configureSafetyCheck(config) {
    return invoke("configureSafetyCheck", { config: config || {} }, () => ({
      ok: true,
      stored: "web-preview",
      note: "Browser preview stores the safety-check settings only in the app UI.",
    }));
  }

  async function startSafetyCheck(request) {
    return invoke("startSafetyCheck", request || {}, () => ({
      ok: true,
      preview: true,
      note: "Browser preview shows the 30-second elder confirmation screen without sending push, SMS, or location.",
    }));
  }

  async function resolveSafetyCheck(result) {
    return invoke("resolveSafetyCheck", result || {}, () => ({
      ok: true,
      preview: true,
      locationShared: false,
      note: "Browser preview never transmits real location.",
    }));
  }

  function onSharedText(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (event) => handler(parseEventDetail(event.detail));
    window.addEventListener(SHARED_TEXT_EVENT, listener);
    return () => window.removeEventListener(SHARED_TEXT_EVENT, listener);
  }

  function simulateSharedText(text, source = "native-share") {
    window.dispatchEvent(new CustomEvent(SHARED_TEXT_EVENT, {
      detail: { text, source, receivedAt: new Date().toISOString() },
    }));
  }

  function onNativeOpen(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (event) => handler(parseEventDetail(event.detail));
    window.addEventListener("focusoyl:nativeOpen", listener);
    return () => window.removeEventListener("focusoyl:nativeOpen", listener);
  }

  function parseEventDetail(detail) {
    if (!detail) return {};
    if (typeof detail === "string") {
      try {
        return JSON.parse(detail);
      } catch {
        return { text: detail };
      }
    }
    return detail;
  }

  window.FocusOylNative = {
    getPlatform,
    isNativeApp,
    getCapabilities,
    getDeviceHealth,
    saveConsent,
    getConsent,
    requestDataSource,
    openPermissionSettings,
    scheduleLocalReminder,
    cancelLocalReminder,
    configureAutomation,
    scanConsentedSources,
    consumePendingShare,
    consumePendingOpen,
    consumePendingActions,
    consumePendingSafetyChecks,
    configureSafetyCheck,
    startSafetyCheck,
    resolveSafetyCheck,
    onSharedText,
    onNativeOpen,
    simulateSharedText,
  };
})();
