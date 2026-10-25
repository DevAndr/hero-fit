import { describe, expect, it } from "vitest";
import { assetLinks } from "./assetlinks";

describe("assetLinks", () => {
  it("нет отпечатков — пустой список", () => {
    expect(assetLinks(undefined)).toEqual([]);
    expect(assetLinks("")).toEqual([]);
    expect(assetLinks(" , ")).toEqual([]);
  });

  it("отпечатки через запятую — одна запись приложения, верхний регистр, без пробелов", () => {
    expect(assetLinks(" aa:bb ,CC:DD,")).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "ru.herofit.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] },
      },
    ]);
  });
});
