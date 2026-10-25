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
        openFrom(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openFrom(intent)
    }

    /** Нажатие на уведомление или App Link https://hero-fit.ru/… — открыть этот путь на сайте (только свой — safePath). */
    private fun openFrom(intent: Intent?) {
        val path = intent?.getStringExtra(EXTRA_URL)?.also { intent.removeExtra(EXTRA_URL) }
            ?: intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data?.let { uri ->
                uri.encodedPath.orEmpty() + (uri.encodedQuery?.let { "?$it" } ?: "")
            }
            ?: return
        intent?.data = null
        val base = bridge?.serverUrl?.trimEnd('/') ?: return
        bridge.webView.post { bridge.webView.loadUrl(base + safePath(path)) }
    }
}
