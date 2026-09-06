import fs from "node:fs";
import vm from "node:vm";

// The existing reminder fixtures use Taiwan local time.
process.env.TZ = "Asia/Taipei";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createBrowserContext() {
  const store = new Map();
  const context = {
    window: {},
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    console,
    Date,
    Math,
    Intl,
    String,
    Number,
    Array,
    RegExp,
    Map,
    Set,
    JSON,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("memory-core.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("time-core.js", "utf8"), context);
  return context;
}

const context = createBrowserContext();
const sample = [
  "LINE mom: Tomorrow 8pm please confirm dinner headcount.",
  "AppleCare eligibility expires on 2026/05/18. Renew before it ends.",
  "Credit card bill USD 90 due Friday or interest applies.",
  "Maybe pick up medicine later.",
  "Receipt NT$880",
  "Can you review the document before leaving work?",
].join("\n");

const result = context.window.UltraMemory.analyzeText(sample, { source: "chat" });
assert(result.summary.actionable >= 4, "Expected at least four high-confidence reminders.");
assert(result.summary.review >= 1, "Expected at least one low-confidence review item.");
assert(result.actionable.some((item) => item.category === "warranty"), "Warranty signal was not detected.");
assert(result.actionable.some((item) => item.category === "health"), "Health/medicine signal was not detected.");
assert(result.review.some((item) => item.suggestion.includes("確認")), "Review queue did not include confirmable item.");

const lines = result.actionable.map((item) => item.line);
assert(new Set(lines).size === lines.length, "Actionable reminders contain duplicates.");

const warranty = result.actionable.find((item) => item.category === "warranty");
const plan = context.window.FocusOylTime.planSignal(warranty, {
  now: "2026-04-27T03:00:00+08:00",
  settings: { quietStart: 22, quietEnd: 8, minLeadMinutes: 12, defaultHour: 9 },
});
assert(plan?.remindAt, "Warranty reminder did not receive a reminder time.");
assert(plan.labels?.risk, "Reminder plan did not include timing risk label.");

const quietSnooze = context.window.FocusOylTime.planManualReminder(60, {
  now: "2026-04-27T21:30:00+08:00",
  settings: { quietStart: 22, quietEnd: 8, minLeadMinutes: 12, defaultHour: 9 },
});
assert(new Date(quietSnooze.remindAt).getHours() === 8, "Manual snooze should move out of quiet hours.");

const dueBoundSnooze = context.window.FocusOylTime.planManualReminder(24 * 60, {
  now: "2026-04-27T10:00:00+08:00",
  dueAt: "2026-04-27T18:00:00+08:00",
  settings: { quietStart: 22, quietEnd: 8, minLeadMinutes: 12, defaultHour: 9 },
});
assert(Date.parse(dueBoundSnooze.remindAt) < Date.parse("2026-04-27T18:00:00+08:00"), "Manual snooze should not pass a known deadline.");

console.log(JSON.stringify({
  ok: true,
  actionable: result.summary.actionable,
  review: result.summary.review,
  warrantyReminder: plan.labels.remind,
  quietSnooze: quietSnooze.labels.remind,
}, null, 2));
