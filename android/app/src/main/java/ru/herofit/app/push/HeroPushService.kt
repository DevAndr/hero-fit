package ru.herofit.app.push

import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/** События дистрибьютора UnifiedPush (приложение ntfy); работает и когда Hero Fit закрыт. */
class HeroPushService : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        val keys = endpoint.pubKeySet
        if (keys == null) {
            HeroPushPlugin.onFailed("failed:NO_KEYS")
            return
        }
        val sub = PushSub(endpoint.url, keys.pubKey, keys.auth)
        PushStore.set(this, sub)
        HeroPushPlugin.onEndpoint(sub)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        // Не расшифровалось (ключи сменились) — отбрасываем: сайт перерегистрирует подписку при запуске
        if (message.decrypted) showPush(this, String(message.content, Charsets.UTF_8))
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        HeroPushPlugin.onFailed("failed:${reason.name}")
    }

    override fun onUnregistered(instance: String) {
        PushStore.clear(this, dropped = true)
        HeroPushPlugin.onUnregistered()
    }
}
