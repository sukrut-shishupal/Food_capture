@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package com.meallens.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Meal Lens is a single web page (assets/index.html) shown in a WebView.
 * This activity serves that page, opens the camera or the photo picker when
 * the page asks for a photo, and sends outside links to the browser.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Serve bundled files from a real https origin so storage and fetch behave normally.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (_: ActivityNotFoundException) {
                    // No app can open this link; stay on the page.
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                val intent = if (params.isCaptureEnabled) cameraIntent() else galleryIntent()
                try {
                    startActivityForResult(intent, REQUEST_PHOTO)
                } catch (_: ActivityNotFoundException) {
                    // No camera app: fall back to the photo picker.
                    try {
                        startActivityForResult(galleryIntent(), REQUEST_PHOTO)
                    } catch (_: ActivityNotFoundException) {
                        filePathCallback?.onReceiveValue(null)
                        filePathCallback = null
                    }
                }
                return true
            }
        }

        clearOldPhotos()

        if (savedInstanceState != null) {
            cameraUri = savedInstanceState.getString(KEY_CAMERA_URI)?.let { Uri.parse(it) }
            webView.restoreState(savedInstanceState)
        }
        if (webView.url == null) {
            webView.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html")
        }
    }

    private fun cameraIntent(): Intent {
        val dir = File(cacheDir, "photos").apply { mkdirs() }
        val file = File(dir, "meal_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        cameraUri = uri
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    private fun galleryIntent(): Intent {
        cameraUri = null
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PHOTO) return

        val callback = filePathCallback
        filePathCallback = null
        val camera = cameraUri
        cameraUri = null
        val picked: Uri? = data?.data

        val result: Array<Uri>? = when {
            resultCode != RESULT_OK -> null
            picked != null -> arrayOf(picked)
            camera != null -> arrayOf(camera)
            else -> null
        }
        callback?.onReceiveValue(result)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
        cameraUri?.let { outState.putString(KEY_CAMERA_URI, it.toString()) }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** Camera shots are only needed until the page has read them; drop ones older than a day. */
    private fun clearOldPhotos() {
        val cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000
        File(cacheDir, "photos").listFiles()?.forEach { f ->
            if (f.lastModified() < cutoff) f.delete()
        }
    }

    companion object {
        private const val REQUEST_PHOTO = 41
        private const val KEY_CAMERA_URI = "camera_uri"
    }
}
