package ru.herofit.app

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import ru.herofit.app.push.EXTRA_URL
import ru.herofit.app.push.HeroPushPlugin
import ru.herofit.app.push.ensureChannels
import ru.herofit.app.push.safePath

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(HeroPushPlugin::class.java)
        super.onCreate(savedInstanceState)
        ensureChannels(this)
        openFromNotification(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openFromNotification(intent)
    }

    /** Нажатие на уведомление: открыть его путь на сайте (только свой путь — safePath). */
    private fun openFromNotification(intent: Intent?) {
        val path = intent?.getStringExtra(EXTRA_URL) ?: return
        intent.removeExtra(EXTRA_URL)
        val base = bridge?.serverUrl?.trimEnd('/') ?: return
        bridge.webView.post { bridge.webView.loadUrl(base + safePath(path)) }
    }
}
