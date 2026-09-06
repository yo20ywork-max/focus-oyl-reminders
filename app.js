(() => {
  if (new URLSearchParams(window.location.search).has("capture")) {
    document.documentElement.classList.add("capture-mode");
  }

  const BRAND = "Focus Oyl";
  const SIGNALS_KEY = "focusOyl.signals.v1";
  const SETTINGS_KEY = "focusOyl.settings.v1";
  const INSTALL_KEY = "focusOyl.installHintDismissed.v1";
  const AUTOMATION_STATUS_KEY = "focusOyl.automationStatus.v1";
  const MEMORY_KEY = "focusOyl.localMemory.v2";
  const DEVICE_KEY = "focusOyl.device.v1";
  const FEEDBACK_KEY = "focusOyl.feedback.v1";
  const SAFETY_KEY = "focusOyl.safety.v1";
  const SNAPSHOT_KIND = "focus-oyl-local-snapshot";
  const HANDOFF_PREFIX = "FOCUS-OYL-HANDOFF-v1.";
  const AUTO_SCAN_INTERVAL_MS = 4 * 60 * 1000;
  const SAFETY_TIMEOUT_SECONDS = 30;

  const sources = [
    {
      id: "share",
      title: "分享進 Focus Oyl",
      detail: "從聊天、郵件、網頁或截圖文字手動分享。這是 iPhone MVP 最可靠入口。",
      state: "可先做",
      checked: true,
    },
    {
      id: "photos",
      title: "照片與截圖 OCR",
      detail: "只讀使用者選取的照片，在本機辨識文字。",
      state: "需授權",
      checked: true,
    },
    {
      id: "calendar",
      title: "行事曆與提醒事項",
      detail: "原生 iOS app 版可透過 Apple 權限提示讀取。",
      state: "原生版",
      checked: true,
    },
    {
      id: "chats",
      title: "社群聊天內容",
      detail: "iOS 不能靜默讀取所有 app 對話；採匯出、分享、官方 API 或使用者貼上。",
      state: "受限制",
      checked: false,
    },
    {
      id: "notifications",
      title: "其他 app 通知",
      detail: "iOS 不提供讀取所有通知內容的 API；Android 原生版可做通知讀取授權。",
      state: "iOS 限制",
      checked: false,
    },
  ];

  const els = {
    appShell: document.getElementById("appShell"),
    dateLine: document.getElementById("dateLine"),
    clockLine: document.getElementById("clockLine"),
    statusDot: document.getElementById("statusDot"),
    pill: document.getElementById("activityPill"),
    pillText: document.getElementById("pillText"),
    oneTapCard: document.getElementById("oneTapCard"),
    oneTapLabel: document.getElementById("oneTapLabel"),
    oneTapTitle: document.getElementById("oneTapTitle"),
    oneTapDetail: document.getElementById("oneTapDetail"),
    oneTapButton: document.getElementById("oneTapButton"),
    oneTapNote: document.getElementById("oneTapNote"),
    careConsole: document.getElementById("careConsole"),
    careNextTitle: document.getElementById("careNextTitle"),
    careNextDetail: document.getElementById("careNextDetail"),
    careDeviceList: document.getElementById("careDeviceList"),
    careSyncCode: document.getElementById("careSyncCode"),
    careSyncDetail: document.getElementById("careSyncDetail"),
    careTimelineButton: document.getElementById("careTimelineButton"),
    careImportButton: document.getElementById("careImportButton"),
    careSafetyButton: document.getElementById("careSafetyButton"),
    careConnectButton: document.getElementById("careConnectButton"),
    signalCard: document.getElementById("signalCard"),
    signalLabel: document.getElementById("signalLabel"),
    signalTitle: document.getElementById("signalTitle"),
    signalDetail: document.getElementById("signalDetail"),
    signalDone: document.getElementById("signalDone"),
    signalDismiss: document.getElementById("signalDismiss"),
    installCard: document.getElementById("installCard"),
    dismissInstall: document.getElementById("dismissInstall"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    sheetContent: document.getElementById("sheetContent"),
    toastStack: document.getElementById("toastStack"),
  };

  let settings = loadSettings();
  let activeSignals = hydrateSignals(loadSignals());
  let automationStatus = loadAutomationStatus();
  let feedback = loadFeedback();
  let safetyState = loadSafetyState();
  let deviceHealth = createDefaultDeviceHealth();
  let automationTimer = null;
  let safetyTimer = null;

  init();

  function init() {
    registerServiceWorker();
    tick();
    setInterval(() => {
      tick();
      renderCurrentSignal();
    }, 30000);
    wireShell();
    initDeviceHealth();
    maybeShowInstallHint();
    renderCurrentSignal();
    startDueReminderLoop();
    startAutomationLoop();
    ingestSharedQuery();
    consumePendingNativeIntents();

    if (location.hash.startsWith("#import")) {
      window.setTimeout(openImportSheet, 280);
    } else if (location.hash.startsWith("#timeline")) {
      window.setTimeout(openTimelineSheet, 280);
    } else if (location.hash.startsWith("#safety")) {
      window.setTimeout(openSafetySheet, 280);
    } else if (location.hash.startsWith("#devices")) {
      window.setTimeout(openDeviceSheet, 280);
    }

    if (safetyState?.status === "waiting" && remainingSafetySeconds() <= 0) {
      finishSafetyTimeout();
    } else {
      startSafetyCountdown();
    }
  }

  function wireShell() {
    document.getElementById("importButton").addEventListener("click", openImportSheet);
    document.getElementById("inboxButton").addEventListener("click", () => {
      history.replaceState(null, "", `${location.pathname}${location.search}#timeline`);
      openTimelineSheet();
    });
    document.getElementById("reminderButton").addEventListener("click", openReminderSheet);
    document.getElementById("settingsButton").addEventListener("click", openSourcesSheet);
    document.getElementById("brandButton").addEventListener("click", openStatusSheet);
    els.oneTapButton.addEventListener("click", handleOneTap);
    els.careTimelineButton?.addEventListener("click", () => {
      history.replaceState(null, "", `${location.pathname}${location.search}#timeline`);
      openTimelineSheet();
    });
    els.careImportButton?.addEventListener("click", openImportSheet);
    els.careSafetyButton?.addEventListener("click", openSafetySheet);
    els.careConnectButton?.addEventListener("click", openDeviceSheet);
    els.signalDone.addEventListener("click", handlePrimarySignalAction);
    els.signalDismiss.addEventListener("click", handleSecondarySignalAction);
    els.dismissInstall.addEventListener("click", () => {
      localStorage.setItem(INSTALL_KEY, "1");
      els.installCard.hidden = true;
    });
    els.sheetBackdrop.addEventListener("click", (event) => {
      if (event.target === els.sheetBackdrop) closeSheet();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSheet();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        openImportSheet();
      }
    });
    window.addEventListener("focus", consumePendingNativeIntents);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) consumePendingNativeIntents();
    });

    window.FocusOylNative?.onSharedText?.(handleNativeShare);
    window.FocusOylNative?.onNativeOpen?.(handleNativeOpen);
  }

  function tick() {
    const now = new Date();
    const day = new Intl.DateTimeFormat("zh-Hant-TW", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now);
    const time = new Intl.DateTimeFormat("zh-Hant-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    softUpdate(els.dateLine, day);
    softUpdate(els.clockLine, time);
  }

  function softUpdate(node, value) {
    if (!node) return;
    let inner = node.querySelector(":scope > .tick-inner");
    if (!inner) {
      inner = document.createElement("span");
      inner.className = "tick-inner";
      inner.textContent = node.textContent;
      node.textContent = "";
      node.appendChild(inner);
    }
    if (inner.textContent === value) return;
    inner.classList.remove("ticking");
    void inner.offsetWidth;
    inner.textContent = value;
    inner.classList.add("ticking");
    window.setTimeout(() => inner.classList.remove("ticking"), 380);
  }

  function setWorking(label) {
    els.statusDot.classList.add("working");
    els.pill.classList.add("is-working");
    els.pill.querySelector(".pill-dot").classList.add("working");
    els.pillText.textContent = label;
  }

  function setIdle(label = "本地待命") {
    els.statusDot.classList.remove("working");
    els.pill.classList.remove("is-working");
    els.pill.querySelector(".pill-dot").classList.remove("working");
    els.pillText.textContent = label;
  }

  function maybeShowInstallHint() {
    els.installCard.hidden = true;
  }

  function openImportSheet() {
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Import</p>
          <h2 id="sheetTitle">整理一段文字。</h2>
          <p>貼上聊天、帳單或截圖。在這台裝置上分析，不上傳。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>

      <div class="import-grid">
        <div class="file-row">
          <label class="file-trigger" for="fileInput">選擇檔案</label>
          <input class="hidden-input" id="fileInput" type="file" accept=".txt,.json,.html,.htm,.csv,.md,image/*" />
        </div>

        <div class="ocr-status" id="ocrStatus">
          <p class="panel-copy" id="ocrLabel"></p>
          <div class="progress"><i id="ocrProgress"></i></div>
        </div>

        <textarea class="input-area" id="importText" placeholder="貼上文字..."></textarea>

        <button class="primary-action" type="button" data-process>分析</button>
        <div id="importResult"></div>
      </div>
    `);

    const text = document.getElementById("importText");
    const fileInput = document.getElementById("fileInput");
    const result = document.getElementById("importResult");

    text.focus();
    document.querySelector("[data-process]").addEventListener("click", () => {
      const analysis = processText(text.value, "manual-import");
      renderImportResult(result, analysis);
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) readImportFile(file, text, result);
    });
  }

  function openTimelineSheet() {
    const groups = buildTimelineGroups();
    const total = groups.past.length + groups.now.length + groups.future.length;
    const next = groups.now[0] || groups.future[0];
    const band = buildTimelineBand();
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Timeline</p>
          <h2 id="sheetTitle">現在在中間。</h2>
          <p>往左是過去，往右是未來。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="timeline-shell">
        <section class="timeline-summary">
          <div>
            <b>${total}</b>
            <span>全部</span>
          </div>
          <div>
            <b>${groups.now.length}</b>
            <span>現在</span>
          </div>
          <div>
            <b>${groups.future.length}</b>
            <span>未來</span>
          </div>
        </section>
        <section class="timeline-toolbar">
          <button class="secondary-action mini-action" type="button" data-jump-timeline="-1">往前</button>
          <span id="timelineViewportLabel">正在看 · 現在</span>
          <button class="secondary-action mini-action" type="button" data-center-timeline>回到現在</button>
          <button class="secondary-action mini-action" type="button" data-jump-timeline="1">往後</button>
        </section>
        <section class="timeline-band-panel" aria-label="可拖拉時間軸">
          <div class="timeline-scale" aria-hidden="true">
            <span>過去</span>
            <span>未來</span>
          </div>
          <div class="timeline-now-pin" aria-hidden="true">
            <span>現在</span>
          </div>
          <div class="timeline-window" id="timelineWindow">
            <div class="timeline-track" id="timelineTrack">
              ${band.length ? band.map(renderTimelineBandItem).join("") : ""}
            </div>
          </div>
        </section>
        ${next ? `
          <section class="next-panel">
            <p class="meta-label">下一件事</p>
            <h3>${escapeHtml(next.title)}</h3>
            <p>${escapeHtml(next.schedule?.labels?.relative || "即將")} · ${escapeHtml(next.schedule?.labels?.remind || "尚未排程")}</p>
          </section>
        ` : ""}
        ${total ? "" : `<div class="empty-state">還沒有事項。貼上一段文字，Focus Oyl 會在本機整理。</div>`}
      </div>
    `);
    setupTimelineControls();

    function bindTimelineAction(attr, fn, extraArgFn) {
      document.querySelectorAll(`[${attr}]`).forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute(attr);
          const card = button.closest(".timeline-item, .timeline-band-item, .signal-item");
          const reopen = () => {
            if (extraArgFn) fn(id, extraArgFn(button));
            else fn(id);
            openTimelineSheet();
          };
          if (card) {
            card.classList.add("exiting");
            window.setTimeout(reopen, 200);
          } else {
            reopen();
          }
        });
      });
    }

    bindTimelineAction("data-complete-signal", completeSignal);
    bindTimelineAction("data-confirm-signal", confirmReviewSignal);
    bindTimelineAction("data-dismiss-signal", dismissSignal);
    bindTimelineAction("data-snooze-signal", snoozeSignal, (button) => Number(button.dataset.minutes) || 60);
    bindTimelineAction("data-focus-signal", focusSignalNow);
  }

  function openReminderSheet() {
    const canNotify = "Notification" in window;
    const timeSettings = getTimeSettings();
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Reminder</p>
          <h2 id="sheetTitle">準時，但安靜。</h2>
          <p>先推算截止時間，再套上提前量與安靜時段。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="reminder-grid">
        <div class="time-panel">
          <div>
            <p class="meta-label">Quiet Hours</p>
            <h3>${formatHour(timeSettings.quietStart)}:00 - ${formatHour(timeSettings.quietEnd)}:00</h3>
            <p>安靜時段內不主動跳提醒，除非太接近截止。</p>
          </div>
          <div class="time-controls">
            <label>
              <span>開始</span>
              <input type="number" min="0" max="23" value="${timeSettings.quietStart}" data-time-setting="quietStart" />
            </label>
            <label>
              <span>結束</span>
              <input type="number" min="0" max="23" value="${timeSettings.quietEnd}" data-time-setting="quietEnd" />
            </label>
          </div>
          <button class="secondary-action" type="button" data-save-time>儲存</button>
        </div>
        <div class="time-panel">
          <div>
            <p class="meta-label">Timing</p>
            <h3>依類型決定提前量</h3>
            <p>保固提前 14 天 · 付款提前 1 天 · 工作提前 4 小時 · 回覆延後 2 小時。</p>
          </div>
        </div>
        <div class="reminder-item">
          <div>
            <h3>瀏覽器通知</h3>
            <p>${canNotify ? "iPhone 通常要先加入主畫面才會穩定。" : "這個瀏覽器不支援。"}</p>
          </div>
          <button class="secondary-action" type="button" data-notify ${canNotify ? "" : "disabled"}>開啟</button>
        </div>
        <div class="reminder-item">
          <div>
            <h3>原生通知</h3>
            <p>iOS 用 UNUserNotificationCenter 排程，本機完成。</p>
          </div>
          <span class="source-state">下一階段</span>
        </div>
        <div class="reminder-item">
          <div>
            <h3>Share Extension</h3>
            <p>從 LINE、Mail、Safari 直接分享進來。</p>
          </div>
          <span class="source-state">iOS app</span>
        </div>
      </div>
    `);

    const notifyButton = document.querySelector("[data-notify]");
    notifyButton?.addEventListener("click", requestNotificationPermission);
    document.querySelector("[data-save-time]")?.addEventListener("click", () => {
      document.querySelectorAll("[data-time-setting]").forEach((input) => {
        const value = Math.max(0, Math.min(23, Number(input.value) || 0));
        settings[input.dataset.timeSetting] = value;
      });
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      toast("時間規則已更新", `安靜時段 ${formatHour(settings.quietStart)}:00 - ${formatHour(settings.quietEnd)}:00`);
      closeSheet();
    });
  }

  function openSourcesSheet() {
    const autoEnabled = Boolean(settings.automationEnabled);
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Sources</p>
          <h2 id="sheetTitle">只讀你允許的資料。</h2>
          <p>授權後，Focus Oyl 在本機掃描勾選的來源並排程。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="settings-grid">
        <section class="automation-card">
          <label class="source-item automation-toggle">
            <span class="source-switch">
              <input type="checkbox" data-automation-enabled ${autoEnabled ? "checked" : ""} />
              <span></span>
            </span>
            <span>
              <h3>本機自動化</h3>
              <p>OCR、判讀、去重、排程，都在這台裝置上完成。</p>
            </span>
            <b class="source-state">${autoEnabled ? "運作中" : "待開啟"}</b>
          </label>
          <div class="automation-grid">
            <div>
              <b>${automationStatus.lastScanAt ? formatTimelineDate(automationStatus.lastScanAt) : "尚未"}</b>
              <span>上次掃描</span>
            </div>
            <div>
              <b>${automationStatus.lastItemsScanned || 0}</b>
              <span>訊號</span>
            </div>
            <div>
              <b>${automationStatus.lastSignalsCreated || 0}</b>
              <span>排程</span>
            </div>
          </div>
          <div class="automation-actions">
            <button class="secondary-action" type="button" data-run-auto-scan>立即掃描</button>
            <button class="secondary-action" type="button" data-request-source-permissions>請求權限</button>
          </div>
        </section>
        ${sources.map((source) => `
          <label class="source-item">
            <span class="source-switch">
              <input type="checkbox" value="${source.id}" ${settings[source.id] ?? source.checked ? "checked" : ""} />
              <span></span>
            </span>
            <span>
              <h3>${escapeHtml(source.title)}</h3>
              <p>${escapeHtml(source.detail)}</p>
            </span>
            <b class="source-state">${escapeHtml(source.state)}</b>
          </label>
        `).join("")}
        <button class="primary-action" type="button" data-save-sources>儲存</button>
      </div>
    `);

    document.querySelector("[data-save-sources]").addEventListener("click", async () => {
      const nextSettings = { ...settings };
      document.querySelectorAll(".source-switch input").forEach((input) => {
        if (input.dataset.automationEnabled !== undefined) {
          nextSettings.automationEnabled = input.checked;
        } else {
          nextSettings[input.value] = input.checked;
        }
      });
      settings = nextSettings;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      await window.FocusOylNative?.saveConsent?.(Object.entries(settings).map(([id, enabled]) => ({ id, enabled })));
      await window.FocusOylNative?.configureAutomation?.(buildAutomationConfig());
      startAutomationLoop({ runNow: settings.automationEnabled });
      toast("授權偏好已儲存", "現在仍是 PWA 預覽；原生 app 會用同一套同意邏輯接 OS 權限。");
      closeSheet();
    });

    document.querySelector("[data-run-auto-scan]")?.addEventListener("click", () => {
      runAutoScan({ manual: true, preview: !window.FocusOylNative?.isNativeApp?.() });
    });

    document.querySelector("[data-request-source-permissions]")?.addEventListener("click", requestEnabledSourcePermissions);
  }

  async function requestEnabledSourcePermissions() {
    const sourceIds = getEnabledAutomationSources();
    if (!sourceIds.length) {
      toast("尚未選擇來源", "先勾選至少一個資料來源。");
      return;
    }

    setWorking("正在請求系統權限");
    const results = [];
    for (const sourceId of sourceIds) {
      try {
        const result = await window.FocusOylNative?.requestDataSource?.(sourceId);
        results.push({ sourceId, ok: Boolean(result?.ok || result?.granted || result?.status) });
      } catch {
        results.push({ sourceId, ok: false });
      }
    }
    setIdle("權限狀態已更新");
    const granted = results.filter((result) => result.ok).length;
    toast("權限請求完成", `${granted}/${results.length} 個來源已可由系統授權流程處理。`);
  }

  async function runAutoScan(options = {}) {
    const { manual = false, preview = false, silent = false } = options;
    const sourceIds = getEnabledAutomationSources();

    if (!settings.automationEnabled && !manual) return null;
    if (!sourceIds.length) {
      if (!silent) toast("沒有可掃描來源", "先在資料來源裡勾選 Autopilot 要處理的白名單。");
      return null;
    }

    setWorking("本機自動掃描中");
    let result = null;
    try {
      result = await window.FocusOylNative?.scanConsentedSources?.({
        sources: sourceIds,
        since: automationStatus.lastScanAt || null,
        preview,
      });
    } catch {
      result = { ok: false, items: [] };
    }

    const items = normalizeAutoScanItems(result?.items || []);

    const before = activeSignals.length;
    for (const item of items) {
      processText(formatAutoScanItem(item), `auto-${item.source || "local"}`, { silent: true });
    }
    const created = Math.max(0, activeSignals.length - before);
    automationStatus = {
      lastScanAt: new Date().toISOString(),
      lastItemsScanned: items.length,
      lastSignalsCreated: created,
      lastSources: sourceIds,
      lastMode: preview ? "preview" : "native",
    };
    saveAutomationStatus();
    setIdle(created ? `${created} 個提醒已自動排程` : "本機掃描完成");

    if (!silent) {
      const note = preview && !window.FocusOylNative?.isNativeApp?.()
        ? "這個版本沒有原生系統讀取權限；安裝原生 app 後會讀取你授權的來源。"
        : "已從授權來源抽取可行動事項。";
      toast("自動掃描完成", `${items.length} 個訊號 · ${created} 個新提醒。${note}`);
    }

    return automationStatus;
  }

  function startAutomationLoop(options = {}) {
    if (automationTimer) {
      window.clearInterval(automationTimer);
      automationTimer = null;
    }
    if (!settings.automationEnabled) return;

    automationTimer = window.setInterval(() => {
      runAutoScan({ silent: true });
    }, AUTO_SCAN_INTERVAL_MS);

    if (options.runNow) {
      runAutoScan({ silent: true });
    }
  }

  function buildAutomationConfig() {
    return {
      enabled: Boolean(settings.automationEnabled),
      sources: getEnabledAutomationSources(),
      localOnly: true,
      intervalMinutes: Math.round(AUTO_SCAN_INTERVAL_MS / 60000),
      quietHours: {
        start: getTimeSettings().quietStart,
        end: getTimeSettings().quietEnd,
      },
      safety: buildSafetyConfig(),
    };
  }

  function getEnabledAutomationSources() {
    return sources
      .filter((source) => source.id !== "share")
      .filter((source) => settings[source.id] ?? source.checked)
      .map((source) => source.id);
  }

  function normalizeAutoScanItems(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item && (item.text || item.title || item.body))
      .map((item) => ({
        id: item.id || `${item.source || "local"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: item.source || "local",
        app: item.app || item.packageName || item.source || "Local",
        title: item.title || "",
        text: item.text || item.body || "",
        capturedAt: item.capturedAt || item.receivedAt || new Date().toISOString(),
      }));
  }

  function formatAutoScanItem(item) {
    const title = [item.app, item.title].filter(Boolean).join(" ");
    return [
      title ? `${title}:` : "",
      item.text || "",
      item.capturedAt ? `收到時間 ${formatTimelineDate(item.capturedAt)}` : "",
    ].filter(Boolean).join(" ");
  }

  function openStatusSheet() {
    const profile = getDeviceProfile();
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Status</p>
          <h2 id="sheetTitle">本機優先。</h2>
          <p>正在 ${escapeHtml(profile.family)} 上運行。OCR、判讀、排程都在這台裝置。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="settings-grid">
        <div class="panel">
          <p class="panel-title">捷徑</p>
          <div class="shortcut-grid">
            <button class="secondary-action" type="button" data-shortcut="import">匯入</button>
            <button class="secondary-action" type="button" data-shortcut="timeline">時間軸</button>
            <button class="secondary-action" type="button" data-shortcut="reminder">提醒</button>
          </div>
        </div>
        <div class="panel">
          <p class="panel-title">${activeSignals.length} 個訊號</p>
          <p class="panel-copy">存在 localStorage，之後原生版改本機加密。</p>
        </div>
        <div class="panel">
          <p class="panel-title">本機學習</p>
          <p class="panel-copy">${escapeHtml(feedbackSummary())}。只調整這台裝置的保守度，不上傳。</p>
        </div>
        <div class="panel">
          <p class="panel-title">資料控制</p>
          <p class="panel-copy">所有動作只作用在這台裝置。清除需要連按兩次。</p>
          <div class="privacy-actions">
            <button class="secondary-action" type="button" data-open-safety>安全確認</button>
            <button class="secondary-action" type="button" data-pause-care>${settings.automationEnabled ? "暫停照顧" : "已暫停"}</button>
            <button class="secondary-action danger-action" type="button" data-reset-local>清除資料</button>
          </div>
        </div>
        <button class="primary-action" type="button" data-open-devices>連接其他裝置</button>
      </div>
    `);
    document.querySelector("[data-open-devices]")?.addEventListener("click", openDeviceSheet);
    document.querySelector("[data-open-safety]")?.addEventListener("click", openSafetySheet);
    document.querySelector("[data-pause-care]")?.addEventListener("click", pauseCareMode);
    document.querySelector("[data-reset-local]")?.addEventListener("click", armLocalReset);
    document.querySelectorAll("[data-shortcut]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.shortcut;
        if (target === "import") openImportSheet();
        else if (target === "timeline") {
          history.replaceState(null, "", `${location.pathname}${location.search}#timeline`);
          openTimelineSheet();
        }
        else if (target === "reminder") openReminderSheet();
      });
    });
  }

  function openDeviceSheet() {
    const profile = getDeviceProfile();
    const snapshot = createLocalSnapshot();
    const code = getDeviceRecord().pairingCode;
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Devices</p>
          <h2 id="sheetTitle">手機照顧，電腦協助。</h2>
          <p>同一份提醒，可在 iPhone、Android、Windows、macOS、Linux 之間搬移。資料不經伺服器。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="settings-grid">
        <section class="platform-grid">
          ${renderPlatformCard("這台", `${profile.label} · ${profile.mode}`, "使用中")}
          ${renderPlatformCard("手機", "iPhone / Android", "提醒入口")}
          ${renderPlatformCard("電腦", "Windows / macOS / Linux", "家人管理")}
        </section>
        <section class="handoff-panel">
          <p class="meta-label">Handoff Code</p>
          <div class="handoff-code">${escapeHtml(code)}</div>
          <p>本機產生的接續碼。正式版會作為端對端加密身分。</p>
          <div class="care-actions">
            <button class="secondary-action" type="button" data-copy-code>複製碼</button>
            <button class="secondary-action" type="button" data-export-snapshot>匯出備份</button>
            <label class="primary-action" for="restoreSnapshotInput">匯入備份</label>
            <input class="hidden-input" id="restoreSnapshotInput" type="file" accept=".json,application/json" />
          </div>
        </section>
        <section class="handoff-panel">
          <p class="meta-label">Universal Handoff</p>
          <h3>任何系統都能接。</h3>
          <p>把狀態打包成一段文字，另一台貼上即可。</p>
          <textarea class="handoff-textarea" data-handoff-input placeholder="貼上接續包"></textarea>
          <div class="care-actions">
            <button class="secondary-action" type="button" data-copy-handoff>複製接續包</button>
            <button class="primary-action" type="button" data-import-handoff>接上</button>
          </div>
        </section>
        <section class="handoff-readiness" aria-label="跨平台接續狀態">
          ${renderHandoffReadiness()}
        </section>
        <section class="platform-note">
          <p class="meta-label">Safety</p>
          <h3>30 秒安全確認。</h3>
          <p>長輩按「我沒事」只回報安全；沒回覆才依授權走定位備援。</p>
          <button class="secondary-action mini-action" type="button" data-open-safety>設定</button>
        </section>
        <section class="platform-note">
          <p class="meta-label">Rule</p>
          <h3>不同品牌，同一個資料核心。</h3>
          <p>iOS 不能靜默讀聊天，Android 可由通知讀取，桌機接分享與匯出。Focus Oyl 把它們收成同一個時間軸。</p>
        </section>
        <section class="platform-note">
          <p class="meta-label">Shortcut</p>
          <h3>iPhone 用捷徑也能接。</h3>
          <p>focusoyl://import?text=... 已保留。捷徑可把選取文字交給 Focus Oyl。</p>
        </section>
      </div>
    `);

    document.querySelector("[data-copy-code]")?.addEventListener("click", copyPairingCode);
    document.querySelector("[data-export-snapshot]")?.addEventListener("click", downloadLocalSnapshot);
    document.querySelector("[data-copy-handoff]")?.addEventListener("click", copyHandoffPackage);
    document.querySelector("[data-import-handoff]")?.addEventListener("click", importHandoffPackage);
    document.querySelector("[data-open-safety]")?.addEventListener("click", openSafetySheet);
    document.getElementById("restoreSnapshotInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) readSnapshotFile(file);
    });
  }

  function openSafetySheet() {
    const profile = getDeviceProfile();
    const pending = isSafetyCheckPending();
    const remaining = pending ? remainingSafetySeconds() : SAFETY_TIMEOUT_SECONDS;
    const last = safetyState?.status ? safetyState : null;
    showSheet(`
      <div class="sheet-head">
        <div>
          <p class="eyebrow">Safety</p>
          <h2 id="sheetTitle">按一下「我沒事」就好。</h2>
          <p>30 秒內回覆只回報安全；逾時才走授權的定位備援。</p>
        </div>
        <button class="close-button" type="button" data-close aria-label="關閉">×</button>
      </div>
      <div class="settings-grid">
        <section class="safety-hero ${pending ? "is-active" : ""}">
          <p class="meta-label">${pending ? "Waiting" : "Check"}</p>
          <h3>${pending ? "等待回覆" : "呼叫確認"}</h3>
          <div class="safety-count" id="safetyCountdown">${pending ? remaining : SAFETY_TIMEOUT_SECONDS}</div>
          <p>${pending ? "長輩手機會響鈴與震動。" : "不取代緊急救援電話。"}</p>
          <div class="safety-actions">
            ${pending ? `
              <button class="primary-action safety-ok" type="button" data-safety-safe>我沒事</button>
              <button class="secondary-action" type="button" data-safety-timeout>演練逾時</button>
            ` : `
              <button class="primary-action" type="button" data-start-safety="network">呼叫</button>
              <button class="secondary-action" type="button" data-start-safety="sms">SAFE_CHECK 簡訊</button>
            `}
          </div>
        </section>

        <section class="safety-policy">
          <label class="safety-field">
            <span>主要家屬</span>
            <input type="text" data-safety-name value="${escapeHtml(settings.safetyFamilyName || "")}" placeholder="女兒 / 兒子 / 太太" autocomplete="name" />
            <small>只存在本機。</small>
          </label>
          <label class="safety-field">
            <span>家屬手機</span>
            <input type="tel" data-safety-phone value="${escapeHtml(settings.safetyFamilyPhone || "")}" placeholder="+886 9xx xxx xxx" autocomplete="tel" />
            <small>只存在本機。Android SMS 備援只接受這支號碼。</small>
          </label>
          <label class="safety-field">
            <span>備援手機</span>
            <input type="tel" data-safety-backup-phone value="${escapeHtml(settings.safetyBackupPhone || "")}" placeholder="可留空" autocomplete="tel" />
            <small>主要家屬聯絡不到時備援。</small>
          </label>
          <label class="source-item">
            <span class="source-switch">
              <input type="checkbox" data-safety-setting="safetyTestMode" ${settings.safetyTestMode !== false ? "checked" : ""} />
              <span></span>
            </span>
            <span>
              <h3>演練模式</h3>
              <p>可完整演練，但不會真的傳位置或 SMS。</p>
            </span>
            <b class="source-state">${settings.safetyTestMode !== false ? "保護中" : "正式"}</b>
          </label>
          <label class="source-item">
            <span class="source-switch">
              <input type="checkbox" data-safety-setting="safetyLocationFallback" ${settings.safetyLocationFallback ? "checked" : ""} />
              <span></span>
            </span>
            <span>
              <h3>逾時才傳位置</h3>
              <p>按「我沒事」時不傳；30 秒沒回覆才回報。</p>
            </span>
            <b class="source-state">${settings.safetyLocationFallback ? "已同意" : "關閉"}</b>
          </label>
          <label class="source-item">
            <span class="source-switch">
              <input type="checkbox" data-safety-setting="safetySmsFallback" ${settings.safetySmsFallback ? "checked" : ""} />
              <span></span>
            </span>
            <span>
              <h3>沒網路時接受 SAFE_CHECK</h3>
              <p>Android 可走 SMS 備援；iPhone 不支援。</p>
            </span>
            <b class="source-state">${settings.safetySmsFallback ? "備援開啟" : "關閉"}</b>
          </label>
          <button class="secondary-action" type="button" data-save-safety>儲存</button>
        </section>

        <section class="safety-readiness">
          ${renderSafetyReadiness()}
        </section>

        <section class="device-health-panel" aria-label="裝置可靠性">
          ${renderDeviceHealthPanel()}
        </section>

        <section class="safety-flow" aria-label="安全確認流程">
          ${renderSafetyFlowStep("1", "呼叫", "網路走推播；無網路可由 SMS 啟動。")}
          ${renderSafetyFlowStep("2", "確認", "響鈴、震動，畫面只有一顆大按鈕。")}
          ${renderSafetyFlowStep("3", "備援", "30 秒沒按才依授權傳位置。")}
        </section>

        <section class="platform-note">
          <p class="meta-label">Last Check</p>
          <h3>${escapeHtml(safetyStatusTitle(last))}</h3>
          <p>${escapeHtml(safetyStatusDetail(last, profile))}</p>
        </section>
      </div>
    `);

    document.querySelectorAll("[data-start-safety]").forEach((button) => {
      button.addEventListener("click", () => startSafetyCheck(button.dataset.startSafety || "network"));
    });
    document.querySelector("[data-safety-safe]")?.addEventListener("click", respondSafetyOk);
    document.querySelector("[data-safety-timeout]")?.addEventListener("click", () => finishSafetyTimeout({ simulated: true }));
    document.querySelector("[data-save-safety]")?.addEventListener("click", saveSafetySettings);
    refreshSafetyCountdownLabel();
  }

  function renderSafetyFlowStep(index, title, detail) {
    return `
      <article>
        <span>${escapeHtml(index)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(detail)}</p>
      </article>
    `;
  }

  function renderSafetyReadiness() {
    const recentDrill = hasRecentSafetyDrill();
    const readiness = [
      {
        title: "主要家屬",
        detail: settings.safetyFamilyPhone
          ? `${settings.safetyFamilyName || "家屬"} · SAFE_CHECK 白名單`
          : "先填家屬手機，避免陌生簡訊觸發",
        state: settings.safetyFamilyPhone ? "就緒" : "需要",
        ready: Boolean(settings.safetyFamilyPhone),
      },
      {
        title: "備援家屬",
        detail: settings.safetyBackupPhone ? "已設定第二支聯絡電話" : "建議多留一支，降低失聯風險",
        state: settings.safetyBackupPhone ? "已加" : "建議",
        ready: Boolean(settings.safetyBackupPhone),
        optional: true,
      },
      {
        title: "演練模式",
        detail: settings.safetyTestMode !== false ? "演練不會傳 SMS 或位置" : "正式逾時會依授權回報",
        state: settings.safetyTestMode !== false ? "保護中" : "正式",
        ready: true,
      },
      {
        title: "最近演練",
        detail: recentDrill ? `上次 ${formatTimelineDate(settings.safetyLastDrillAt)}` : "建議先按一次呼叫確認演練",
        state: recentDrill ? "完成" : "待做",
        ready: recentDrill,
      },
      {
        title: "逾時定位",
        detail: settings.safetyLocationFallback ? "只在 30 秒未回覆後使用" : "目前不會回傳位置",
        state: settings.safetyLocationFallback ? "同意" : "關閉",
        ready: Boolean(settings.safetyLocationFallback),
      },
      {
        title: "SMS 備援",
        detail: settings.safetySmsFallback ? "Android 可接收 SAFE_CHECK" : "沒網路時不啟動簡訊備援",
        state: settings.safetySmsFallback ? "開啟" : "關閉",
        ready: Boolean(settings.safetySmsFallback),
      },
    ];

    return readiness.map((item) => `
      <article class="${item.ready ? "is-ready" : item.optional ? "is-advisory" : "is-waiting"}">
        <span>${escapeHtml(item.state)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `).join("");
  }

  function renderDeviceHealthPanel() {
    return `
      <div class="device-health-head">
        <span>
          <p class="meta-label">Device Reliability</p>
          <h3>這台裝置能不能可靠提醒</h3>
        </span>
        <b>${escapeHtml(deviceHealthState())}</b>
      </div>
      <div class="device-health-grid">
        ${deviceHealthItems().map((item) => `
          <article class="${item.ready ? "is-ready" : item.optional ? "is-advisory" : "is-waiting"}">
            <span>${escapeHtml(item.state)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.detail)}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  async function saveSafetySettings() {
    document.querySelectorAll("[data-safety-setting]").forEach((input) => {
      settings[input.dataset.safetySetting] = input.checked;
    });
    settings.safetyFamilyName = sanitizeLabel(document.querySelector("[data-safety-name]")?.value || "");
    settings.safetyFamilyPhone = sanitizePhone(document.querySelector("[data-safety-phone]")?.value || "");
    settings.safetyBackupPhone = sanitizePhone(document.querySelector("[data-safety-backup-phone]")?.value || "");
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    await window.FocusOylNative?.configureSafetyCheck?.(buildSafetyConfig());
    const permissionSources = ["postNotifications", "exactAlarm", "batteryOptimization"];
    if (settings.safetyLocationFallback) permissionSources.push("location");
    if (settings.safetySmsFallback) permissionSources.push("sms");
    for (const source of permissionSources) {
      try {
        await window.FocusOylNative?.requestDataSource?.(source);
      } catch {
        // Native permission flows are best effort from the preview shell.
      }
    }
    toast("安全設定已儲存", settings.safetyLocationFallback
      ? settings.safetyTestMode !== false
        ? "目前仍在演練模式；可演練逾時，但不會真的傳位置。"
        : "正式逾時定位已開啟；按「我沒事」仍不會傳位置。"
      : "逾時定位目前關閉。");
    openSafetySheet();
  }

  async function startSafetyCheck(mode = "network") {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SAFETY_TIMEOUT_SECONDS * 1000);
    safetyState = {
      id: createLocalId("safe"),
      mode,
      status: "waiting",
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timeoutSeconds: SAFETY_TIMEOUT_SECONDS,
      locationFallback: Boolean(settings.safetyLocationFallback),
      smsFallback: Boolean(settings.safetySmsFallback),
      familyName: sanitizeLabel(settings.safetyFamilyName || ""),
      familyPhone: sanitizePhone(settings.safetyFamilyPhone || ""),
      backupPhone: sanitizePhone(settings.safetyBackupPhone || ""),
      testMode: settings.safetyTestMode !== false,
      locationShared: false,
      events: [
        {
          type: mode === "sms" ? "sms-received" : "family-requested",
          at: now.toISOString(),
        },
      ],
    };
    saveSafetyState();
    startSafetyCountdown();
    setWorking("等待安全確認");
    toast("已呼叫確認", "長輩端會出現 30 秒的大按鈕。");

    try {
      await window.FocusOylNative?.startSafetyCheck?.({
        check: safetyState,
        config: buildSafetyConfig(),
      });
    } catch {
      // Browser preview and older native builds keep the web countdown as the source of truth.
    }

    showBrowserNotification("Focus Oyl 安全確認", "家人正在確認你是否安全。30 秒內按「我沒事」。", {
      url: "/#safety",
      safetyCheckId: safetyState.id,
    });
    if (navigator.vibrate) navigator.vibrate([220, 80, 220]);
    openSafetySheet();
  }

  async function respondSafetyOk() {
    if (!isSafetyCheckPending()) return;
    const now = new Date();
    safetyState = {
      ...safetyState,
      status: "safe",
      respondedAt: now.toISOString(),
      locationShared: false,
      events: [
        ...(safetyState.events || []),
        { type: "elder-safe", at: now.toISOString() },
      ],
    };
    saveSafetyState();
    if (safetyState.testMode !== false) recordSafetyDrill(now);
    startSafetyCountdown();
    setIdle("已回報安全");
    toast("已回報安全", "沒有傳送位置。");
    try {
      await window.FocusOylNative?.resolveSafetyCheck?.({
        id: safetyState.id,
        action: "safe",
        locationShared: false,
      });
    } catch {
      // Native safety resolution is optional in browser preview.
    }
    openSafetySheet();
    renderCurrentSignal();
  }

  async function finishSafetyTimeout(options = {}) {
    if (!isSafetyCheckPending()) return;
    const now = new Date();
    const shouldShareLocation = Boolean(safetyState.locationFallback || settings.safetyLocationFallback);
    safetyState = {
      ...safetyState,
      status: shouldShareLocation ? "location-pending" : "missed",
      timedOutAt: now.toISOString(),
      simulated: Boolean(options.simulated),
      testMode: safetyState.testMode !== false,
      events: [
        ...(safetyState.events || []),
        { type: "timeout", at: now.toISOString() },
      ],
    };
    if (safetyState.testMode !== false) recordSafetyDrill(now);
    saveSafetyState();

    let nativeResult = null;
    if (shouldShareLocation) {
      try {
        nativeResult = await window.FocusOylNative?.resolveSafetyCheck?.({
          id: safetyState.id,
          action: "timeout",
          shareLocation: true,
          mode: safetyState.mode,
        });
      } catch {
        nativeResult = null;
      }
    }

    safetyState = {
      ...safetyState,
      status: shouldShareLocation ? "location-sent" : "missed",
      locationShared: Boolean(shouldShareLocation && safetyState.testMode === false && nativeResult?.locationShared),
      locationStatus: shouldShareLocation
        ? safetyState.testMode !== false ? "test-mode" : nativeResult?.locationShared ? "sent" : "pending-native"
        : "disabled",
      events: [
        ...(safetyState.events || []),
        {
          type: shouldShareLocation ? "location-fallback" : "location-disabled",
          at: new Date().toISOString(),
        },
      ],
    };
    saveSafetyState();
    createSafetyTimelineSignal(safetyState);
    setIdle(shouldShareLocation ? "安全確認逾時" : "未回覆");
    toast("30 秒內未回覆", shouldShareLocation
      ? safetyState.testMode !== false
        ? "演練模式已跑完逾時定位流程；不會真的傳位置或簡訊。"
        : "正式模式會用已授權定位回報家屬。"
      : "尚未開啟逾時定位回傳。");
    openSafetySheet();
    renderCurrentSignal();
  }

  function createSafetyTimelineSignal(check) {
    const title = check.locationFallback ? "安全確認逾時" : "安全確認未回覆";
    const detail = check.locationFallback
      ? check.testMode !== false
        ? "長輩 30 秒內未按「我沒事」。演練模式只記錄流程，不傳送位置或簡訊。"
        : "長輩 30 秒內未按「我沒事」。已依預先同意的定位備援回報家屬。"
      : "長輩 30 秒內未按「我沒事」，但逾時定位尚未開啟。";
    const signal = {
      id: `${check.id}-timeline`,
      title,
      detail,
      category: "family",
      source: check.mode === "sms" ? "safety-sms" : "safety-check",
      confidence: "high",
      createdAt: new Date().toISOString(),
      schedule: attachSchedule({
        title,
        detail,
        category: "family",
        createdAt: new Date().toISOString(),
      }),
    };
    activeSignals = sortSignals(dedupeSignals([signal, ...activeSignals])).slice(0, 140);
    saveSignals();
  }

  function startSafetyCountdown() {
    if (safetyTimer) {
      window.clearInterval(safetyTimer);
      safetyTimer = null;
    }
    if (!isSafetyCheckPending()) return;
    safetyTimer = window.setInterval(() => {
      if (!isSafetyCheckPending()) {
        startSafetyCountdown();
        return;
      }
      refreshSafetyCountdownLabel();
      if (remainingSafetySeconds() <= 0) {
        finishSafetyTimeout();
      }
    }, 1000);
  }

  function refreshSafetyCountdownLabel() {
    const label = document.getElementById("safetyCountdown");
    if (!label) return;
    label.textContent = String(isSafetyCheckPending()
      ? Math.max(0, remainingSafetySeconds())
      : SAFETY_TIMEOUT_SECONDS);
  }

  function isSafetyCheckPending() {
    return safetyState?.status === "waiting" && remainingSafetySeconds() > 0;
  }

  function remainingSafetySeconds() {
    const expiresAt = Date.parse(safetyState?.expiresAt || "");
    if (!Number.isFinite(expiresAt)) return 0;
    return Math.ceil((expiresAt - Date.now()) / 1000);
  }

  function hasRecentSafetyDrill() {
    const timestamp = Date.parse(settings.safetyLastDrillAt || "");
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000;
  }

  function recordSafetyDrill(date) {
    settings.safetyLastDrillAt = (date || new Date()).toISOString();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function buildSafetyConfig() {
    return {
      enabled: Boolean(settings.safetyLocationFallback || settings.safetySmsFallback),
      timeoutSeconds: SAFETY_TIMEOUT_SECONDS,
      locationFallback: Boolean(settings.safetyLocationFallback),
      smsFallback: Boolean(settings.safetySmsFallback),
      familyName: sanitizeLabel(settings.safetyFamilyName || ""),
      familyPhone: sanitizePhone(settings.safetyFamilyPhone || ""),
      backupPhone: sanitizePhone(settings.safetyBackupPhone || ""),
      testMode: settings.safetyTestMode !== false,
      noLocationOnSafe: true,
      deviceHealth: summarizeDeviceHealth(),
    };
  }

  function summarizeDeviceHealth() {
    return {
      online: Boolean(deviceHealth.online),
      notificationPermission: deviceHealth.notificationPermission,
      batteryLevel: Number.isFinite(deviceHealth.batteryLevel) ? deviceHealth.batteryLevel : null,
      charging: typeof deviceHealth.charging === "boolean" ? deviceHealth.charging : null,
      canScheduleExactAlarms: typeof deviceHealth.canScheduleExactAlarms === "boolean"
        ? deviceHealth.canScheduleExactAlarms
        : null,
      powerSaveMode: typeof deviceHealth.powerSaveMode === "boolean" ? deviceHealth.powerSaveMode : null,
      batteryOptimizationIgnored: typeof deviceHealth.batteryOptimizationIgnored === "boolean"
        ? deviceHealth.batteryOptimizationIgnored
        : null,
      checkedAt: deviceHealth.checkedAt || new Date().toISOString(),
    };
  }

  function safetyStatusTitle(check) {
    if (!check) return "尚未發起安全確認";
    if (check.status === "waiting") return "等待回覆中";
    if (check.status === "safe") return "已回報安全";
    if (check.status === "location-sent") return "逾時，已進入定位備援";
    if (check.status === "missed") return "逾時，未傳位置";
    return "安全確認已記錄";
  }

  function safetyStatusDetail(check, profile) {
    if (!check) return `${profile.family} 可以作為長輩端或家屬端。`;
    const at = check.respondedAt || check.timedOutAt || check.requestedAt;
    const when = at ? formatTimelineDate(at) : "剛剛";
    if (check.status === "safe") return `${when} 長輩按下「我沒事」，沒有傳送位置。`;
    if (check.status === "location-sent" && check.testMode !== false) return `${when} 逾時；演練模式已記錄流程，沒有傳送 GPS 或 SMS。`;
    if (check.status === "location-sent") return `${when} 逾時；已交由原生層回傳 GPS 或 SMS 定位。`;
    if (check.status === "missed") return `${when} 逾時；因未開啟定位備援，所以只記錄未回覆。`;
    return `${when} 發起，剩餘 ${Math.max(0, remainingSafetySeconds())} 秒。`;
  }

  function renderPlatformCard(title, detail, state) {
    return `
      <article class="platform-card">
        <p>${escapeHtml(title)}</p>
        <h3>${escapeHtml(detail)}</h3>
        <span>${escapeHtml(state)}</span>
      </article>
    `;
  }

  function getDeviceRecord() {
    try {
      const existing = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
      if (existing?.id && existing?.pairingCode) return existing;
    } catch {
      // Fall through and create a local device record.
    }

    const record = {
      id: createLocalId("device"),
      pairingCode: createPairingCode(),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(record));
    return record;
  }

  function createLocalId(prefix) {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    }
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("") || Math.random().toString(16).slice(2);
    return `${prefix}-${value}`;
  }

  function createPairingCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(9);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    }
    const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
    return `${chars.slice(0, 3).join("")}-${chars.slice(3, 6).join("")}-${chars.slice(6, 9).join("")}`;
  }

  function getDeviceProfile() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isWindows = /Windows/i.test(ua);
    const isMac = /Macintosh|Mac OS X/i.test(ua);
    const isLinux = /Linux/i.test(ua) && !isAndroid;
    const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
    const family = isIOS ? "iPhone / iPad"
      : isAndroid ? "Android"
        : isWindows ? "Windows"
          : isMac ? "macOS"
            : isLinux ? "Linux"
              : "Web";
    const installed = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone;
    const native = window.FocusOylNative?.isNativeApp?.();
    return {
      family,
      label: isMobile ? "手機端" : "電腦端",
      mode: native ? "原生殼" : installed ? "已安裝 PWA" : "瀏覽器 PWA",
    };
  }

  function createLocalSnapshot() {
    return {
      kind: SNAPSHOT_KIND,
      version: 2,
      exportedAt: new Date().toISOString(),
      device: {
        ...getDeviceRecord(),
        profile: getDeviceProfile(),
      },
      handoff: {
        format: "text",
        prefix: HANDOFF_PREFIX,
        localOnly: true,
      },
      settings,
      automationStatus,
      feedback,
      safetyState,
      signals: activeSignals,
      memory: window.UltraMemory?.getRecent?.() || [],
    };
  }

  function parseLocalSnapshot(content) {
    try {
      const snapshot = JSON.parse(String(content || ""));
      if (snapshot?.kind !== SNAPSHOT_KIND || !Array.isArray(snapshot.signals)) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  function restoreLocalSnapshot(snapshot) {
    settings = { ...(snapshot.settings || {}) };
    automationStatus = { ...(snapshot.automationStatus || {}) };
    feedback = snapshot.feedback?.categories ? snapshot.feedback : { categories: {}, events: [] };
    safetyState = snapshot.safetyState || null;
    activeSignals = hydrateSignals(snapshot.signals || []);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(AUTOMATION_STATUS_KEY, JSON.stringify(automationStatus));
    saveSafetyState();
    saveFeedback();
    if (Array.isArray(snapshot.memory)) {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ items: snapshot.memory.slice(0, 80) }));
    }
    saveSignals();
    startAutomationLoop();
    renderCurrentSignal();
    toast("已接上這份資料", `已恢復 ${activeSignals.length} 件提醒。`);
  }

  function tryRestoreSnapshot(content) {
    const snapshot = parseLocalSnapshot(content);
    if (!snapshot) return false;
    restoreLocalSnapshot(snapshot);
    return true;
  }

  function downloadLocalSnapshot() {
    const snapshot = createLocalSnapshot();
    const body = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `focus-oyl-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    toast("已建立本機備份", "可以把這個 JSON 放到另一台裝置匯入。");
  }

  function renderHandoffReadiness() {
    const profile = getDeviceProfile();
    const memoryCount = window.UltraMemory?.getRecent?.().length || 0;
    const hasSignals = activeSignals.length > 0;
    const hasSafety = Boolean(settings.safetyFamilyPhone || settings.safetyBackupPhone || safetyState);
    const hasAutomation = Boolean(settings.automationEnabled);
    const items = [
      {
        title: "資料核心",
        detail: `${activeSignals.length} 件提醒 · ${memoryCount} 件記憶`,
        state: hasSignals || memoryCount ? "可接續" : "空白",
        tone: hasSignals || memoryCount ? "is-ready" : "is-advisory",
      },
      {
        title: "自動化設定",
        detail: hasAutomation ? "安靜時段、提前量與掃描偏好會一起帶走" : "目前暫停自動掃描，接續後仍保留選擇",
        state: hasAutomation ? "包含" : "已暫停",
        tone: hasAutomation ? "is-ready" : "is-advisory",
      },
      {
        title: "安全確認",
        detail: hasSafety ? "家屬、演練、30 秒確認狀態會一起打包" : "尚未設定家屬與安全確認",
        state: hasSafety ? "包含" : "待設定",
        tone: hasSafety ? "is-ready" : "is-waiting",
      },
      {
        title: "平台",
        detail: `${profile.family} · ${profile.mode}`,
        state: "不綁品牌",
        tone: "is-ready",
      },
      {
        title: "備援路徑",
        detail: "JSON 檔與文字接續包皆可離線搬移",
        state: "本機",
        tone: "is-ready",
      },
    ];

    return items.map((item) => `
      <article class="${item.tone}">
        <span>${escapeHtml(item.state)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `).join("");
  }

  async function copyHandoffPackage() {
    const token = createHandoffPackage();
    try {
      await navigator.clipboard?.writeText?.(token);
      toast("已複製接續包", "貼到另一台裝置即可接上。");
    } catch {
      const input = document.querySelector("[data-handoff-input]");
      if (input) {
        input.value = token;
        input.focus();
        input.select?.();
      }
      toast("接續包已放在欄位", "可以手動選取複製。");
    }
  }

  function importHandoffPackage() {
    const input = document.querySelector("[data-handoff-input]");
    const snapshot = parseHandoffPackage(input?.value || "");
    if (!snapshot) {
      toast("接續包無法讀取", "請貼上 Focus Oyl 接續包或備份 JSON。");
      return;
    }
    restoreLocalSnapshot(snapshot);
    openDeviceSheet();
  }

  function createHandoffPackage() {
    const snapshot = createLocalSnapshot();
    return `${HANDOFF_PREFIX}${base64UrlEncode(JSON.stringify(snapshot))}`;
  }

  function parseHandoffPackage(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    if (!text.startsWith(HANDOFF_PREFIX)) return parseLocalSnapshot(text);
    try {
      return parseLocalSnapshot(base64UrlDecode(text.slice(HANDOFF_PREFIX.length)));
    } catch {
      return null;
    }
  }

  function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecode(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function readSnapshotFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      if (!tryRestoreSnapshot(String(reader.result || ""))) {
        toast("不是 Focus Oyl 備份", "請選擇由 Focus Oyl 匯出的 JSON 檔。");
      }
    };
    reader.readAsText(file);
  }

  async function copyPairingCode() {
    const code = getDeviceRecord().pairingCode;
    try {
      await navigator.clipboard?.writeText?.(code);
      toast("已複製接續碼", code);
    } catch {
      toast("接續碼", code);
    }
  }

  function showSheet(html) {
    els.sheetContent.innerHTML = html;
    applyCascadeIndices(els.sheetContent);
    splitHeadlineChars(els.sheetContent);
    els.sheetBackdrop.hidden = false;
    requestAnimationFrame(() => els.sheetBackdrop.classList.add("show"));
    els.sheetContent.querySelector("[data-close]")?.addEventListener("click", closeSheet);
  }

  function splitHeadlineChars(root) {
    return root;
    if (!root) return;
    if (document.documentElement.classList.contains("capture-mode")) return;
    root.querySelectorAll(".sheet-head h2").forEach((heading) => {
      if (heading.dataset.charsSplit === "1") return;
      const text = heading.textContent || "";
      heading.setAttribute("aria-label", text);
      heading.textContent = "";
      [...text].forEach((char, index) => {
        const span = document.createElement("span");
        span.className = "char";
        span.setAttribute("aria-hidden", "true");
        span.textContent = char === " " ? " " : char;
        span.style.setProperty("--char-delay", `${index * 26}ms`);
        heading.appendChild(span);
      });
      heading.dataset.charsSplit = "1";
    });
  }

  function applyCascadeIndices(root) {
    if (!root) return;
    const grids = root.querySelectorAll(
      ".settings-grid, .timeline-shell, .import-grid, .reminder-grid"
    );
    grids.forEach((grid) => {
      [...grid.children].forEach((child, index) => {
        child.style.setProperty("--cascade-i", String(Math.min(index, 9)));
      });
    });
    const lists = root.querySelectorAll(".timeline-list, .timeline-track");
    lists.forEach((list) => {
      [...list.children].forEach((child, index) => {
        child.style.setProperty("--cascade-i", String(Math.min(index, 11)));
      });
    });
  }

  function closeSheet() {
    els.sheetBackdrop.classList.remove("show");
    window.setTimeout(() => {
      els.sheetBackdrop.hidden = true;
      els.sheetContent.innerHTML = "";
    }, 240);
  }

  function processText(text, source, options = {}) {
    if (!text?.trim()) {
      if (!options.silent) {
        toast("沒有可分析的內容", "貼上一段聊天、帳單或保固文字再試一次。");
      }
      return window.UltraMemory.analyzeText("", { source });
    }

    if (!options.silent) setWorking("本機分析中");
    const analysis = window.UltraMemory.ingestText(text, { source });
    const routedByFeedback = [];
    const actionable = (analysis.actionable || []).filter((item) => {
      if (!shouldReviewBecauseOfFeedback(item)) return true;
      routedByFeedback.push({
        ...item,
        needsReview: true,
        confidence: item.confidence === "high" ? "medium" : item.confidence,
        reviewReason: feedbackReviewReason(item) || item.reviewReason,
      });
      return false;
    });
    const review = [...routedByFeedback, ...(analysis.review || [])].slice(0, 20);
    const newSignals = [
      ...actionable.map((item) => signalFromMemoryItem(item, false)),
      ...review.map((item) => signalFromMemoryItem(item, true)),
    ];

    const before = activeSignals.length;
    activeSignals = sortSignals(dedupeSignals([...newSignals, ...activeSignals])).slice(0, 140);
    saveSignals();
    newSignals.forEach(scheduleSignalReminder);
    renderCurrentSignal();
    if (!options.silent) {
      setIdle(newSignals.length ? `${newSignals.length} 個訊號已收進本地` : "沒有發現需要提醒的事");
    }
    analysis.createdSignals = Math.max(0, activeSignals.length - before);
    analysis.summary.routedByFeedback = routedByFeedback.length;

    if (!options.silent && actionable.length) {
      toast(newSignals[0].title, newSignals[0].detail);
      showBrowserNotification(newSignals[0].title, newSignals[0].detail, {
        signalId: newSignals[0].id,
        url: "/#timeline",
      });
    } else if (!options.silent && review.length) {
      toast("有可能要處理的內容", `${review.length} 件已放進待確認，避免安靜漏掉。`);
    }

    analysis.createdSignalIds = newSignals.map((signal) => signal.id);
    return analysis;
  }

  function signalFromMemoryItem(item, needsReview) {
    const learnedReason = needsReview ? feedbackReviewReason(item) : "";
    const title = needsReview
      ? `請確認：${summarizeLine(item.line)}`
      : item.suggestion;
    return {
      id: `${needsReview ? "review" : "signal"}-${item.id}`,
      title,
      detail: item.line,
      score: item.score,
      confidence: item.confidence,
      reviewReason: item.reviewReason || learnedReason,
      feedbackHint: learnedReason,
      needsReview,
      category: item.category,
      source: item.source,
      createdAt: item.createdAt,
      dates: item.dates,
      amounts: item.amounts,
      schedule: attachSchedule(item),
      done: false,
    };
  }

  function summarizeLine(line) {
    const text = String(line || "")
      .replace(/\s*收到時間\s+\S+(?:\s+\S+)?\s*/u, " ")
      .replace(/^[\s:：·-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "可能的提醒";
    if (text.length <= 24) return text;
    return `${text.slice(0, 24)}…`;
  }

  function confidenceLabel(value) {
    if (value === "high") return "高信心";
    if (value === "medium") return "中信心";
    if (value === "low") return "低信心";
    return "待判斷";
  }

  function categoryLabel(value) {
    const map = {
      warranty: "保固",
      finance: "付款",
      work: "工作",
      health: "健康",
      travel: "行程",
      family: "生活",
      reply: "回覆",
      message: "訊息",
      reminder: "提醒",
    };
    return map[value] || "提醒";
  }

  function sourceLabel(value) {
    const raw = String(value || "");
    if (raw.startsWith("auto-notifications")) return "授權通知";
    if (raw.startsWith("auto-calendar")) return "授權行事曆";
    if (raw.startsWith("auto-photos")) return "授權照片";
    if (raw.startsWith("ocr")) return "本機 OCR";
    if (raw.includes("share")) return "分享進來";
    if (raw.includes("manual")) return "手動匯入";
    if (raw.includes("chat")) return "聊天匯入";
    return "本機文字";
  }

  function trustLabel(signal) {
    return `${categoryLabel(signal.category)} · ${sourceLabel(signal.source)} · ${confidenceLabel(signal.confidence)}`;
  }

  function renderImportResult(host, analysis) {
    const createdSignals = (analysis.createdSignalIds || [])
      .map((id) => activeSignals.find((signal) => signal.id === id))
      .filter(Boolean);
    const rows = createdSignals.length
      ? createdSignals.filter((signal) => !signal.needsReview).slice(0, 5)
      : (analysis.actionable || []).slice(0, 5).map((item) => ({
        title: item.suggestion,
        detail: item.line,
        score: item.score,
        confidence: item.confidence,
        schedule: attachSchedule(item),
      }));
    const reviewRows = createdSignals.length
      ? createdSignals.filter((signal) => signal.needsReview).slice(0, 5)
      : (analysis.review || []).slice(0, 5).map((item) => ({
        title: `請確認：${summarizeLine(item.line)}`,
        detail: item.line,
        score: item.score,
        confidence: item.confidence,
        reviewReason: item.reviewReason,
        needsReview: true,
        schedule: attachSchedule(item),
      }));
    host.innerHTML = `
      <div class="result-strip">
        <div><b>${analysis.summary.actionable}</b><span>明確提醒</span></div>
        <div><b>${analysis.summary.review || 0}</b><span>待確認</span></div>
        <div><b>${analysis.summary.amounts}</b><span>金額</span></div>
      </div>
      <div class="signal-list" style="margin-top:10px">
        ${rows.length || reviewRows.length
          ? `${rows.map((signal) => renderSignalItem(signal, { withActions: true })).join("")}${reviewRows.map((signal) => renderSignalItem(signal, { withActions: true })).join("")}`
          : `<div class="empty-state">沒有抓到明確提醒。可以貼更完整的上下文，或把這段先收進記憶。</div>`}
      </div>
    `;
    wireInlineSignalActions(host);
  }

  function createDefaultDeviceHealth() {
    return {
      ok: true,
      platform: window.FocusOylNative?.getPlatform?.() || "web",
      native: Boolean(window.FocusOylNative?.isNativeApp?.()),
      online: navigator.onLine !== false,
      notificationPermission: notificationPermissionState(),
      batteryLevel: null,
      charging: null,
      canScheduleExactAlarms: null,
      powerSaveMode: null,
      batteryOptimizationIgnored: null,
      checkedAt: new Date().toISOString(),
    };
  }

  function initDeviceHealth() {
    updateDeviceHealth();
    window.addEventListener("online", updateDeviceHealth);
    window.addEventListener("offline", updateDeviceHealth);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) updateDeviceHealth();
    });
    if ("permissions" in navigator) {
      navigator.permissions?.query?.({ name: "notifications" }).then((permission) => {
        permission.onchange = updateDeviceHealth;
      }).catch(() => {});
    }
  }

  async function updateDeviceHealth() {
    const next = {
      ...deviceHealth,
      online: navigator.onLine !== false,
      notificationPermission: notificationPermissionState(),
      checkedAt: new Date().toISOString(),
    };
    try {
      const native = await window.FocusOylNative?.getDeviceHealth?.();
      Object.assign(next, normalizeDeviceHealth(native));
    } catch {
      try {
        const battery = await navigator.getBattery?.();
        if (battery) {
          next.batteryLevel = Math.round(Number(battery.level || 0) * 100);
          next.charging = Boolean(battery.charging);
          battery.onlevelchange = updateDeviceHealth;
          battery.onchargingchange = updateDeviceHealth;
        }
      } catch {
        next.batteryUnavailable = true;
      }
    }
    deviceHealth = next;
    refreshDeviceHealthPanel();
    renderCareConsole(sortSignals(activeSignals).find((signal) => !signal.done));
  }

  function normalizeDeviceHealth(value) {
    const result = value && typeof value === "object" ? value : {};
    const checkedAt = normalizeNativeTime(result.checkedAt) || new Date().toISOString();
    return {
      ok: result.ok !== false,
      platform: result.platform || deviceHealth.platform,
      native: Boolean(result.native),
      online: result.online !== false,
      notificationPermission: normalizeNotificationPermission(result.notificationPermission),
      batteryLevel: Number.isFinite(Number(result.batteryLevel)) ? Number(result.batteryLevel) : deviceHealth.batteryLevel,
      charging: typeof result.charging === "boolean" ? result.charging : deviceHealth.charging,
      canScheduleExactAlarms: typeof result.canScheduleExactAlarms === "boolean"
        ? result.canScheduleExactAlarms
        : deviceHealth.canScheduleExactAlarms,
      powerSaveMode: typeof result.powerSaveMode === "boolean" ? result.powerSaveMode : deviceHealth.powerSaveMode,
      batteryOptimizationIgnored: typeof result.batteryOptimizationIgnored === "boolean"
        ? result.batteryOptimizationIgnored
        : deviceHealth.batteryOptimizationIgnored,
      checkedAt,
    };
  }

  function normalizeNotificationPermission(value) {
    const raw = String(value || "").toLowerCase();
    if (raw === "granted" || raw === "authorized" || raw === "2") return "granted";
    if (raw === "denied" || raw === "1") return "denied";
    if (raw === "not-granted" || raw === "0") return "default";
    if (!raw || raw === "unsupported") return notificationPermissionState();
    return raw;
  }

  function notificationPermissionState() {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission || "default";
  }

  function refreshDeviceHealthPanel() {
    const panel = document.querySelector(".device-health-panel");
    if (panel) panel.innerHTML = renderDeviceHealthPanel();
  }

  function renderCurrentSignal() {
    applySeniorHomeMode();
    const next = sortSignals(activeSignals).find((signal) => !signal.done);
    renderCareConsole(next);
    if (!settings.automationEnabled) {
      els.signalCard.hidden = true;
      renderOneTapCard("setup");
      return;
    }

    if (!next) {
      els.signalCard.hidden = true;
      renderOneTapCard("idle");
      return;
    }
    els.oneTapCard.hidden = true;
    const previousTitle = els.signalTitle.textContent;
    const wasVisible = !els.signalCard.hidden;
    const newTitle = next.title;

    const applyContent = () => {
      els.signalLabel.textContent = currentSignalLabel(next);
      els.signalTitle.textContent = newTitle;
      els.signalDetail.textContent = cleanSignalDetail(next.detail);
      els.signalDone.textContent = next.needsReview ? "提醒我" : "完成";
      els.signalDone.setAttribute("aria-label", next.needsReview ? "確認提醒我" : "完成提醒");
      els.signalDismiss.textContent = next.needsReview ? "不用提醒" : "稍後提醒";
      els.signalDismiss.setAttribute("aria-label", next.needsReview ? "不用提醒" : "稍後提醒");
      els.signalDismiss.hidden = false;
      els.signalCard.hidden = false;
    };

    if (wasVisible && previousTitle && previousTitle !== newTitle) {
      els.signalCard.classList.remove("swapping");
      void els.signalCard.offsetWidth;
      els.signalCard.classList.add("swapping");
      window.setTimeout(applyContent, 165);
      window.setTimeout(() => els.signalCard.classList.remove("swapping"), 500);
    } else {
      applyContent();
    }
  }

  function renderCareConsole(next) {
    if (!els.careConsole) return;
    const profile = getDeviceProfile();
    const snapshot = createLocalSnapshot();
    const pending = activeSignals.filter((signal) => !signal.done).length;
    const reviewCount = activeSignals.filter((signal) => !signal.done && signal.needsReview).length;
    const completed = activeSignals.filter((signal) => signal.done).length;
    const lastScan = automationStatus.lastScanAt ? formatTimelineDate(automationStatus.lastScanAt) : "尚未掃描";
    const title = next ? next.title : settings.automationEnabled ? "目前沒有急件" : "等待家人開啟一鍵照顧";
    const detail = next
      ? `${next.schedule?.labels?.relative || "即將"} · ${cleanSignalDetail(next.detail)}`
        : settings.automationEnabled
        ? `已記住 ${pending + completed} 件 · 待確認 ${reviewCount} · 上次掃描 ${lastScan}`
        : "手機按一次就好。電腦負責匯入、備份、連接。";

    els.careNextTitle.textContent = title;
    els.careNextDetail.textContent = detail;
    els.careSyncCode.textContent = getDeviceRecord().pairingCode;
    els.careSyncDetail.textContent = `${profile.family} · ${snapshot.signals.length} 件提醒 · 本機優先`;
    els.careDeviceList.innerHTML = [
      deviceRow("這台", `${profile.label} · ${profile.mode}`, settings.automationEnabled ? "照顧中" : "待開啟"),
      deviceRow("照護圈", careCircleDetail(), careCircleState()),
      deviceRow("安全確認", safetyMiniDetail(), safetyMiniState()),
      deviceRow("可靠性", deviceHealthMiniDetail(), deviceHealthState()),
      deviceRow("待確認", `${reviewCount} 件`, reviewCount ? "需要確認" : "清空"),
      deviceRow("學習", feedbackSummary(), "只在本機"),
      deviceRow("接續", "備份檔 · 接續碼 · Share", "不綁品牌"),
    ].join("");
  }

  function safetyMiniDetail() {
    if (isSafetyCheckPending()) return `剩餘 ${remainingSafetySeconds()} 秒`;
    if (safetyState?.status === "safe") return "上次只回報安全，未傳位置";
    if (safetyState?.status === "location-sent" && safetyState.testMode !== false) return "上次逾時演練，未傳位置";
    if (safetyState?.status === "location-sent") return "上次逾時，進入定位備援";
    if (settings.safetyTestMode !== false) return "演練模式保護中";
    return settings.safetyLocationFallback ? "逾時定位已同意" : "逾時定位未開啟";
  }

  function safetyMiniState() {
    if (isSafetyCheckPending()) return "等待中";
    if (settings.safetySmsFallback) return "含 SMS 備援";
    return "可呼叫";
  }

  function careCircleDetail() {
    const primary = settings.safetyFamilyName || "主要家屬";
    const phone = settings.safetyFamilyPhone ? "已留電話" : "尚未留電話";
    const backup = settings.safetyBackupPhone ? "含備援" : "無備援";
    return `${primary} · ${phone} · ${backup}`;
  }

  function careCircleState() {
    if (!settings.safetyFamilyPhone) return "待設定";
    if (!settings.safetyBackupPhone) return "建議備援";
    return "就緒";
  }

  function deviceHealthItems() {
    const batteryKnown = Number.isFinite(deviceHealth.batteryLevel);
    const lowBattery = batteryKnown && deviceHealth.batteryLevel <= 20 && !deviceHealth.charging;
    const notificationReady = deviceHealth.notificationPermission === "granted"
      || deviceHealth.notificationPermission === "authorized"
      || deviceHealth.notificationPermission === "not-required";
    const exactReady = deviceHealth.canScheduleExactAlarms !== false;
    const backgroundKnown = typeof deviceHealth.batteryOptimizationIgnored === "boolean"
      || typeof deviceHealth.powerSaveMode === "boolean";
    const backgroundReady = deviceHealth.batteryOptimizationIgnored !== false && deviceHealth.powerSaveMode !== true;
    return [
      {
        title: "網路",
        detail: deviceHealth.online ? "可接收家屬呼叫與同步狀態" : "目前離線；只能靠本機與 SMS 備援",
        state: deviceHealth.online ? "在線" : "離線",
        ready: Boolean(deviceHealth.online),
      },
      {
        title: "通知",
        detail: notificationReady ? "可以跳出大按鈕" : "通知未允許時，長輩可能看不到呼叫",
        state: notificationReady ? "允許" : "需開啟",
        ready: notificationReady,
      },
      {
        title: "電量",
        detail: batteryKnown
          ? `${deviceHealth.batteryLevel}%${deviceHealth.charging ? " · 充電中" : ""}`
          : "瀏覽器無法讀取；請在真機原生版檢查",
        state: lowBattery ? "偏低" : batteryKnown ? "可用" : "未知",
        ready: !lowBattery,
        optional: !batteryKnown,
      },
      {
        title: "背景限制",
        detail: backgroundKnown
          ? backgroundReady ? "省電限制不會明顯阻擋安全確認" : "省電或背景限制可能延後提醒"
          : "瀏覽器無法讀取；請在真機原生版檢查",
        state: backgroundReady ? "正常" : backgroundKnown ? "需設定" : "未知",
        ready: backgroundReady,
        optional: !backgroundKnown,
      },
      {
        title: "精準逾時",
        detail: exactReady ? "30 秒計時可由系統較穩定執行" : "Android 可能延後逾時，需要開啟精準鬧鐘",
        state: exactReady ? "就緒" : "需設定",
        ready: exactReady,
      },
    ];
  }

  function deviceHealthState() {
    const items = deviceHealthItems();
    if (items.some((item) => !item.ready && !item.optional)) return "需處理";
    if (items.some((item) => item.optional && !item.ready)) return "可改善";
    return "可靠";
  }

  function deviceHealthMiniDetail() {
    const battery = Number.isFinite(deviceHealth.batteryLevel)
      ? `${deviceHealth.batteryLevel}%${deviceHealth.charging ? " 充電中" : ""}`
      : "電量未知";
    const online = deviceHealth.online ? "在線" : "離線";
    const notification = deviceHealth.notificationPermission === "granted" ? "通知已開" : "通知待開";
    const background = deviceHealth.powerSaveMode === true || deviceHealth.batteryOptimizationIgnored === false
      ? "背景待設定"
      : "背景正常";
    return `${online} · ${battery} · ${notification} · ${background}`;
  }

  function deviceRow(title, detail, state) {
    return `
      <div class="device-row">
        <span>
          <b>${escapeHtml(title)}</b>
          <span>${escapeHtml(detail)}</span>
        </span>
        <em class="device-state">${escapeHtml(state)}</em>
      </div>
    `;
  }

  function applySeniorHomeMode() {
    els.appShell.classList.add("senior-mode");
    els.appShell.classList.toggle("setup-mode", !settings.automationEnabled);
  }

  function renderOneTapCard(mode) {
    const isSetup = mode === "setup";
    els.oneTapLabel.textContent = isSetup ? "第一次使用" : "今天安心";
    els.oneTapTitle.textContent = isSetup
      ? "按一下就好。"
      : "目前沒有要處理的事。";
    els.oneTapDetail.textContent = isSetup
      ? "之後我會在需要時提醒你。"
      : "需要時我會主動浮上來。";
    els.oneTapButton.textContent = isSetup ? "一鍵開始" : "幫我檢查";
    els.oneTapNote.textContent = isSetup
      ? "權限問題可由家人協助。"
      : "檢查只在這台裝置進行。";
    els.oneTapCard.dataset.mode = mode;
    els.oneTapCard.hidden = false;
  }

  async function handleOneTap() {
    if (settings.automationEnabled) {
      await runAutoScan({ manual: true, preview: !window.FocusOylNative?.isNativeApp?.() });
      renderCurrentSignal();
      return;
    }

    await enableCareMode();
  }

  async function enableCareMode() {
    setWorking("正在開始照顧");
    settings = {
      ...settings,
      automationEnabled: true,
      share: true,
      photos: true,
      calendar: true,
      notifications: true,
      chats: false,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applySeniorHomeMode();

    await window.FocusOylNative?.saveConsent?.(Object.entries(settings).map(([id, enabled]) => ({ id, enabled })));
    await window.FocusOylNative?.configureAutomation?.(buildAutomationConfig());

    const sourceIds = getEnabledAutomationSources();
    for (const sourceId of sourceIds) {
      try {
        await window.FocusOylNative?.requestDataSource?.(sourceId);
      } catch {
        // Permission flows differ between browser preview and native builds.
      }
    }

    startAutomationLoop({ runNow: false });
    await runAutoScan({ manual: true, preview: !window.FocusOylNative?.isNativeApp?.() });
    setIdle("已開始照顧");
    toast("已完成", "之後 Focus Oyl 會自動整理提醒。");
    renderCurrentSignal();
  }

  async function pauseCareMode() {
    settings = {
      ...settings,
      automationEnabled: false,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    await window.FocusOylNative?.configureAutomation?.(buildAutomationConfig());
    if (automationTimer) {
      window.clearInterval(automationTimer);
      automationTimer = null;
    }
    setIdle("已暫停照顧");
    toast("已暫停", "Focus Oyl 不會自動掃描來源；已排程提醒仍會保留。");
    closeSheet();
    renderCurrentSignal();
  }

  function armLocalReset(event) {
    const button = event.currentTarget;
    if (button.dataset.armed === "true") {
      clearLocalData();
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "再按一次確認";
    window.setTimeout(() => {
      if (!button.isConnected || button.dataset.armed !== "true") return;
      button.dataset.armed = "false";
      button.textContent = "清除本機資料";
    }, 4200);
  }

  function clearLocalData() {
    activeSignals.forEach(cancelSignalReminder);
    activeSignals = [];
    automationStatus = {};
    feedback = { categories: {}, events: [] };
    safetyState = null;
    settings = {
      automationEnabled: false,
    };
    localStorage.removeItem(SIGNALS_KEY);
    localStorage.removeItem(AUTOMATION_STATUS_KEY);
    localStorage.removeItem(SAFETY_KEY);
    localStorage.removeItem(MEMORY_KEY);
    localStorage.removeItem(FEEDBACK_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.UltraMemory?.clear?.();
    if (automationTimer) {
      window.clearInterval(automationTimer);
      automationTimer = null;
    }
    closeSheet();
    renderCurrentSignal();
    setIdle("本機資料已清除");
    toast("已清除本機資料", "這台裝置上的提醒、記憶和學習紀錄已清空。");
  }

  function handlePrimarySignalAction() {
    const next = sortSignals(activeSignals).find((signal) => !signal.done);
    if (!next) return;
    if (next.needsReview) {
      confirmReviewSignal(next.id);
      return;
    }
    completeSignal(next.id);
  }

  function handleSecondarySignalAction() {
    const next = sortSignals(activeSignals).find((signal) => !signal.done);
    if (!next) return;
    if (next.needsReview) {
      dismissSignal(next.id);
      return;
    }
    snoozeSignal(next.id, 60);
  }

  function renderSignalItem(signal, options = {}) {
    const schedule = signal.schedule;
    const meta = schedule?.labels
      ? `<p class="signal-meta">${escapeHtml(schedule.labels.relative)}提醒 · ${escapeHtml(schedule.labels.remind)} · ${escapeHtml(schedule.labels.reason)}</p>`
      : "";
    const review = signal.needsReview
      ? `<p class="signal-meta">待確認 · ${escapeHtml(signal.reviewReason || "低信心線索")} · ${confidenceLabel(signal.confidence)}</p>`
      : "";
    const trust = `<p class="signal-meta">${escapeHtml(trustLabel(signal))}</p>`;
    return `
      <article class="signal-item" data-review="${signal.needsReview ? "true" : "false"}">
        <div>
          <h3>${escapeHtml(signal.title)}</h3>
          <p>${escapeHtml(signal.detail)}</p>
          ${trust}
          ${review}
          ${meta}
          ${options.withActions && signal.needsReview && signal.id ? `
            <div class="timeline-actions">
              <button class="secondary-action mini-action" type="button" data-confirm-signal="${escapeHtml(signal.id)}">提醒我</button>
              <button class="secondary-action mini-action" type="button" data-dismiss-signal="${escapeHtml(signal.id)}">不用提醒</button>
            </div>
          ` : ""}
        </div>
        <span class="score">${signal.score ?? ""}</span>
      </article>
    `;
  }

  function wireInlineSignalActions(root) {
    root.querySelectorAll("[data-confirm-signal]").forEach((button) => {
      button.addEventListener("click", () => {
        confirmReviewSignal(button.dataset.confirmSignal);
        button.closest(".signal-item")?.remove();
      });
    });
    root.querySelectorAll("[data-dismiss-signal]").forEach((button) => {
      button.addEventListener("click", () => {
        dismissSignal(button.dataset.dismissSignal);
        button.closest(".signal-item")?.remove();
      });
    });
  }

  function renderTimelineSection(title, subtitle, items, tone) {
    if (!items.length) return "";
    return `
      <section class="timeline-section" data-tone="${tone}">
        <div class="timeline-section-head">
          <div>
            <p class="meta-label">${title}</p>
            <h3>${subtitle}</h3>
          </div>
          <span>${items.length}</span>
        </div>
        <div class="timeline-list">
          ${items.map((signal) => renderTimelineItem(signal, tone)).join("")}
        </div>
      </section>
    `;
  }

  function renderTimelineItem(signal, tone) {
    const schedule = signal.schedule || {};
    const labels = schedule.labels || {};
    const status = signal.done ? "已完成" : signal.needsReview ? "待確認" : tone === "now" ? "現在" : tone === "past" ? "已記錄" : "已排程";
    const completed = signal.completedAt ? `完成 ${formatTimelineDate(signal.completedAt)}` : "";
    return `
      <article class="timeline-item" data-tone="${tone}">
        <div class="timeline-rail">
          <span class="timeline-time">${escapeHtml(labels.remind || formatTimelineDate(signal.createdAt))}</span>
          <i></i>
        </div>
        <div class="timeline-card">
          <div class="timeline-card-top">
            <span>${escapeHtml(status)}</span>
            <b>${escapeHtml(labels.relative || "")}</b>
          </div>
          <h4>${escapeHtml(signal.title)}</h4>
          <p>${escapeHtml(signal.detail)}</p>
          <div class="timeline-meta">
            <span>${escapeHtml(trustLabel(signal))}</span>
            <span>提醒 ${escapeHtml(labels.remind || "未排程")}</span>
            <span>事情 ${escapeHtml(labels.due || "未判定")}</span>
            <span>${escapeHtml(labels.risk || "時間待判斷")}</span>
            ${signal.needsReview ? `<span>${escapeHtml(signal.reviewReason || "低信心待確認")}</span>` : ""}
            ${completed ? `<span>${escapeHtml(completed)}</span>` : ""}
          </div>
          ${signal.done ? "" : renderTimelineActions(signal)}
        </div>
      </article>
    `;
  }

  function renderTimelineActions(signal) {
    if (signal.needsReview) {
      return `
        <div class="timeline-actions">
          <button class="secondary-action mini-action" type="button" data-confirm-signal="${escapeHtml(signal.id)}">提醒我</button>
          <button class="secondary-action mini-action" type="button" data-dismiss-signal="${escapeHtml(signal.id)}">不用提醒</button>
        </div>
      `;
    }
    return `
      <div class="timeline-actions">
        <button class="secondary-action mini-action" type="button" data-focus-signal="${escapeHtml(signal.id)}">現在處理</button>
        <button class="secondary-action mini-action" type="button" data-snooze-signal="${escapeHtml(signal.id)}" data-minutes="60">稍後</button>
        <button class="secondary-action mini-action" type="button" data-snooze-signal="${escapeHtml(signal.id)}" data-minutes="1440">明天</button>
        <button class="secondary-action mini-action" type="button" data-complete-signal="${escapeHtml(signal.id)}">完成</button>
      </div>
    `;
  }

  function renderTimelineBandItem(item) {
    if (item.type === "now") {
      return `
        <article class="timeline-band-item timeline-now-card" id="timelineNowMarker" data-timeline-card data-time="${escapeHtml(item.time.toISOString())}" data-title="現在" data-tone="center">
          <p class="meta-label">Now</p>
          <h4>${escapeHtml(formatTimelineDate(item.time))}</h4>
          <p>這是現在。Focus Oyl 會從這裡向兩側展開最靠近的提醒。</p>
        </article>
      `;
    }

    const signal = item.signal;
    const schedule = signal.schedule || {};
    const labels = schedule.labels || {};
    const completed = signal.completedAt ? `完成 ${formatTimelineDate(signal.completedAt)}` : "";
    const status = signal.done ? "已完成" : signal.needsReview ? "待確認" : item.tone === "now" ? "現在該看" : item.tone === "past" ? "已記錄" : "已排程";
    return `
      <article class="timeline-band-item" data-timeline-card data-time="${escapeHtml(item.time.toISOString())}" data-title="${escapeHtml(signal.title)}" data-tone="${escapeHtml(item.tone)}">
        <div class="timeline-card-top">
          <span>${escapeHtml(status)}</span>
          <b>${escapeHtml(labels.relative || "")}</b>
        </div>
        <h4>${escapeHtml(signal.title)}</h4>
        <p>${escapeHtml(signal.detail)}</p>
        <div class="timeline-meta">
          <span>${escapeHtml(trustLabel(signal))}</span>
          <span>提醒 ${escapeHtml(labels.remind || "未排程")}</span>
          <span>事情 ${escapeHtml(labels.due || "未判定")}</span>
          <span>${escapeHtml(labels.risk || "時間待判斷")}</span>
          ${signal.needsReview ? `<span>${escapeHtml(signal.reviewReason || "低信心待確認")}</span>` : ""}
          ${completed ? `<span>${escapeHtml(completed)}</span>` : ""}
        </div>
        ${signal.done ? "" : signal.needsReview ? `
          <div class="timeline-actions">
            <button class="secondary-action mini-action" type="button" data-confirm-signal="${escapeHtml(signal.id)}">提醒我</button>
            <button class="secondary-action mini-action" type="button" data-dismiss-signal="${escapeHtml(signal.id)}">不用提醒</button>
          </div>
        ` : `
          <div class="timeline-actions">
            <button class="secondary-action mini-action" type="button" data-focus-signal="${escapeHtml(signal.id)}">現在處理</button>
            <button class="secondary-action mini-action" type="button" data-snooze-signal="${escapeHtml(signal.id)}" data-minutes="60">稍後</button>
            <button class="secondary-action mini-action" type="button" data-snooze-signal="${escapeHtml(signal.id)}" data-minutes="1440">明天</button>
            <button class="secondary-action mini-action" type="button" data-complete-signal="${escapeHtml(signal.id)}">完成</button>
          </div>
        `}
      </article>
    `;
  }

  function readImportFile(file, textInput, resultHost) {
    if (window.UltraOCR?.isImageFile(file)) {
      readImageFile(file, textInput, resultHost);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      if (tryRestoreSnapshot(content)) {
        textInput.value = "";
        resultHost.innerHTML = `<div class="empty-state">已匯入 Focus Oyl 備份。時間軸和提醒已更新。</div>`;
        return;
      }
      const parsed = window.UltraMemory.parseExportContent(content, file.name);
      textInput.value = parsed.text;
      const analysis = processText(parsed.text, parsed.source);
      renderImportResult(resultHost, analysis);
    };
    reader.readAsText(file);
  }

  async function readImageFile(file, textInput, resultHost) {
    const status = document.getElementById("ocrStatus");
    const label = document.getElementById("ocrLabel");
    const progress = document.getElementById("ocrProgress");
    status.classList.add("show");
    label.textContent = "正在載入本地 OCR...";
    progress.style.setProperty("--p", "4%");
    setWorking("OCR 辨識中");

    const unsubscribe = window.UltraOCR?.onProgress?.((message) => {
      const percent = Math.max(4, Math.round((message.progress || 0) * 100));
      label.textContent = ocrLabel(message.status, percent);
      progress.style.setProperty("--p", `${percent}%`);
    });

    try {
      const ocr = await window.UltraOCR.recognize(file);
      unsubscribe?.();
      progress.style.setProperty("--p", "100%");
      label.textContent = `完成 OCR，信心值 ${ocr.confidence}%`;
      textInput.value = ocr.text;
      const analysis = processText(ocr.text, "ocr-image");
      renderImportResult(resultHost, analysis);
    } catch (error) {
      unsubscribe?.();
      setIdle("OCR 未完成");
      label.textContent = "這張圖片目前無法辨識。可以先貼上文字，原生版會改接 Apple Vision。";
      toast("OCR 失敗", "請換一張較清晰的截圖，或先手動貼上文字。");
    }
  }

  function ocrLabel(status, percent) {
    const map = {
      "loading tesseract core": "載入 OCR 核心",
      "initializing tesseract": "初始化辨識引擎",
      "loading language traineddata": "載入語言資料",
      "initializing api": "準備辨識 API",
      "recognizing text": "正在辨識圖片文字",
    };
    return `${map[status] || "OCR 運作中"} ${percent}%`;
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      toast("這個瀏覽器不支援通知", "iPhone 原生 app 版會用 Apple 本地通知。");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("通知尚未開啟", "iPhone 上通常要先加入主畫面，才有比較完整的 Web App 通知體驗。");
      return;
    }
    showBrowserNotification("Focus Oyl", "通知已開啟。需要時，我會提醒你。");
    toast("通知已開啟", "需要注意時，Focus Oyl 會用本機通知提醒你。");
  }

  async function scheduleSignalReminder(signal) {
    if (!signal || signal.done || !window.FocusOylNative?.scheduleLocalReminder) return;
    const remindAt = parseScheduleDate(signal.schedule?.remindAt);
    if (!remindAt) return;

    try {
      const primary = await scheduleNativeReminder({
        id: signal.id,
        title: signal.title,
        body: signal.detail,
        at: remindAt,
      });
      const followUps = [];
      if (primary?.ok && !signal.needsReview) {
        const candidates = buildFollowUpReminders(signal, remindAt);
        for (const candidate of candidates) {
          const result = await scheduleNativeReminder(candidate);
          if (result?.ok) followUps.push(candidate.at.toISOString());
        }
      }
      if (primary?.ok) signal.nativeReminderAt = remindAt.toISOString();
      signal.nativeFollowUpAt = followUps;
      saveSignals();
    } catch {
      // Native reminders are unavailable in browser preview mode.
    }
  }

  async function cancelSignalReminder(signal) {
    if (!signal?.id || !window.FocusOylNative?.cancelLocalReminder) return;
    try {
      await window.FocusOylNative.cancelLocalReminder({ id: signal.id });
      await window.FocusOylNative.cancelLocalReminder({ id: `${signal.id}-followup-1` });
      await window.FocusOylNative.cancelLocalReminder({ id: `${signal.id}-followup-2` });
    } catch {
      // Native reminders are unavailable in browser preview mode.
    }
  }

  function scheduleNativeReminder(reminder) {
    return window.FocusOylNative.scheduleLocalReminder({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      at: reminder.at.toISOString(),
      url: "/#timeline",
    });
  }

  function buildFollowUpReminders(signal, baseAt) {
    const dueAt = parseScheduleDate(signal.schedule?.dueAt);
    const candidates = [30, 120].map((minutes, index) => {
      const plan = window.FocusOylTime?.planManualReminder?.(minutes, {
        now: baseAt,
        dueAt,
        settings: getTimeSettings(),
      });
      const at = parseScheduleDate(plan?.remindAt) || new Date(baseAt.getTime() + minutes * 60000);
      return {
        id: `${signal.id}-followup-${index + 1}`,
        title: "Focus Oyl 還記得",
        body: signal.title,
        at,
      };
    });

    const unique = [];
    const seen = new Set([baseAt.toISOString()]);
    for (const item of candidates) {
      if (dueAt && item.at >= dueAt) continue;
      const key = item.at.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }

  async function showBrowserNotification(title, body, data = {}) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = "serviceWorker" in navigator
        ? await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => setTimeout(() => resolve(null), 500)),
          ])
        : null;
      if (registration?.showNotification) {
        await registration.showNotification(title, {
          body,
          data,
          tag: "focus-oyl-signal",
          silent: true,
        });
        return;
      }
      new Notification(title, { body, data, silent: true });
    } catch {
      // Notification availability differs across browsers and installed PWA states.
    }
  }

  function ingestSharedQuery() {
    const params = new URLSearchParams(location.search);
    const shared = [params.get("title"), params.get("text"), params.get("url")]
      .filter(Boolean)
      .join("\n");
    if (shared) {
      processText(shared, "web-share-target");
      history.replaceState(null, "", `${location.pathname}#import`);
      window.setTimeout(openImportSheet, 320);
    }
  }

  async function consumePendingNativeIntents() {
    try {
      const share = await window.FocusOylNative?.consumePendingShare?.();
      if (share?.hasPayload && (share.text || share.title)) {
        handleNativeShare(share);
      }
    } catch {
      // Browser previews and older native builds may not expose pending shares.
    }

    try {
      const open = await window.FocusOylNative?.consumePendingOpen?.();
      if (open?.hasPayload) {
        handleNativeOpen(open);
      }
    } catch {
      // Browser previews and older native builds may not expose pending opens.
    }

    try {
      const result = await window.FocusOylNative?.consumePendingActions?.();
      if (Array.isArray(result?.actions) && result.actions.length) {
        handleNativeActions(result.actions);
      }
    } catch {
      // Browser previews and older native builds may not expose notification actions.
    }

    try {
      const result = await window.FocusOylNative?.consumePendingSafetyChecks?.();
      if (Array.isArray(result?.checks) && result.checks.length) {
        handleNativeSafetyChecks(result.checks);
      }
    } catch {
      // Browser previews and older native builds may not expose safety events.
    }
  }

  function handleNativeShare(payload) {
    const text = [payload?.title, payload?.text]
      .filter(Boolean)
      .join("\n");
    if (!text.trim()) return;
    processText(text, payload.source || "native-share");
    history.replaceState(null, "", `${location.pathname}${location.search}#timeline`);
    window.setTimeout(openTimelineSheet, 320);
  }

  function handleNativeOpen(payload) {
    const safeTarget = safeLocalTarget(payload?.url || "/#timeline");
    if (!safeTarget) return;
    history.replaceState(null, "", safeTarget);
    if (safeTarget.includes("#timeline")) {
      window.setTimeout(openTimelineSheet, 260);
    } else if (safeTarget.includes("#safety")) {
      window.setTimeout(openSafetySheet, 260);
    }
  }

  function handleNativeActions(actions) {
    let applied = 0;
    actions.forEach((action) => {
      const signal = findSignalForNativeAction(action);
      if (!signal || signal.done) return;

      if (action.action === "completed") {
        signal.done = true;
        signal.completedAt = new Date(action.at || Date.now()).toISOString();
        signal.nativeActionAt = signal.completedAt;
        recordSignalFeedback(signal, "completed");
        cancelSignalReminder(signal);
        applied += 1;
        return;
      }

      if (action.action === "snoozed") {
        const remindAt = parseScheduleDate(action.remindAt) || new Date(Date.now() + 30 * 60000);
        updateSignalReminder(signal, remindAt, "通知上延後 30 分鐘");
        signal.nativeReminderAt = remindAt.toISOString();
        signal.nativeActionAt = new Date(action.at || Date.now()).toISOString();
        recordSignalFeedback(signal, "snoozed");
        applied += 1;
      }
    });

    if (!applied) return;
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    renderCurrentSignal();
    setIdle("已同步通知動作");
    toast("已同步通知動作", `${applied} 件提醒已更新。`);
  }

  function handleNativeSafetyChecks(checks) {
    const normalized = checks
      .map(normalizeNativeSafetyCheck)
      .filter(Boolean);
    if (!normalized.length) return;

    safetyState = normalized[normalized.length - 1];
    saveSafetyState();
    startSafetyCountdown();
    if (safetyState.status === "waiting") {
      setWorking("等待安全確認");
      toast("收到安全確認", "長輩端已進入 30 秒確認。");
    } else if (safetyState.status === "safe") {
      setIdle("已回報安全");
      toast("已回報安全", "沒有傳送位置。");
    } else {
      setIdle("安全確認已更新");
      toast("安全確認已更新", safetyState.locationShared ? "已進入定位備援。" : "未傳送位置。");
    }
    if (location.hash.startsWith("#safety")) openSafetySheet();
    renderCurrentSignal();
  }

  function normalizeNativeSafetyCheck(check) {
    if (!check || typeof check !== "object") return null;
    const requestedAt = normalizeNativeTime(check.requestedAt) || new Date().toISOString();
    const expiresAt = normalizeNativeTime(check.expiresAt)
      || new Date(Date.parse(requestedAt) + SAFETY_TIMEOUT_SECONDS * 1000).toISOString();
    return {
      id: check.id || createLocalId("safe"),
      mode: check.mode || "native",
      status: check.status || "waiting",
      requestedAt,
      expiresAt,
      respondedAt: normalizeNativeTime(check.respondedAt),
      timedOutAt: normalizeNativeTime(check.timedOutAt),
      timeoutSeconds: Number(check.timeoutSeconds) || SAFETY_TIMEOUT_SECONDS,
      locationFallback: Boolean(check.locationFallback),
      smsFallback: Boolean(check.smsFallback),
      familyName: sanitizeLabel(check.familyName || settings.safetyFamilyName || ""),
      familyPhone: sanitizePhone(check.familyPhone || settings.safetyFamilyPhone || ""),
      backupPhone: sanitizePhone(check.backupPhone || settings.safetyBackupPhone || ""),
      sourcePhone: sanitizePhone(check.sourcePhone || ""),
      testMode: check.testMode !== false,
      locationShared: Boolean(check.locationShared),
      locationStatus: check.locationStatus || "",
      safeReplySent: Boolean(check.safeReplySent),
      events: Array.isArray(check.events) ? check.events : [],
    };
  }

  function normalizeNativeTime(value) {
    if (!value) return "";
    if (typeof value === "number") return new Date(value).toISOString();
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1000000000) return new Date(numeric).toISOString();
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }

  function findSignalForNativeAction(action) {
    const id = action?.rootId || action?.id;
    if (!id) return null;
    return activeSignals.find((signal) => signal.id === id)
      || activeSignals.find((signal) => id.startsWith(`${signal.id}-followup-`));
  }

  function safeLocalTarget(value) {
    const raw = String(value || "");
    if (raw.startsWith("/#")) return `${location.pathname}${location.search}${raw.slice(1)}`;
    if (raw.startsWith("#")) return `${location.pathname}${location.search}${raw}`;
    if (raw === "/" || raw === "/#timeline") return `${location.pathname}${location.search}#timeline`;
    if (raw === "/#safety") return `${location.pathname}${location.search}#safety`;
    if (raw === "/#devices") return `${location.pathname}${location.search}#devices`;
    return "";
  }

  function toast(title, detail) {
    const existing = [...els.toastStack.children];
    const beforeRects = new Map(existing.map((node) => [node, node.getBoundingClientRect()]));

    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <span class="toast-icon"></span>
      <span>
        <p class="toast-title">${escapeHtml(title)}</p>
        <p class="toast-detail">${escapeHtml(detail || "")}</p>
      </span>
    `;
    els.toastStack.appendChild(el);

    flipShift(existing, beforeRects);

    window.setTimeout(() => removeToast(el), 5200);
    el.addEventListener("click", () => removeToast(el));
  }

  function removeToast(el) {
    if (!el?.isConnected) return;
    if (el.classList.contains("leaving")) return;
    const siblings = [...els.toastStack.children].filter((node) => node !== el);
    const beforeRects = new Map(siblings.map((node) => [node, node.getBoundingClientRect()]));

    el.classList.add("leaving");
    window.setTimeout(() => {
      el.remove();
      flipShift(siblings, beforeRects);
    }, 240);
  }

  function flipShift(nodes, beforeRects) {
    if (!nodes?.length) return;
    requestAnimationFrame(() => {
      nodes.forEach((node) => {
        const before = beforeRects.get(node);
        if (!before) return;
        const after = node.getBoundingClientRect();
        const dy = before.top - after.top;
        if (Math.abs(dy) < 0.5) return;
        node.style.transition = "none";
        node.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          node.style.transition = "transform 320ms cubic-bezier(0.2, 1.4, 0.32, 1)";
          node.style.transform = "";
          window.setTimeout(() => {
            node.style.transition = "";
          }, 360);
        });
      });
    });
  }

  function loadSignals() {
    try {
      return JSON.parse(localStorage.getItem(SIGNALS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveSignals() {
    localStorage.setItem(SIGNALS_KEY, JSON.stringify(activeSignals));
  }

  function hydrateSignals(signals) {
    return sortSignals((Array.isArray(signals) ? signals : []).map((signal) => {
      if (signal.schedule?.remindAt) return signal;
      return {
        ...signal,
        schedule: attachSchedule(signal),
      };
    }));
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function loadSafetyState() {
    try {
      return JSON.parse(localStorage.getItem(SAFETY_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSafetyState() {
    if (!safetyState) {
      localStorage.removeItem(SAFETY_KEY);
      return;
    }
    localStorage.setItem(SAFETY_KEY, JSON.stringify(safetyState));
  }

  function loadAutomationStatus() {
    try {
      return JSON.parse(localStorage.getItem(AUTOMATION_STATUS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveAutomationStatus() {
    localStorage.setItem(AUTOMATION_STATUS_KEY, JSON.stringify(automationStatus));
  }

  function loadFeedback() {
    try {
      const value = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "null");
      if (value?.categories && Array.isArray(value.events)) return value;
    } catch {
      // Fall through and create a clean local feedback store.
    }
    return { categories: {}, events: [] };
  }

  function saveFeedback() {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
  }

  function recordSignalFeedback(signal, action) {
    if (!signal) return;
    const category = signal.category || "reminder";
    const current = feedback.categories[category] || {
      completed: 0,
      confirmed: 0,
      dismissed: 0,
      snoozed: 0,
      focused: 0,
    };
    current[action] = (current[action] || 0) + 1;
    current.lastActionAt = new Date().toISOString();
    feedback.categories[category] = current;
    feedback.events.unshift({
      action,
      category,
      title: signal.title,
      at: current.lastActionAt,
    });
    feedback.events = feedback.events.slice(0, 80);
    saveFeedback();
  }

  function feedbackForCategory(category) {
    return feedback.categories[category || "reminder"] || {};
  }

  function shouldReviewBecauseOfFeedback(item) {
    const stats = feedbackForCategory(item.category);
    const negative = Number(stats.dismissed || 0);
    const positive = Number(stats.completed || 0) + Number(stats.confirmed || 0);
    return negative >= 2 && negative > positive && item.score < 72;
  }

  function feedbackReviewReason(item) {
    const stats = feedbackForCategory(item.category);
    if (!stats.dismissed) return "";
    return `這類內容已被略過 ${stats.dismissed} 次，先請你確認`;
  }

  function feedbackSummary() {
    const entries = Object.entries(feedback.categories || {});
    if (!entries.length) return "尚未累積使用習慣";
    const totals = entries.reduce((sum, [, value]) => ({
      completed: sum.completed + Number(value.completed || 0) + Number(value.confirmed || 0),
      dismissed: sum.dismissed + Number(value.dismissed || 0),
      snoozed: sum.snoozed + Number(value.snoozed || 0),
    }), { completed: 0, dismissed: 0, snoozed: 0 });
    return `完成 ${totals.completed} · 略過 ${totals.dismissed} · 延後 ${totals.snoozed}`;
  }

  function getTimeSettings() {
    return {
      quietStart: Number.isFinite(Number(settings.quietStart)) ? Number(settings.quietStart) : 22,
      quietEnd: Number.isFinite(Number(settings.quietEnd)) ? Number(settings.quietEnd) : 8,
      minLeadMinutes: Number.isFinite(Number(settings.minLeadMinutes)) ? Number(settings.minLeadMinutes) : 12,
      defaultHour: Number.isFinite(Number(settings.defaultHour)) ? Number(settings.defaultHour) : 9,
    };
  }

  function attachSchedule(item) {
    if (!window.FocusOylTime?.planSignal) return null;
    return window.FocusOylTime.planSignal({
      ...item,
      line: item.line || item.detail || "",
    }, { settings: getTimeSettings() });
  }

  function completeSignal(id) {
    const signal = activeSignals.find((item) => item.id === id);
    if (!signal) return;
    signal.done = true;
    signal.completedAt = new Date().toISOString();
    recordSignalFeedback(signal, "completed");
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    cancelSignalReminder(signal);
    toast("已完成", signal.title);
    renderCurrentSignal();
    setIdle("已更新時間軸");
  }

  function confirmReviewSignal(id) {
    const signal = activeSignals.find((item) => item.id === id);
    if (!signal) return;
    signal.needsReview = false;
    signal.confirmedAt = new Date().toISOString();
    signal.confidence = signal.confidence === "low" ? "medium" : signal.confidence;
    signal.reviewReason = "";
    signal.title = signal.title.replace(/^請確認：/, "提醒：");
    recordSignalFeedback(signal, "confirmed");
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    scheduleSignalReminder(signal);
    renderCurrentSignal();
    setIdle("已確認提醒");
    toast("已加入提醒", signal.title);
  }

  function dismissSignal(id) {
    const signal = activeSignals.find((item) => item.id === id);
    if (!signal) return;
    signal.done = true;
    signal.dismissedAt = new Date().toISOString();
    signal.completedAt = signal.completedAt || signal.dismissedAt;
    recordSignalFeedback(signal, "dismissed");
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    cancelSignalReminder(signal);
    renderCurrentSignal();
    setIdle("已略過");
    toast("已略過這件事", signal.title);
  }

  function snoozeSignal(id, minutes = 60) {
    const signal = activeSignals.find((item) => item.id === id);
    if (!signal) return;
    cancelSignalReminder(signal);
    const plan = window.FocusOylTime?.planManualReminder?.(minutes, {
      settings: getTimeSettings(),
      dueAt: signal.schedule?.dueAt,
    });
    const remindAt = parseScheduleDate(plan?.remindAt) || new Date(Date.now() + minutes * 60000);
    updateSignalReminder(signal, remindAt, plan?.labels?.reason || `${minutes >= 60 ? "1 小時後" : `${minutes} 分鐘後`}再提醒`);
    recordSignalFeedback(signal, "snoozed");
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    scheduleSignalReminder(signal);
    renderCurrentSignal();
    setIdle("已延後提醒");
    toast("已延後提醒", `${signal.title} · ${signal.schedule.labels.remind}`);
  }

  function focusSignalNow(id) {
    const signal = activeSignals.find((item) => item.id === id);
    if (!signal) return;
    cancelSignalReminder(signal);
    updateSignalReminder(signal, new Date(), "使用者選擇現在處理");
    recordSignalFeedback(signal, "focused");
    activeSignals = sortSignals(activeSignals);
    saveSignals();
    renderCurrentSignal();
    setWorking("現在處理");
    window.setTimeout(() => setIdle("已移到現在"), 900);
    toast("已移到現在", signal.title);
  }

  function updateSignalReminder(signal, remindAt, reason) {
    const dueAt = parseScheduleDate(signal.schedule?.dueAt);
    const labels = signal.schedule?.labels || {};
    signal.schedule = {
      ...(signal.schedule || {}),
      remindAt: remindAt.toISOString(),
      reason,
      urgency: remindAt <= new Date() ? "soon" : "normal",
      labels: {
        ...labels,
        remind: formatTimelineDate(remindAt),
        relative: relativeToNow(remindAt),
        due: dueAt ? formatTimelineDate(dueAt) : labels.due || "沒有明確截止",
        reason,
        risk: "使用者調整",
      },
    };
    signal.lastSurfacedAt = null;
    signal.nativeReminderAt = null;
    signal.nativeFollowUpAt = [];
  }

  function startDueReminderLoop() {
    checkDueSignals();
    window.setInterval(checkDueSignals, 60000);
  }

  function checkDueSignals() {
    const now = new Date();
    const candidates = sortSignals(activeSignals).filter((signal) => {
      if (signal.done) return false;
      const remindAt = parseScheduleDate(signal.schedule?.remindAt);
      if (!remindAt || remindAt > now) return false;
      const last = parseScheduleDate(signal.lastSurfacedAt);
      return !last || now.getTime() - last.getTime() > 30 * 60000;
    });
    const signal = candidates[0];
    if (!signal) return;

    signal.lastSurfacedAt = now.toISOString();
    saveSignals();
    renderCurrentSignal();
    const title = signal.needsReview ? "可能要處理" : "現在可以處理";
    toast(title, signal.title);
    showBrowserNotification(`Focus Oyl: ${title}`, `${signal.title}\n${signal.detail}`, {
      signalId: signal.id,
      url: "/#timeline",
    });
  }

  function currentSignalLabel(signal) {
    if (signal.needsReview) return "可能需要提醒";
    const remindAt = parseScheduleDate(signal.schedule?.remindAt);
    if (remindAt && remindAt <= new Date()) return "現在要做的事";
    return signal.schedule?.labels?.relative
      ? `下一件事 · ${signal.schedule.labels.relative}`
      : "下一件事";
  }

  function cleanSignalDetail(detail) {
    return String(detail || "")
      .replace(/\s*收到時間\s+.*$/u, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildTimelineGroups() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soon = new Date(now.getTime() + 6 * 60 * 60000);
    const groups = { past: [], now: [], future: [] };

    for (const signal of sortSignals(activeSignals)) {
      const remindAt = parseScheduleDate(signal.schedule?.remindAt) || parseScheduleDate(signal.createdAt);
      const dueAt = parseScheduleDate(signal.schedule?.dueAt);
      if (signal.done) {
        groups.past.push(signal);
      } else if ((dueAt && dueAt < now) || (remindAt && remindAt <= now) || (dueAt && dueAt <= soon)) {
        groups.now.push(signal);
      } else if (remindAt && remindAt < todayStart) {
        groups.past.push(signal);
      } else {
        groups.future.push(signal);
      }
    }

    groups.past.sort((a, b) => {
      const aTime = Date.parse(a.completedAt || a.schedule?.remindAt || a.createdAt || 0);
      const bTime = Date.parse(b.completedAt || b.schedule?.remindAt || b.createdAt || 0);
      return bTime - aTime;
    });
    groups.now = sortSignals(groups.now);
    groups.future = sortSignals(groups.future);
    return groups;
  }

  function buildTimelineBand() {
    const now = new Date();
    const items = sortSignals(activeSignals).map((signal) => {
      const remindAt = parseScheduleDate(signal.schedule?.remindAt) || parseScheduleDate(signal.createdAt) || now;
      const dueAt = parseScheduleDate(signal.schedule?.dueAt);
      let tone = "future";
      if (signal.done) tone = "past";
      else if ((dueAt && dueAt < now) || remindAt <= now || (dueAt && dueAt <= new Date(now.getTime() + 6 * 60 * 60000))) tone = "now";
      else if (remindAt < now) tone = "past";
      return {
        type: "signal",
        id: signal.id,
        time: remindAt,
        tone,
        signal,
      };
    });

    const nowItem = { type: "now", id: "__now", time: now };
    const index = items.findIndex((item) => item.time >= now);
    if (index === -1) items.push(nowItem);
    else items.splice(index, 0, nowItem);
    return items;
  }

  function setupTimelineControls() {
    window.setTimeout(() => {
      centerTimeline("auto");
      updateTimelineViewport();
    }, 80);

    document.querySelector("[data-center-timeline]")?.addEventListener("click", () => {
      centerTimeline("smooth");
      window.setTimeout(updateTimelineViewport, 220);
    });

    document.querySelectorAll("[data-jump-timeline]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpTimeline(Number(button.dataset.jumpTimeline) || 1);
      });
    });

    const scroller = document.getElementById("timelineWindow");
    if (!scroller) return;
    let ticking = false;
    scroller.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateTimelineViewport();
      });
    }, { passive: true });
  }

  function centerTimeline(behavior = "smooth") {
    const scroller = document.getElementById("timelineWindow");
    const marker = document.getElementById("timelineNowMarker");
    if (!scroller || !marker) return;
    const left = marker.offsetLeft + marker.offsetWidth / 2 - scroller.clientWidth / 2;
    scroller.scrollTo({
      left: Math.max(0, left),
      behavior,
    });
  }

  function jumpTimeline(direction) {
    const scroller = document.getElementById("timelineWindow");
    if (!scroller) return;
    const cards = getTimelineCards(scroller);
    if (!cards.length) return;

    const currentCenter = scroller.scrollLeft + scroller.clientWidth / 2;
    const sorted = cards.map((card) => ({
      card,
      center: card.offsetLeft + card.offsetWidth / 2,
    })).sort((a, b) => a.center - b.center);

    const target = direction < 0
      ? [...sorted].reverse().find((item) => item.center < currentCenter - 24)
      : sorted.find((item) => item.center > currentCenter + 24);

    if (!target) return;
    scroller.scrollTo({
      left: Math.max(0, target.center - scroller.clientWidth / 2),
      behavior: "smooth",
    });
    window.setTimeout(updateTimelineViewport, 260);
  }

  function updateTimelineViewport() {
    const scroller = document.getElementById("timelineWindow");
    const label = document.getElementById("timelineViewportLabel");
    if (!scroller || !label) return;

    const cards = getTimelineCards(scroller);
    if (!cards.length) {
      label.textContent = "正在看 · 現在";
      return;
    }

    const viewportCenter = scroller.getBoundingClientRect().left + scroller.clientWidth / 2;
    let closest = cards[0];
    let closestDistance = Infinity;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - viewportCenter);
      if (distance < closestDistance) {
        closest = card;
        closestDistance = distance;
      }
    }

    const time = parseScheduleDate(closest.dataset.time);
    const title = closest.dataset.title || "現在";
    const relative = time ? relativeToNow(time) : "現在";
    label.textContent = title === "現在"
      ? "正在看 · 現在"
      : `正在看 · ${relative} · ${title}`;
  }

  function getTimelineCards(scroller) {
    return [...scroller.querySelectorAll("[data-timeline-card]")];
  }

  function parseScheduleDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTimelineDate(value) {
    const date = parseScheduleDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("zh-Hant-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function relativeToNow(date) {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absMinutes = Math.round(Math.abs(diff) / 60000);
    if (absMinutes < 2) return "現在";
    if (absMinutes < 60) return diff < 0 ? `${absMinutes} 分鐘前` : `${absMinutes} 分鐘後`;
    const absHours = Math.round(absMinutes / 60);
    if (absHours < 24) return diff < 0 ? `${absHours} 小時前` : `${absHours} 小時後`;
    const absDays = Math.round(absHours / 24);
    return diff < 0 ? `${absDays} 天前` : `${absDays} 天後`;
  }

  function sortSignals(signals) {
    return [...signals].sort((a, b) => {
      const aTime = Date.parse(a.schedule?.remindAt || a.createdAt || 0);
      const bTime = Date.parse(b.schedule?.remindAt || b.createdAt || 0);
      return aTime - bTime;
    });
  }

  function formatHour(hour) {
    return String(Number(hour) || 0).padStart(2, "0");
  }

  function sanitizePhone(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .slice(0, 24);
  }

  function sanitizeLabel(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32);
  }

  function dedupeSignals(signals) {
    const seen = new Set();
    return signals.filter((signal) => {
      const key = `${signal.title}|${signal.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
