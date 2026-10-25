/** applicationId Android-приложения (android/app/build.gradle) — после публикации в магазинах не меняется. */
export const ANDROID_PACKAGE = "ru.herofit.app";

/**
 * /.well-known/assetlinks.json — App Links: ссылки на сайт открываются в приложении. fingerprints — SHA-256 ключей
 * подписи через запятую (ANDROID_CERT_SHA256; свой ключ и ключ подписи Google Play); пусто — приложение не заявлено.
 */
export function assetLinks(fingerprints: string | undefined) {
  const list = (fingerprints ?? "").split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (!list.length) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: list },
    },
  ];
}
