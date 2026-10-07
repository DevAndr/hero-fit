export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NOTIFICATIONS_WORKER === "off") return;
  const { startNotificationWorker } = await import("./lib/notifications/worker");
  startNotificationWorker();
}
