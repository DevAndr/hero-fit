package ru.herofit.app.push

import android.Manifest
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.unifiedpush.android.connector.INSTANCE_DEFAULT
import org.unifiedpush.android.connector.UnifiedPush
import ru.herofit.app.BuildConfig

/**
 * Push приложения через UnifiedPush (дистрибьютор — приложение ntfy). JS-API — lib/native/hero-push.ts;
 * подписку сайт сохраняет как Web Push с kind UNIFIEDPUSH (спека 2026-10-25-native-push-ntfy).
 */
@CapacitorPlugin(
    name = "HeroPush",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class HeroPushPlugin : Plugin() {
    companion object {
        private const val REGISTER_TIMEOUT_MS = 20_000L

        @Volatile private var instance: HeroPushPlugin? = null
        @Volatile private var pending: PluginCall? = null
        private val main = Handler(Looper.getMainLooper())

        /** Вызывается из HeroPushService; приложение может быть закрыто — тогда только PushStore. */
        fun onEndpoint(sub: PushSub) = main.post {
            pending?.resolve(sub.toJS())
            pending = null
            instance?.notifyListeners("subscriptionChanged", sub.toJS(), true)
        }

        fun onFailed(reason: String) = main.post {
            pending?.reject(reason)
            pending = null
        }

        fun onUnregistered() = main.post {
            pending?.reject("failed:UNREGISTERED")
            pending = null
            instance?.notifyListeners("subscriptionChanged", JSObject().put("endpoint", null as String?), true)
        }
    }

    override fun load() {
        instance = this
    }

    private fun permission(): String = when {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> "granted"
        else -> when (getPermissionState("notifications")) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("distributor", UnifiedPush.getDistributors(context).isNotEmpty())
                .put("permission", permission()),
        )
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (permission() == "granted") return call.resolve(JSObject().put("permission", "granted"))
        requestPermissionForAlias("notifications", call, "permissionResult")
    }

    @PermissionCallback
    private fun permissionResult(call: PluginCall) {
        call.resolve(JSObject().put("permission", if (permission() == "granted") "granted" else "denied"))
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val vapid = call.getString("vapid")
        if (UnifiedPush.getDistributors(context).isEmpty()) return call.reject("no-distributor")
        activity.runOnUiThread {
            // Сохранённый или единственный дистрибьютор; если их несколько — система спросит пользователя
            UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { ok ->
                if (!ok) return@tryUseCurrentOrDefaultDistributor call.reject("no-distributor")
                pending?.reject("superseded")
                pending = call
                UnifiedPush.register(context, INSTANCE_DEFAULT, null, vapid)
                main.postDelayed({
                    if (pending === call) {
                        pending = null
                        call.reject("timeout")
                    }
                }, REGISTER_TIMEOUT_MS)
            }
        }
    }

    @PluginMethod
    fun getSubscription(call: PluginCall) {
        call.resolve(PushStore.get(context)?.toJS() ?: JSObject().put("endpoint", null as String?))
    }

    @PluginMethod
    fun takeDropped(call: PluginCall) {
        call.resolve(JSObject().put("endpoint", PushStore.takeDropped(context)))
    }

    @PluginMethod
    fun unregister(call: PluginCall) {
        UnifiedPush.unregister(context, INSTANCE_DEFAULT)
        PushStore.clear(context, dropped = false)
        call.resolve()
    }

    @PluginMethod
    fun appVersion(call: PluginCall) {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        call.resolve(JSObject().put("version", info.versionName).put("flavor", BuildConfig.FLAVOR))
    }
}
