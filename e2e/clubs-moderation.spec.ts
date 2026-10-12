import { expect, test } from "@playwright/test";
import { clubStatus, createClub, makeAdmin, notificationBodies, withDb } from "./db";
import { registerUser } from "./helpers";

// makeAdmin переименовывает глобального админа — сценарии по очереди и только на desktop
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Админ один на прогон");
});

const unique = () => Math.random().toString(36).slice(2, 7);

test("non-admin gets 404 on club moderation", async ({ page }) => {
  await registerUser(page);
  const res = await page.goto("/admin/clubs");
  expect(res?.status()).toBe(404);
});

test("reject with reason, approve once, hide and restore", async ({ browser }) => {
  const applicantCtx = await browser.newContext();
  const applicantPage = await applicantCtx.newPage();
  const applicant = await registerUser(applicantPage);
  const adminPage = await (await browser.newContext()).newPage();
  const admin = await registerUser(adminPage);
  await makeAdmin(admin.login);

  const city = `Казань${unique()}`;
  const name = `E2E Iron ${unique()}`;
  // Уже одобренный клуб с тем же названием — «Похожие клубы»
  await createClub(applicant.login, { status: "APPROVED", city, name, address: "ул. Баумана, 1" });
  const first = await createClub(applicant.login, { status: "PENDING", city, name, address: "ул. Пушкина, 5" });

  await adminPage.goto("/dashboard");
  await adminPage.getByRole("button", { name: /Меню профиля/ }).click();
  await expect(adminPage.getByRole("menuitem", { name: /Клубы\s*\d+/ })).toBeVisible();
  await adminPage.keyboard.press("Escape");

  await adminPage.goto("/admin/clubs");
  const card = adminPage.getByRole("article", { name });
  await expect(card.filter({ hasText: "ул. Пушкина, 5" })).toBeVisible();
  const pending = card.filter({ hasText: "ул. Пушкина, 5" });
  await expect(pending.getByText("+7 900 000-00-00")).toBeVisible();
  await expect(pending.getByText("Похожие клубы")).toBeVisible();
  await expect(pending.getByText("ул. Баумана, 1")).toBeVisible();

  // Отказ без причины — ошибка; с причиной — уведомление заявителю
  await pending.getByRole("button", { name: "Отклонить" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отклонить" }).click();
  await expect(dialog.getByText(/Причина: не короче 5 символов/)).toBeVisible();
  await dialog.getByLabel("Причина").fill("Нет такого зала");
  await dialog.getByRole("button", { name: "Отклонить" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => clubStatus(first.id)).toBe("REJECTED");
  await expect.poll(() => notificationBodies(applicant.login)).toContain("Нет такого зала");

  // Одобрение; повторное решение со старой страницы — «Заявка уже рассмотрена»
  const second = await createClub(applicant.login, { status: "PENDING", city, name: `${name} 2` });
  await adminPage.goto("/admin/clubs");
  const stale = await (await browser.newContext({ storageState: await adminPage.context().storageState() })).newPage();
  await stale.goto("/admin/clubs");
  await adminPage.getByRole("article", { name: `${name} 2` }).getByRole("button", { name: "Одобрить" }).click();
  await expect.poll(() => clubStatus(second.id)).toBe("APPROVED");
  await stale.getByRole("article", { name: `${name} 2` }).getByRole("button", { name: "Одобрить" }).click();
  await expect(stale.getByText("Заявка уже рассмотрена")).toBeVisible();
  const approvals = await withDb(async (db) =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from "Notification" n join "User" u on u.id = n."userId" where u.login = $1 and n.title like 'Клуб «%» одобрен'`,
        [applicant.login],
      )
    ).rows[0].n,
  );
  expect(approvals).toBe(1);

  // Скрыть и вернуть; правка города
  await adminPage.goto(`/admin/clubs?tab=approved&q=${encodeURIComponent(`${name} 2`)}`);
  const approved = adminPage.getByRole("article", { name: `${name} 2` });
  await approved.getByRole("button", { name: "Скрыть" }).click();
  await expect.poll(() => clubStatus(second.id)).toBe("HIDDEN");
  await approved.getByRole("button", { name: "Вернуть" }).click();
  await expect.poll(() => clubStatus(second.id)).toBe("APPROVED");
  await approved.getByRole("button", { name: "Изменить" }).click();
  const edit = adminPage.getByRole("dialog");
  await edit.getByLabel("Город").fill("Казань");
  await edit.getByRole("button", { name: "Сохранить" }).click();
  await expect(edit).toBeHidden();
  await expect(approved.getByText("Казань,")).toBeVisible();
});
