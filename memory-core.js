/* Focus Oyl local memory core.
   Permission-first, browser-only signal extraction for the prototype. */

(() => {
  const STORAGE_KEY = "focusOyl.localMemory.v2";

  const taskWords = [
    "提醒", "記得", "不要忘", "截止", "到期", "繳費", "付款", "報帳", "回覆",
    "回信", "開會", "會議", "預約", "訂位", "取貨", "寄出", "簽名", "繳交",
    "保固", "續約", "renew", "deadline", "due", "invoice", "receipt", "reply",
    "meeting", "book", "pay", "submit", "取消", "改期", "請假", "看醫生", "回診",
    "吃藥", "領藥", "接送", "繳稅", "退貨", "取件", "面試", "交作業", "follow up",
    "medicine", "pharmacy", "prescription", "confirm", "schedule", "appointment",
    "reservation", "cancel", "reschedule"
  ];

  const softTaskWords = [
    "要不要", "可以幫", "麻煩", "方便", "需要", "可能", "應該", "先", "等一下",
    "等等", "晚點", "有空", "下班", "睡前", "出門前", "到家", "到公司", "麻煩你",
    "could you", "can you", "please", "remember to", "need to", "should"
  ];

  const riskWords = [
    "重要", "緊急", "急", "別漏", "一定", "最後", "逾期", "罰款", "取消資格",
    "失效", "過期", "避免", "不然", "否則", "urgent", "important", "asap",
    "overdue", "expires", "expire"
  ];

  const dateWords = [
    "今天", "明天", "後天", "今晚", "本週", "這週", "下週", "月底", "週一",
    "週二", "週三", "週四", "週五", "週六", "週日", "禮拜一", "禮拜二",
    "禮拜三", "禮拜四", "禮拜五", "禮拜六", "禮拜日", "週末", "明早", "明晚",
    "早上", "上午", "中午", "下午", "晚上", "睡前", "出門前", "下班前",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "Sunday", "tomorrow", "tonight", "next week", "weekend"
  ];

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"items":[]}');
    } catch {
      return { items: [] };
    }
  }

  function save(memory) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/　/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"');
  }

  function parseExportContent(content, fileName = "") {
    const name = String(fileName || "").toLowerCase();
    const trimmed = String(content || "").trim();

    if (name.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const json = JSON.parse(trimmed);
        const text = textFromKnownJson(json) || JSON.stringify(json, null, 2);
        return { text, source: detectSource(text) };
      } catch {
        return { text: trimmed, source: "text" };
      }
    }

    if (name.endsWith(".html") || /<\/?[a-z][\s\S]*>/i.test(trimmed)) {
      const text = stripHtml(trimmed);
      return { text, source: detectSource(text) };
    }

    return { text: trimmed, source: detectSource(trimmed) };
  }

  function textFromKnownJson(json) {
    const root = Array.isArray(json) ? { messages: json } : json;
    const messages = Array.isArray(root?.messages) ? root.messages : null;
    if (!messages) return "";

    return messages
      .map((message) => {
        const sender = message.from || message.sender_name || message.author || "對話";
        const value = Array.isArray(message.text)
          ? message.text.map((part) => typeof part === "string" ? part : part?.text || "").join("")
          : message.text || message.content || message.message || "";
        return value ? `${sender}: ${value}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function detectSource(text) {
    const lower = String(text || "").toLowerCase();
    if (/whatsapp|line|telegram|messenger|instagram|discord|訊息|對話/.test(lower)) return "chat";
    if (/invoice|receipt|applecare|保固|發票|訂單|付款|繳費|nt\$/.test(lower)) return "receipt";
    if (/meeting|deadline|figma|notion|github|會議|提案|專案/.test(lower)) return "work";
    return "text";
  }

  function splitLines(text) {
    const chunks = normalizeText(text)
      .split(/\n+|(?<=[。！？!?；;])\s*/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 120);
    const merged = [];
    chunks.forEach((line, index) => {
      merged.push(line);
      const next = chunks[index + 1];
      const openEnded = !/[。！？!?；;.]$/.test(line);
      const lineStandalone = hasTaskIntent(line) || hasSoftTaskIntent(line) || extractDates(line).length || extractAmounts(line).length;
      const nextStandalone = next && (hasTaskIntent(next) || hasSoftTaskIntent(next) || extractDates(next).length || extractAmounts(next).length);
      if (next && openEnded && line.length < 42 && next.length < 80 && !(lineStandalone && nextStandalone)) {
        merged.push(`${line} ${next}`);
      }
    });
    return [...new Set(merged)].slice(0, 160);
  }

  function extractDates(line) {
    const hits = [];
    for (const match of line.matchAll(/(?:20\d{2}[./-])?\d{1,2}[./-]\d{1,2}(?:\s*(?:上午|下午|晚上)?\s*\d{1,2}[:：]\d{2})?/g)) {
      hits.push(match[0]);
    }
    for (const match of line.matchAll(/20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g)) {
      hits.push(match[0].replace(/\s+/g, ""));
    }
    for (const match of line.matchAll(/\d{1,2}\s*月\s*\d{1,2}\s*日?(?:\s*(?:上午|下午|晚上)?\s*\d{1,2}[:：]\d{2})?/g)) {
      hits.push(match[0].replace(/\s+/g, ""));
    }
    for (const match of line.matchAll(/(?:上午|早上|中午|下午|晚上|今晚)?\s*\d{1,2}\s*(?:點|時)(?:半|\d{1,2}\s*分?)?/g)) {
      hits.push(match[0].replace(/\s+/g, ""));
    }
    for (const word of dateWords) {
      if (line.toLowerCase().includes(word.toLowerCase())) hits.push(word);
    }
    return [...new Set(hits)];
  }

  function extractAmounts(line) {
    const values = [];
    for (const match of line.matchAll(/(?:NT\$|NTD|TWD|USD|HK\$|RMB|¥|€|\$)\s?[\d,]+(?:\.\d+)?|[\d,]+\s?(?:元|塊|美元|台幣|港幣)/gi)) {
      values.push(match[0].trim());
    }
    return [...new Set(values)];
  }

  function extractPeople(line) {
    const people = [];
    const speaker = line.match(/^([^:：]{1,16})[:：]/);
    if (speaker) people.push(speaker[1].trim());

    for (const match of line.matchAll(/(?:跟|找|問|回覆|通知|提醒|帶|接|送|幫)\s*([\u4e00-\u9fa5A-Za-z]{2,16})/g)) {
      people.push(match[1]);
    }
    for (const match of line.matchAll(/@([A-Za-z0-9_\-.]{2,32})/g)) people.push(match[1]);
    return [...new Set(people)].slice(0, 4);
  }

  function hasTaskIntent(line) {
    const lower = line.toLowerCase();
    return taskWords.some((word) => lower.includes(word.toLowerCase()));
  }

  function hasSoftTaskIntent(line) {
    const lower = line.toLowerCase();
    return softTaskWords.some((word) => lower.includes(word.toLowerCase()));
  }

  function hasRiskLanguage(line) {
    const lower = line.toLowerCase();
    return riskWords.some((word) => lower.includes(word.toLowerCase()));
  }

  function classify(line, source) {
    const lower = line.toLowerCase();
    if (/吃藥|領藥|回診|看醫生|掛號|藥局|medicine|pharmacy|prescription|appointment|clinic|hospital/.test(lower)) return "health";
    if (/保固|applecare|warranty|到期|expire/.test(lower)) return "warranty";
    if (/繳費|付款|報帳|發票|invoice|receipt|nt\$|\$|稅|帳單|刷卡/.test(lower)) return "finance";
    if (/回覆|回信|reply|問一下|訊息/.test(lower)) return "reply";
    if (/會議|開會|meeting|deadline|提案|專案|figma|notion|面試|交付|交稿/.test(lower)) return "work";
    if (/接送|聚餐|訂位|餐廳|家人|媽媽|爸爸|阿姨|叔叔|朋友/.test(lower)) return "family";
    if (/機票|車票|飯店|旅館|check.?in|登機|出發|抵達|travel|hotel|flight/.test(lower)) return "travel";
    if (source === "chat") return "message";
    return "reminder";
  }

  function scoreItem(item) {
    let score = 6;
    if (item.dates.length) score += 28;
    if (item.amounts.length) score += 14;
    if (item.people.length) score += 8;
    if (hasTaskIntent(item.line)) score += 34;
    if (hasSoftTaskIntent(item.line)) score += 18;
    if (hasRiskLanguage(item.line)) score += 12;
    if (["warranty", "finance", "reply", "work", "health", "travel"].includes(item.category)) score += 16;
    if (item.source === "chat" || item.source === "message") score += 4;
    return Math.min(score, 100);
  }

  function buildSuggestion(item) {
    if (item.needsReview) return "請確認是否需要提醒";
    if (item.category === "health") return "提醒健康或用藥事項";
    if (item.category === "warranty") return "提醒保固或資格到期";
    if (item.category === "finance") return "整理付款與報帳提醒";
    if (item.category === "reply") return "提醒回覆這則訊息";
    if (item.category === "work") return "建立工作待辦";
    if (item.category === "family") return "提醒家人或生活安排";
    if (item.category === "travel") return "提醒交通或行程";
    if (item.dates.length) return "建立時間提醒";
    return "收進本地記憶";
  }

  function reviewReason(item) {
    if (item.score >= 46) return "";
    if (item.dates.length && item.people.length) return "有時間與人物，但語氣不夠明確";
    if (item.dates.length) return "有時間線索";
    if (item.amounts.length) return "有金額或帳單線索";
    if (hasSoftTaskIntent(item.line)) return "像是請求或待辦語氣";
    if (hasRiskLanguage(item.line)) return "有風險或期限語氣";
    if (item.source === "chat" && item.people.length) return "聊天中提到人物";
    return "";
  }

  function confidenceFor(item) {
    if (item.score >= 72) return "high";
    if (item.score >= 46) return "medium";
    if (item.score >= 28) return "low";
    return "archive";
  }

  function normalizeForDedupe(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s，。！？、；;:：,.!?()[\]{}"'`~\-_/\\|]+/g, "");
  }

  function isNearDuplicate(a, b) {
    const left = normalizeForDedupe(a);
    const right = normalizeForDedupe(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    return shorter.length >= 10 && longer.includes(shorter);
  }

  function dedupeItems(items) {
    const ranked = [...items].sort((a, b) => b.score - a.score || a.line.length - b.line.length);
    const kept = [];
    for (const item of ranked) {
      if (kept.some((existing) => existing.category === item.category && isNearDuplicate(existing.line, item.line))) continue;
      kept.push(item);
    }
    return kept.sort((a, b) => a.index - b.index);
  }

  function analyzeText(text, meta = {}) {
    const rawText = normalizeText(text);
    const source = meta.source || detectSource(rawText);
    const lines = splitLines(rawText);

    const items = lines.map((line, index) => {
      const item = {
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        index,
        source,
        line,
        dates: extractDates(line),
        amounts: extractAmounts(line),
        people: extractPeople(line),
        category: classify(line, source),
        createdAt: new Date().toISOString(),
      };
      item.score = scoreItem(item);
      item.reviewReason = reviewReason(item);
      item.confidence = confidenceFor(item);
      item.needsReview = item.score >= 28 && item.score < 46;
      item.suggestion = buildSuggestion(item);
      return item;
    });
    const uniqueItems = dedupeItems(items);

    const actionable = uniqueItems
      .filter((item) => item.score >= 46)
      .sort((a, b) => b.score - a.score);
    const actionableIds = new Set(actionable.map((item) => item.id));
    const review = uniqueItems
      .filter((item) => !actionableIds.has(item.id))
      .filter((item) => item.needsReview || item.reviewReason)
      .sort((a, b) => b.score - a.score);

    return {
      source,
      rawText,
      items: uniqueItems,
      actionable,
      review,
      summary: {
        lines: uniqueItems.length,
        actionable: actionable.length,
        review: review.length,
        dates: uniqueItems.reduce((sum, item) => sum + item.dates.length, 0),
        amounts: uniqueItems.reduce((sum, item) => sum + item.amounts.length, 0),
      },
    };
  }

  function ingestText(text, meta = {}) {
    const result = analyzeText(text, meta);
    const memory = load();
    memory.items.unshift({
      id: `source-${Date.now()}`,
      type: result.source,
      rawText: result.rawText,
      result,
      createdAt: new Date().toISOString(),
    });
    memory.items = memory.items.slice(0, 80);
    save(memory);
    return result;
  }

  function ingestExport(content, meta = {}) {
    const parsed = parseExportContent(content, meta.fileName);
    return ingestText(parsed.text, { ...meta, source: meta.source || parsed.source });
  }

  function getRecent() {
    return load().items;
  }

  function clear() {
    save({ items: [] });
  }

  window.UltraMemory = {
    analyzeText,
    ingestText,
    ingestExport,
    parseExportContent,
    getRecent,
    clear,
  };
})();
