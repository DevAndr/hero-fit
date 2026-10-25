package ru.herofit.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import ru.herofit.app.MainActivity
import ru.herofit.app.R

/** Extra интента MainActivity: путь на сайте, который открыть по нажатию на уведомление. */
const val EXTRA_URL = "hero_url"

/** Каналы Android по NotificationType сервера (lib/notifications/push.ts); неизвестный тип — «Системные». */
fun channelFor(type: String?): String = when (type) {
    "REST" -> "rest"
    "STREAK", "PLAN", "RECAP", "COMEBACK", "GOAL" -> "reminders"
    "ACHIEVEMENT", "BOSS", "RAID" -> "game"
    "SOCIAL" -> "social"
    "COACH" -> "coach"
    else -> "system"
}

/** Один tag — один id: новое уведомление с тем же tag (таймер отдыха) заменяет прежнее, как в service worker. */
fun notificationId(tag: String?): Int = (tag ?: "hero-fit").hashCode()

/** Только свои пути («/…», не «//host» и не «/\host»); остальное — кабинет. */
fun safePath(url: String?): String {
    if (url.isNullOrEmpty() || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/dashboard"
    return url
}

private val CHANNELS = listOf(
    Triple("rest", "Таймер отдыха", NotificationManager.IMPORTANCE_HIGH),
    Triple("reminders", "Серия и напоминания", NotificationManager.IMPORTANCE_DEFAULT),
    Triple("game", "Ачивки и игра", NotificationManager.IMPORTANCE_DEFAULT),
    Triple("social", "Друзья и гильдии", NotificationManager.IMPORTANCE_DEFAULT),
    Triple("coach", "Тренер", NotificationManager.IMPORTANCE_DEFAULT),
    Triple("system", "Системные", NotificationManager.IMPORTANCE_DEFAULT),
)

fun ensureChannels(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    for ((id, name, importance) in CHANNELS) {
        val channel = NotificationChannel(id, name, importance)
        if (id == "rest") channel.enableVibration(true)
        manager.createNotificationChannel(channel)
    }
}

/** Показ push: тело — JSON {type, title, body, url, tag}, как у public/sw.js. */
fun showPush(context: Context, json: String) {
    val data = runCatching { JSONObject(json) }.getOrNull() ?: return
    ensureChannels(context) // push может прийти, когда приложение ещё ни разу не открывалось после установки
    val type = data.optString("type").ifEmpty { null }
    val tag = data.optString("tag").ifEmpty { null }
    val intent = Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(EXTRA_URL, safePath(data.optString("url").ifEmpty { null }))
    val open = PendingIntent.getActivity(
        context, notificationId(tag), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = NotificationCompat.Builder(context, channelFor(type))
        .setSmallIcon(R.drawable.ic_stat_hero)
        .setContentTitle(data.optString("title", "Hero Fit"))
        .setContentText(data.optString("body"))
        .setStyle(NotificationCompat.BigTextStyle().bigText(data.optString("body")))
        .setAutoCancel(true)
        .setContentIntent(open)
        .build()
    val manager = NotificationManagerCompat.from(context)
    if (manager.areNotificationsEnabled()) manager.notify(notificationId(tag), notification)
}
