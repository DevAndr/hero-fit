/** Логин в списке ADMIN_LOGINS (через запятую, без учёта регистра); пустые элементы никого не делают админом. */
export function isAdminLogin(login: string, adminLogins: string | undefined): boolean {
  const me = login.trim().toLowerCase();
  if (!me || !adminLogins) return false;
  return adminLogins
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .some((l) => l === me);
}
