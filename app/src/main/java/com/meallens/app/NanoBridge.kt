package com.meallens.app

import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.TextPart
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Exposes the phone's built-in Gemini Nano model (through ML Kit GenAI) to the
 * web page as `window.MealLensAI`. Every call takes a request id; the answer comes
 * back by calling `window.__nano(id, message)` in the page.
 *
 * Nothing here talks to a server: inference runs on the phone, so there is no
 * per-request cost.
 */
class NanoBridge(private val webView: WebView) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val jobs = ConcurrentHashMap<String, Job>()
    private var model: GenerativeModel? = null

    private fun model(): GenerativeModel = model ?: Generation.getClient().also { model = it }

    /** Reports AVAILABLE, DOWNLOADABLE, DOWNLOADING or UNAVAILABLE. */
    @JavascriptInterface
    fun status(id: String) = run(id) {
        val s = model().checkStatus()
        reply(id, JSONObject().put("status", statusName(s)))
    }

    /** Downloads the model if the phone needs it, sending progress events. */
    @JavascriptInterface
    fun download(id: String) = run(id) {
        var failure: Throwable? = null
        model().download().collect { st ->
            when (st) {
                is DownloadStatus.DownloadStarted ->
                    event(id, JSONObject().put("event", "started"))
                is DownloadStatus.DownloadProgress ->
                    event(id, JSONObject().put("event", "progress").put("bytes", st.totalBytesDownloaded))
                is DownloadStatus.DownloadFailed ->
                    failure = st.e
                else -> Unit
            }
        }
        failure?.let { throw it }
        reply(id, JSONObject().put("status", statusName(model().checkStatus())))
    }

    /** Runs one prompt, with an optional JPEG photo (base64), and returns the model's text. */
    @JavascriptInterface
    fun generate(id: String, imageBase64: String, prompt: String) = run(id) {
        val builder = if (imageBase64.isNotEmpty()) {
            val bytes = withContext(Dispatchers.Default) { Base64.decode(imageBase64, Base64.DEFAULT) }
            GenerateContentRequest.Builder(ImagePart(bytes), TextPart(prompt))
        } else {
            GenerateContentRequest.Builder(TextPart(prompt))
        }
        builder.temperature = 0.1f
        builder.maxOutputTokens = 900
        val response = model().generateContent(builder.build())
        val text = response.candidates.firstOrNull()?.text ?: ""
        reply(id, JSONObject().put("text", text))
    }

    @JavascriptInterface
    fun cancel(id: String) {
        jobs.remove(id)?.cancel()
    }

    fun close() {
        scope.cancel()
        try { model?.close() } catch (_: Exception) { }
        model = null
    }

    private fun run(id: String, block: suspend () -> Unit) {
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                block()
            } catch (e: CancellationException) {
                fail(id, "cancelled", "")
            } catch (e: Throwable) {
                fail(id, "error", e.message ?: e.javaClass.simpleName)
            } finally {
                jobs.remove(id)
            }
        }
        jobs[id] = job
        job.start()
    }

    private fun statusName(s: Int): String = when (s) {
        FeatureStatus.AVAILABLE -> "AVAILABLE"
        FeatureStatus.DOWNLOADABLE -> "DOWNLOADABLE"
        FeatureStatus.DOWNLOADING -> "DOWNLOADING"
        else -> "UNAVAILABLE"
    }

    private fun reply(id: String, payload: JSONObject) = post(id, payload)
    private fun event(id: String, payload: JSONObject) = post(id, payload)
    private fun fail(id: String, code: String, message: String) =
        post(id, JSONObject().put("error", code).put("message", message))

    private fun post(id: String, payload: JSONObject) {
        val js = "window.__nano && window.__nano(${JSONObject.quote(id)}, $payload);"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
