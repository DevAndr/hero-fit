import { describe, expect, it } from "vitest";
import { alreadyPassedToday, canAddReminder, formatTime, localMinutes, mealReminderDue, mealReminderSchema, mealReminderText, nextDefault, parseTime } from "./reminders";

const base = { timeZone: "Europe/Moscow", minutes: 14 * 60, enabled: true, remindedDay: null };
const at = (iso: string) => new Date(iso); // 2026-11-13T11:00:00Z = 14:00 МСК

describe("mealReminderDue", () => {
  it("ровно в срок", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T11:00:00Z") })).toEqual({ day: "2026-11-13" }));
  it("за минуту до срока — нет", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T10:59:59Z") })).toBeNull());
  it("+59 минут — да", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T11:59:00Z") })).toEqual({ day: "2026-11-13" }));
  it("+60 минут — нет", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T12:00:00Z") })).toBeNull());
  it("выключено — нет", () => expect(mealReminderDue({ ...base, enabled: false, now: at("2026-11-13T11:00:00Z") })).toBeNull());
  it("уже решено сегодня — нет", () => expect(mealReminderDue({ ...base, remindedDay: "2026-11-13", now: at("2026-11-13T11:00:00Z") })).toBeNull());
  it("решено вчера — да", () => expect(mealReminderDue({ ...base, remindedDay: "2026-11-12", now: at("2026-11-13T11:00:00Z") })).toEqual({ day: "2026-11-13" }));
  it("день — местный: 00:30 МСК при minutes=30", () =>
    expect(mealReminderDue({ ...base, minutes: 30, now: at("2026-11-13T21:30:00Z") })).toEqual({ day: "2026-11-14" }));
  it("23:30 не переходит через полночь", () =>
    expect(mealReminderDue({ ...base, minutes: 23 * 60 + 30, now: at("2026-11-13T21:10:00Z") })).toBeNull()); // 00:10 МСК
});

describe("время", () => {
  it("parseTime", () => {
    expect(parseTime("09:05")).toBe(545);
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("23:59")).toBe(1439);
    for (const bad of ["", "24:00", "9:5", "12:60", "ab:cd", "12:30:00"]) expect(parseTime(bad)).toBeNull();
  });
  it("formatTime", () => { expect(formatTime(545)).toBe("09:05"); expect(formatTime(0)).toBe("00:00"); expect(formatTime(1439)).toBe("23:59"); });
  it("localMinutes", () => expect(localMinutes(at("2026-11-13T11:07:00Z"), "Europe/Moscow")).toBe(14 * 60 + 7));
  it("alreadyPassedToday", () => {
    expect(alreadyPassedToday(at("2026-11-13T11:00:00Z"), "Europe/Moscow", 14 * 60)).toBe(true);
    expect(alreadyPassedToday(at("2026-11-13T11:00:00Z"), "Europe/Moscow", 14 * 60 + 1)).toBe(false);
  });
});

describe("mealReminderText", () => {
  it.each([
    ["BREAKFAST", 540, "Завтрак · 09:00", "Запишите завтрак в дневник"],
    ["LUNCH", 840, "Обед · 14:00", "Запишите обед в дневник"],
    ["DINNER", 1200, "Ужин · 20:00", "Запишите ужин в дневник"],
    ["SNACK", 1020, "Перекус · 17:00", "Запишите перекус в дневник"],
  ] as const)("%s", (meal, minutes, title, body) => expect(mealReminderText(meal, minutes)).toEqual({ title, body }));
});

describe("nextDefault", () => {
  it("пусто → завтрак 09:00", () => expect(nextDefault([])).toEqual({ meal: "BREAKFAST", minutes: 540 }));
  it("есть завтрак → обед 14:00", () => expect(nextDefault([{ meal: "BREAKFAST", minutes: 480 }])).toEqual({ meal: "LUNCH", minutes: 840 }));
  it("порядок: завтрак, обед, перекус, ужин", () =>
    expect(nextDefault([{ meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }])).toEqual({ meal: "SNACK", minutes: 1020 }));
  it("время по умолчанию занято другим приёмом → +30 минут до свободного", () =>
    expect(nextDefault([{ meal: "SNACK", minutes: 540 }])).toEqual({ meal: "BREAKFAST", minutes: 570 }));
  it("все четыре есть → перекус через 30 минут после последнего", () =>
    expect(nextDefault([
      { meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }, { meal: "SNACK", minutes: 1020 }, { meal: "DINNER", minutes: 1200 },
    ])).toEqual({ meal: "SNACK", minutes: 1230 }));
  it("последнее в 23:45 → +30 по модулю суток", () =>
    expect(nextDefault([
      { meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }, { meal: "SNACK", minutes: 1020 }, { meal: "DINNER", minutes: 1425 },
    ])).toEqual({ meal: "SNACK", minutes: 15 }));
  it("6 штук → null", () => expect(nextDefault(Array.from({ length: 6 }, (_, i) => ({ meal: "SNACK" as const, minutes: i * 60 })))).toBeNull());
});

describe("canAddReminder", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ minutes: i * 60 }));
  it("6 напоминаний → limit", () => expect(canAddReminder(six, 1000)).toBe("limit"));
  it("совпадение времени → taken", () => expect(canAddReminder([{ minutes: 840 }], 840)).toBe("taken"));
  it("limit важнее taken", () => expect(canAddReminder(six, 60)).toBe("limit"));
  it("иначе null", () => {
    expect(canAddReminder([], 840)).toBeNull();
    expect(canAddReminder(six.slice(0, 5), 1000)).toBeNull();
  });
});

describe("mealReminderSchema", () => {
  const ok = (v: unknown) => mealReminderSchema.safeParse(v).success;
  it("границы minutes: 0 и 1439 проходят", () => {
    expect(ok({ meal: "LUNCH", minutes: 0 })).toBe(true);
    expect(ok({ meal: "LUNCH", minutes: 1439 })).toBe(true);
  });
  it("1440, -1, 1.5 и строка — нет", () => {
    expect(ok({ meal: "LUNCH", minutes: 1440 })).toBe(false);
    expect(ok({ meal: "LUNCH", minutes: -1 })).toBe(false);
    expect(ok({ meal: "LUNCH", minutes: 1.5 })).toBe(false);
    expect(ok({ meal: "LUNCH", minutes: "840" })).toBe(false);
  });
  it("неизвестный приём — нет", () => expect(ok({ meal: "BRUNCH", minutes: 600 })).toBe(false));
});
