package com.meallens.app

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Phone features for the page, exposed as `window.MealLensApp`: reminders and
 * notifications, the home-screen widget, the barcode scanner, product lookup in
 * Open Food Facts, and sharing exported files. Async answers come back through
 * `window.__app(id, message)`; app-level events through `window.__appEvent(message)`.
 */
class AppBridge(private val activity: Activity, private val webView: WebView) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val ctx get() = activity.applicationContext

    // ---- summary for widget and reminder texts ----

    @JavascriptInterface
    fun syncSummary(json: String) {
        Reminders.prefs(ctx).edit().putString(Reminders.KEY_SUMMARY, json).apply()
        ProgressWidget.updateAll(ctx)
    }

    // ---- reminders ----

    @JavascriptInterface
    fun setReminders(json: String) {
        Reminders.save(ctx, json)
    }

    @JavascriptInterface
    fun notificationStatus(): String = JSONObject()
        .put("notifications", Reminders.canNotify(ctx))
        .put("exact", Reminders.canExact(ctx))
        .toString()

    @JavascriptInterface
    fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && !Reminders.canNotify(ctx)) {
            activity.runOnUiThread {
                activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
            }
        } else {
            onNotificationResult()
        }
    }

    fun onNotificationResult() {
        event(JSONObject().put("type", "permissions").put("status", JSONObject(notificationStatus())))
        if (Reminders.canNotify(ctx)) Reminders.scheduleAll(ctx)
    }

    @JavascriptInterface
    fun openNotificationSettings() {
        val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        start(i)
    }

    @JavascriptInterface
    fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= 31) {
            start(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}")))
        }
    }

    @JavascriptInterface
    fun testNotification() {
        val r = JSONObject().put("kind", "protein").put("smart", false).put("label", "Meal Lens test")
        val (title, text) = Reminders.message(ctx, r) ?: ("Meal Lens" to "Notifications are working.")
        Reminders.post(ctx, 999, title, text)
    }

    // ---- barcode ----

    @JavascriptInterface
    fun scanBarcode(id: String) {
        activity.runOnUiThread {
            val options = GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                    Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                    Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E
                )
                .enableAutoZoom()
                .build()
            GmsBarcodeScanning.getClient(activity, options).startScan()
                .addOnSuccessListener { b -> reply(id, JSONObject().put("code", b.rawValue ?: "")) }
                .addOnCanceledListener { reply(id, JSONObject().put("error", "cancelled")) }
                .addOnFailureListener { e -> reply(id, JSONObject().put("error", "failed").put("message", e.message ?: "")) }
        }
    }

    /** Fetches one product from Open Food Facts and returns its JSON text unchanged. */
    @JavascriptInterface
    fun lookupBarcode(id: String, code: String) {
        val clean = code.filter { it.isDigit() }
        if (clean.isEmpty()) { reply(id, JSONObject().put("error", "bad_code")); return }
        scope.launch {
            try {
                val text = withContext(Dispatchers.IO) {
                    val url = URL(
                        "https://world.openfoodfacts.org/api/v2/product/$clean.json" +
                            "?fields=product_name,brands,nutriments,serving_size,serving_quantity,quantity"
                    )
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 10000
                    conn.readTimeout = 15000
                    conn.setRequestProperty("User-Agent", "MealLens/3.0 (personal Android app)")
                    try {
                        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
                        stream?.bufferedReader()?.use { it.readText() } ?: ""
                    } finally {
                        conn.disconnect()
                    }
                }
                reply(id, JSONObject().put("json", text))
            } catch (e: Exception) {
                reply(id, JSONObject().put("error", "network").put("message", e.message ?: ""))
            }
        }
    }

    // ---- sharing exports ----

    @JavascriptInterface
    fun shareFile(id: String, filename: String, mime: String, content: String) {
        scope.launch {
            try {
                val safe = filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "meal-lens.txt" }
                val file = withContext(Dispatchers.IO) {
                    val dir = File(ctx.cacheDir, "exports").apply { mkdirs() }
                    File(dir, safe).apply { writeText(content) }
                }
                val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_SUBJECT, safe)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                activity.startActivity(Intent.createChooser(send, "Save or send $safe"))
                reply(id, JSONObject().put("ok", true))
            } catch (e: Exception) {
                reply(id, JSONObject().put("error", "share").put("message", e.message ?: ""))
            }
        }
    }

    fun close() = scope.cancel()

    private fun start(i: Intent) {
        activity.runOnUiThread {
            try { activity.startActivity(i) } catch (_: ActivityNotFoundException) { }
        }
    }

    private fun reply(id: String, payload: JSONObject) {
        val js = "window.__app && window.__app(${JSONObject.quote(id)}, $payload);"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun event(payload: JSONObject) {
        val js = "window.__appEvent && window.__appEvent($payload);"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val REQ_NOTIFY = 77
    }
}
