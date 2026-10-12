import { describe, expect, it } from "vitest";
import { clubKey, clubSchema, createBlock, joinBlock, kickBlock, likePattern, similarClubs, transferBlock, type SimilarCandidate } from "./rules";

const ok = { name: "Зал", city: "Москва", address: "Тверская, 1", contact: "+7 900 000-00-00", represent: true };

const cand = (id: string, name: string, city: string, address: string): SimilarCandidate => ({
  id,
  name,
  address,
  cityKey: clubKey(city),
  nameKey: clubKey(name),
  addressKey: clubKey(address),
});

describe("clubKey", () => {
  it("нормализует регистр, ё, кавычки, пунктуацию и пробелы", () => {
    expect(clubKey("  «Ёлка»  Фитнес!! ")).toBe("елка фитнес");
    expect(clubKey("ул. Ленина, 5")).toBe("ул ленина 5");
  });
});

describe("clubSchema", () => {
  it("принимает заявку с галочкой", () => {
    expect(clubSchema.safeParse(ok).success).toBe(true);
  });
  it("без галочки «Я представляю этот зал» — отказ", () => {
    expect(clubSchema.safeParse({ ...ok, represent: false }).success).toBe(false);
  });
  it("короткое название — отказ", () => {
    expect(clubSchema.safeParse({ ...ok, name: "ab" }).success).toBe(false);
  });
});

describe("similarClubs", () => {
  const wcMsk = cand("wc-msk", "World Class Тверская", "Москва", "Тверская 1");
  const wcSpb = cand("wc-spb", "World Class", "Санкт-Петербург", "Невский 1");
  it("тот же город, название содержит другое", () => {
    expect(similarClubs({ city: "москва", name: "World Class", address: "Арбат 3" }, [wcMsk, wcSpb]).map((c) => c.id)).toEqual(["wc-msk"]);
  });
  it("совпадение по адресу", () => {
    expect(similarClubs({ city: "Москва", name: "Другой", address: "тверская, 1" }, [wcMsk]).map((c) => c.id)).toEqual(["wc-msk"]);
  });
  it("короткий ввод не находит всё подряд: «содержит» — от 3 символов, точное совпадение — всегда", () => {
    const sila = cand("s", "Сила", "Казань", "Баумана 5");
    expect(similarClubs({ city: "Казань", name: "а", address: "б" }, [sila])).toEqual([]);
    expect(similarClubs({ city: "Казань", name: "ил", address: "б" }, [sila])).toEqual([]);
    expect(similarClubs({ city: "Казань", name: "сил", address: "б" }, [sila]).map((c) => c.id)).toEqual(["s"]);
    expect(similarClubs({ city: "Казань", name: "x", address: "x" }, [cand("x", "X", "Казань", "x")]).map((c) => c.id)).toEqual(["x"]);
  });

  it("не больше 5", () => {
    const many = Array.from({ length: 7 }, (_, i) => cand(`c${i}`, `Сила ${i}`, "Казань", `Адрес ${i}`));
    expect(similarClubs({ city: "Казань", name: "Сила", address: "нет" }, many)).toHaveLength(5);
  });
});

describe("лимиты и запреты", () => {
  it("createBlock", () => {
    expect(createBlock({ admined: 5, pending: 0 })).toBe("Можно управлять не больше чем 5 клубами");
    expect(createBlock({ admined: 2, pending: 3 })).toBe("Не больше 3 заявок на проверке");
    expect(createBlock({ admined: 4, pending: 2 })).toBeNull();
  });
  it("joinBlock", () => {
    expect(joinBlock({ banned: true, hasNickname: true, sameClub: false })).toBe("Админ клуба ограничил вступление");
    expect(joinBlock({ banned: false, hasNickname: false, sameClub: false })).toBe("nickname");
    expect(joinBlock({ banned: false, hasNickname: true, sameClub: true })).toBe("same");
    expect(joinBlock({ banned: false, hasNickname: true, sameClub: false })).toBeNull();
  });
  it("transferBlock", () => {
    expect(transferBlock({ selfId: "a", targetId: "a", targetIsMember: true, targetAdmined: 0 })).toBe("Клуб уже ваш");
    expect(transferBlock({ selfId: "a", targetId: "b", targetIsMember: false, targetAdmined: 0 })).toBe("Передать можно только участнику клуба");
    expect(transferBlock({ selfId: "a", targetId: "b", targetIsMember: true, targetAdmined: 5 })).toBe("У него уже 5 клубов");
    expect(transferBlock({ selfId: "a", targetId: "b", targetIsMember: true, targetAdmined: 1 })).toBeNull();
  });
  it("kickBlock", () => {
    expect(kickBlock({ adminId: "a", targetId: "a" })).toBe("Себя исключить нельзя");
    expect(kickBlock({ adminId: "a", targetId: "b" })).toBeNull();
  });
});

describe("likePattern", () => {
  it("экранирует спецсимволы ILIKE", () => {
    expect(likePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});
