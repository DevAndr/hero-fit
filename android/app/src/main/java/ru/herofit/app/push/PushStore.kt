package ru.herofit.app.push

import android.content.Context
import com.getcapacitor.JSObject

/** Подписка Web Push этого телефона (эндпоинт ntfy и ключи) и снятый эндпоинт, о котором сайт ещё не знает. */
data class PushSub(val endpoint: String, val p256dh: String, val auth: String) {
    fun toJS() = JSObject().put("endpoint", endpoint).put("p256dh", p256dh).put("auth", auth)
}

object PushStore {
    private fun prefs(context: Context) = context.getSharedPreferences("hero_push", Context.MODE_PRIVATE)

    fun get(context: Context): PushSub? {
        val p = prefs(context)
        val endpoint = p.getString("endpoint", null) ?: return null
        return PushSub(endpoint, p.getString("p256dh", "")!!, p.getString("auth", "")!!)
    }

    /** Новый эндпоинт; прежний (другой) — в dropped: сайт удалит его подписку при следующем запуске. */
    fun set(context: Context, sub: PushSub) {
        val old = get(context)
        prefs(context).edit().apply {
            if (old != null && old.endpoint != sub.endpoint) putString("dropped", old.endpoint)
            putString("endpoint", sub.endpoint).putString("p256dh", sub.p256dh).putString("auth", sub.auth)
        }.apply()
    }

    /** dropped = true — дистрибьютор снял регистрацию сам (сайт не знает); false — снял сайт (выход, «Выключить»). */
    fun clear(context: Context, dropped: Boolean) {
        val old = get(context)
        prefs(context).edit().apply {
            if (dropped && old != null) putString("dropped", old.endpoint)
            remove("endpoint").remove("p256dh").remove("auth")
        }.apply()
    }

    fun takeDropped(context: Context): String? {
        val p = prefs(context)
        return p.getString("dropped", null)?.also { p.edit().remove("dropped").apply() }
    }
}
