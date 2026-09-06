/* Focus Oyl local time intelligence.
   Converts extracted signals into humane reminder timing. */

(() => {
  const DEFAULT_SETTINGS = {
    quietStart: 22,
    quietEnd: 8,
    minLeadMinutes: 12,
    defaultHour: 9,
  };

  const categoryLead = {
    warranty: { days: 14, label: "提前 14 天，避免錯過保固或續約窗口" },
    finance: { days: 1, label: "提前 1 天，避開繳費壓線" },
    work: { hours: 4, label: "提前 4 小時，保留準備時間" },
    health: { hours: 3, label: "提前 3 小時，避免錯過健康事項" },
    travel: { hours: 6, label: "提前 6 小時，保留交通緩衝" },
    family: { hours: 2, label: "提前 2 小時，保留生活安排時間" },
    reply: { hours: 2, label: "延後 2 小時，避免立刻打擾" },
    message: { hours: 2, label: "延後 2 小時，等對話自然沉澱" },
    reminder: { hours: 1, label: "提前 1 小時提醒" },
  };

  const weekdayMap = new Map([
    ["週日", 0], ["星期日", 0], ["禮拜日", 0], ["周日", 0],
    ["週一", 1], ["星期一", 1], ["禮拜一", 1], ["周一", 1],
    ["週二", 2], ["星期二", 2], ["禮拜二", 2], ["周二", 2],
    ["週三", 3], ["星期三", 3], ["禮拜三", 3], ["周三", 3],
    ["週四", 4], ["星期四", 4], ["禮拜四", 4], ["周四", 4],
    ["週五", 5], ["星期五", 5], ["禮拜五", 5], ["周五", 5],
    ["週六", 6], ["星期六", 6], ["禮拜六", 6], ["周六", 6],
  ]);

  function planSignal(item, options = {}) {
    const now = options.now ? new Date(options.now) : new Date();
    const settings = { ...DEFAULT_SETTINGS, ...(options.settings || {}) };
    const due = inferDueAt(item, now, settings);
    const lead = leadFor(item.category);

    if (!due.date) {
      const remindAt = fitReminderWindow(addMinutes(now, 45), null, settings, now);
      return buildPlan({
        dueAt: null,
        remindAt,
        precision: "none",
        confidence: "low",
        reason: "沒有明確時間，先用低干擾提醒",
        lead,
        settings,
        now,
      });
    }

    const rawReminder = subtractLead(due.date, lead);
    const candidate = rawReminder < addMinutes(now, settings.minLeadMinutes)
      ? addMinutes(now, settings.minLeadMinutes)
      : rawReminder;
    const remindAt = fitReminderWindow(candidate, due.date, settings, now);
    const overdue = due.date < now;

    return buildPlan({
      dueAt: due.date,
      remindAt,
      precision: due.precision,
      confidence: due.confidence,
      reason: overdue ? "時間已過，立即浮出但不打擾安靜時段" : lead.label,
      lead,
      settings,
      now,
      overdue,
    });
  }

  function planManualReminder(minutes, options = {}) {
    const now = options.now ? new Date(options.now) : new Date();
    const settings = { ...DEFAULT_SETTINGS, ...(options.settings || {}) };
    const dueAt = options.dueAt ? new Date(options.dueAt) : null;
    const safeDueAt = isValidDate(dueAt) ? dueAt : null;
    const requestedMinutes = Math.max(settings.minLeadMinutes, Number(minutes) || 60);
    let remindAt;

    if (requestedMinutes >= 24 * 60) {
      const hour = Math.max(settings.quietEnd, settings.defaultHour);
      remindAt = setHour(addDays(now, 1), hour, 0);
    } else {
      remindAt = addMinutes(now, requestedMinutes);
    }

    if (safeDueAt && remindAt > safeDueAt) {
      const latestBeforeDue = addMinutes(safeDueAt, -settings.minLeadMinutes);
      remindAt = latestBeforeDue > now ? latestBeforeDue : addMinutes(now, settings.minLeadMinutes);
    }

    remindAt = fitReminderWindow(remindAt, safeDueAt, settings, now);

    return {
      dueAt: safeDueAt ? safeDueAt.toISOString() : null,
      remindAt: remindAt.toISOString(),
      precision: "manual",
      confidence: "high",
      urgency: safeDueAt && safeDueAt <= addHours(now, 6) ? "soon" : "normal",
      reason: manualReason(requestedMinutes),
      quietHours: `${padHour(settings.quietStart)}:00-${padHour(settings.quietEnd)}:00`,
      labels: {
        due: safeDueAt ? formatDateTime(safeDueAt) : "沒有明確截止",
        remind: formatDateTime(remindAt),
        relative: relativeLabel(remindAt, now),
        reason: manualReason(requestedMinutes),
        risk: "使用者調整",
      },
    };
  }

  function inferDueAt(item, now, settings) {
    const line = String(item?.line || "");
    const dates = Array.isArray(item?.dates) ? item.dates : [];
    const text = `${line}\n${dates.join("\n")}`;
    const time = extractTime(text, item?.category, settings);

    const absolute = parseAbsoluteDate(text, now, time);
    if (absolute) return { date: absolute, precision: "explicit", confidence: "high" };

    const chineseDate = parseChineseMonthDay(text, now, time);
    if (chineseDate) return { date: chineseDate, precision: "explicit", confidence: "high" };

    const relative = parseRelativeDay(text, now, time);
    if (relative) return { date: relative, precision: "relative", confidence: "medium" };

    const weekday = parseWeekday(text, now, time);
    if (weekday) return { date: weekday, precision: "weekday", confidence: "medium" };

    const monthEnd = parseMonthEnd(text, now, time);
    if (monthEnd) return { date: monthEnd, precision: "relative", confidence: "medium" };

    return { date: null, precision: "none", confidence: "low" };
  }

  function parseAbsoluteDate(text, now, time) {
    const match = text.match(/(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2})[:：](\d{2}))?/);
    if (!match) return null;

    const explicitYear = Boolean(match[1]);
    let year = explicitYear ? Number(match[1]) : now.getFullYear();
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] ? Number(match[4]) : time.hour;
    const minute = match[5] ? Number(match[5]) : time.minute;
    let date = new Date(year, month - 1, day, hour, minute, 0, 0);

    if (!explicitYear && date < startOfDay(addDays(now, -45))) {
      year += 1;
      date = new Date(year, month - 1, day, hour, minute, 0, 0);
    }
    return isValidDate(date) ? date : null;
  }

  function parseChineseMonthDay(text, now, time) {
    const match = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (!match) return null;

    let year = now.getFullYear();
    const month = Number(match[1]);
    const day = Number(match[2]);
    let date = new Date(year, month - 1, day, time.hour, time.minute, 0, 0);
    if (date < startOfDay(addDays(now, -45))) {
      year += 1;
      date = new Date(year, month - 1, day, time.hour, time.minute, 0, 0);
    }
    return isValidDate(date) ? date : null;
  }

  function parseRelativeDay(text, now, time) {
    if (/後天/.test(text)) return withTime(addDays(now, 2), time);
    if (/明天|明日|明早|明晚/.test(text)) return withTime(addDays(now, 1), time);
    if (/今天|今日|今晚|等一下|等等|稍後|晚點|睡前|出門前|下班前/.test(text)) return withTime(now, time);
    if (/下週|下周/.test(text)) return withTime(addDays(now, 7), time);
    if (/本週|這週|這周/.test(text)) return withTime(addDays(now, 3), time);
    return null;
  }

  function parseWeekday(text, now, time) {
    for (const [token, day] of weekdayMap) {
      if (!text.includes(token)) continue;
      const nextWeek = /下週|下周/.test(text);
      const offset = daysUntilWeekday(now, day, nextWeek);
      return withTime(addDays(now, offset), time);
    }
    return null;
  }

  function parseMonthEnd(text, now, time) {
    if (!/月底|月末/.test(text)) return null;
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, time.hour, time.minute, 0, 0);
  }

  function extractTime(text, category, settings) {
    const explicit = text.match(/(上午|早上|中午|下午|晚上|今晚)?\s*(\d{1,2})[:：](\d{2})/);
    if (explicit) {
      let hour = Number(explicit[2]);
      const minute = Number(explicit[3]);
      const period = explicit[1] || "";
      if (/下午|晚上|今晚/.test(period) && hour < 12) hour += 12;
      if (/上午|早上/.test(period) && hour === 12) hour = 0;
      return { hour, minute, source: "explicit" };
    }

    const hourOnly = text.match(/(上午|早上|中午|下午|晚上|今晚)\s*(\d{1,2})\s*點/);
    if (hourOnly) {
      let hour = Number(hourOnly[2]);
      const period = hourOnly[1];
      if (/下午|晚上|今晚/.test(period) && hour < 12) hour += 12;
      if (/上午|早上/.test(period) && hour === 12) hour = 0;
      return { hour, minute: 0, source: "explicit" };
    }

    const looseHour = text.match(/(?:^|[^\d])(\d{1,2})\s*(點|時)(半|\d{1,2}\s*分?)?/);
    if (looseHour) {
      const rawHour = Number(looseHour[1]);
      if (rawHour >= 0 && rawHour <= 23) {
        const minute = looseHour[3]?.includes("半")
          ? 30
          : Number((looseHour[3] || "").match(/\d{1,2}/)?.[0] || 0);
        return { hour: rawHour, minute, source: "explicit" };
      }
    }

    if (/明早/.test(text)) return { hour: 9, minute: 0, source: "phrase" };
    if (/明晚|睡前/.test(text)) return { hour: 20, minute: 0, source: "phrase" };
    if (/出門前|下班前/.test(text)) return { hour: 17, minute: 0, source: "phrase" };
    if (/晚上|今晚/.test(text)) return { hour: 20, minute: 0, source: "phrase" };
    if (/下午/.test(text)) return { hour: 15, minute: 0, source: "phrase" };
    if (/中午/.test(text)) return { hour: 12, minute: 0, source: "phrase" };
    if (/早上|上午/.test(text)) return { hour: 9, minute: 0, source: "phrase" };

    if (category === "finance") return { hour: 17, minute: 0, source: "category" };
    if (category === "work") return { hour: 17, minute: 0, source: "category" };
    if (category === "reply" || category === "message") return { hour: 20, minute: 0, source: "category" };
    return { hour: settings.defaultHour, minute: 0, source: "default" };
  }

  function leadFor(category) {
    const raw = categoryLead[category] || categoryLead.reminder;
    const minutes = (raw.days || 0) * 24 * 60 + (raw.hours || 0) * 60 + (raw.minutes || 0);
    return { ...raw, minutes };
  }

  function subtractLead(date, lead) {
    return addMinutes(date, -lead.minutes);
  }

  function fitReminderWindow(candidate, dueAt, settings, now) {
    let reminder = new Date(candidate);
    const minimum = addMinutes(now, settings.minLeadMinutes);
    if (reminder < minimum) reminder = minimum;

    if (isQuiet(reminder, settings)) {
      reminder = moveOutOfQuiet(reminder, settings);
    }

    if (dueAt && reminder > dueAt) {
      const latest = addMinutes(dueAt, -settings.minLeadMinutes);
      reminder = latest > now ? latest : addMinutes(now, settings.minLeadMinutes);
      if (isQuiet(reminder, settings)) {
        const previous = previousActiveSlot(dueAt, settings);
        reminder = previous > now ? previous : reminder;
      }
    }

    return reminder;
  }

  function isQuiet(date, settings) {
    const hour = date.getHours() + date.getMinutes() / 60;
    const { quietStart, quietEnd } = settings;
    if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
    return hour >= quietStart || hour < quietEnd;
  }

  function moveOutOfQuiet(date, settings) {
    const next = new Date(date);
    const hour = next.getHours() + next.getMinutes() / 60;
    const { quietStart, quietEnd } = settings;

    if (quietStart < quietEnd) {
      if (hour < quietEnd) return setHour(next, quietEnd, 0);
      return setHour(addDays(next, 1), quietEnd, 0);
    }

    if (hour >= quietStart) return setHour(addDays(next, 1), quietEnd, 0);
    return setHour(next, quietEnd, 0);
  }

  function previousActiveSlot(dueAt, settings) {
    let slot = addMinutes(dueAt, -settings.minLeadMinutes);
    if (!isQuiet(slot, settings)) return slot;
    if (slot.getHours() < settings.quietEnd) {
      return addMinutes(setHour(addDays(slot, -1), settings.quietStart, 0), -settings.minLeadMinutes);
    }
    return addMinutes(setHour(slot, settings.quietStart, 0), -settings.minLeadMinutes);
  }

  function buildPlan({ dueAt, remindAt, precision, confidence, reason, lead, settings, now, overdue = false }) {
    const tooEarly = dueAt ? remindAt < subtractLead(dueAt, lead) : false;
    const tooLate = dueAt ? remindAt >= dueAt : false;
    return {
      dueAt: dueAt ? dueAt.toISOString() : null,
      remindAt: remindAt.toISOString(),
      precision,
      confidence,
      urgency: overdue ? "overdue" : dueAt && dueAt <= addHours(now, 6) ? "soon" : "normal",
      reason,
      quietHours: `${padHour(settings.quietStart)}:00-${padHour(settings.quietEnd)}:00`,
      labels: {
        due: dueAt ? formatDateTime(dueAt) : "沒有明確截止",
        remind: formatDateTime(remindAt),
        relative: relativeLabel(remindAt, now),
        reason,
        risk: overdue ? "已過時間" : tooLate ? "可能太晚" : tooEarly ? "可能太早" : "時間合適",
      },
    };
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat("zh-Hant-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function relativeLabel(date, now) {
    const diff = date.getTime() - now.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 0) return "現在";
    if (minutes < 60) return `${minutes} 分鐘後`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小時後`;
    const days = Math.round(hours / 24);
    return `${days} 天後`;
  }

  function daysUntilWeekday(now, targetDay, forceNextWeek) {
    let offset = (targetDay - now.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    if (forceNextWeek) offset += 7;
    return offset;
  }

  function withTime(date, time) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hour, time.minute, 0, 0);
  }

  function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  }

  function addHours(date, hours) {
    return addMinutes(date, hours * 60);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), 0, 0);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function setHour(date, hour, minute) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  }

  function isValidDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
  }

  function padHour(hour) {
    return String(hour).padStart(2, "0");
  }

  function manualReason(minutes) {
    if (minutes >= 24 * 60) return "明天再提醒";
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小時後再提醒`;
    return `${minutes} 分鐘後再提醒`;
  }

  window.FocusOylTime = {
    DEFAULT_SETTINGS,
    planSignal,
    planManualReminder,
    inferDueAt,
    formatDateTime,
  };
})();
