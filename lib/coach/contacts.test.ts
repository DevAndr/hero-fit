import { describe, expect, it } from "vitest";
import { contactLinks, contactsSchema, hasContacts, type ContactKind } from "./contacts";

const parse = (v: Partial<Record<ContactKind, string>>) => contactsSchema.safeParse({ telegram: "", whatsapp: "", vk: "", phone: "", email: "", ...v });
const none = { telegram: null, whatsapp: null, vk: null, phone: null, email: null };

describe("contactsSchema", () => {
  it("telegram: @nick, t.me, ссылка с хвостом → nick", () => {
    for (const v of ["@hero_coach", "hero_coach", "t.me/hero_coach", "https://t.me/hero_coach?start=x", " https://t.me/hero_coach/ "])
      expect(parse({ telegram: v }).data?.telegram).toBe("hero_coach");
    expect(parse({ telegram: "abc" }).error?.issues[0].message).toBe("Проверьте ник в Telegram");
    expect(parse({ telegram: "<script>" }).success).toBe(false);
  });

  it("телефон и whatsapp → +цифры", () => {
    for (const v of ["8 (999) 123-45-67", "+7 999 123 45 67", "89991234567"]) expect(parse({ phone: v }).data?.phone).toBe("+79991234567");
    expect(parse({ whatsapp: "+44 20 7946 0958" }).data?.whatsapp).toBe("+442079460958");
    expect(parse({ phone: "12345" }).error?.issues[0].message).toBe("Проверьте номер");
    expect(parse({ whatsapp: "+7 999 abc" }).success).toBe(false);
  });

  it("иностранный номер с «+» и восьмёркой не становится российским", () => {
    expect(parse({ phone: "+81 3 1234 5678" }).data?.phone).toBe("+81312345678");
    expect(parse({ whatsapp: "+84 91 234 5678" }).data?.whatsapp).toBe("+84912345678");
  });

  it("российский номер из 10 цифр без 8 и +7 → +7", () => {
    expect(parse({ phone: "999 123 45 67" }).data?.phone).toBe("+79991234567");
    expect(parse({ whatsapp: "(999) 123-45-67" }).data?.whatsapp).toBe("+79991234567");
  });

  it("vk: ссылка, слэш на конце, id123", () => {
    expect(parse({ vk: "https://vk.com/hero.coach/" }).data?.vk).toBe("hero.coach");
    expect(parse({ vk: "m.vk.com/hero_coach?w=wall" }).data?.vk).toBe("hero_coach");
    expect(parse({ vk: "id123" }).data?.vk).toBe("id123");
    expect(parse({ vk: "vk.com/a b" }).error?.issues[0].message).toBe("Проверьте адрес VK");
  });

  it("email в нижнем регистре; пустые поля → null", () => {
    expect(parse({ email: " Coach@Mail.ru " }).data?.email).toBe("coach@mail.ru");
    expect(parse({}).data).toEqual(none);
    expect(parse({ email: "nope" }).error?.issues[0].message).toBe("Проверьте email");
  });
});

describe("contactLinks", () => {
  it("строит только наши ссылки, по порядку", () => {
    const links = contactLinks({ telegram: "hero_coach", whatsapp: "+79991234567", vk: "id123", phone: "+79991234567", email: "c@m.ru" });
    expect(links.map((l) => l.href)).toEqual(["https://t.me/hero_coach", "https://wa.me/79991234567", "https://vk.com/id123", "tel:+79991234567", "mailto:c@m.ru"]);
    expect(links.map((l) => l.text)).toEqual(["@hero_coach", "+7 999 123-45-67", "vk.com/id123", "+7 999 123-45-67", "c@m.ru"]);
    expect(contactLinks(none)).toEqual([]);
  });

  it("иностранный номер показывается как есть", () => {
    expect(contactLinks({ ...none, phone: "+442079460958" })[0].text).toBe("+442079460958");
  });
});

it("hasContacts", () => {
  expect(hasContacts(none)).toBe(false);
  expect(hasContacts({ ...none, email: "c@m.ru" })).toBe(true);
});
