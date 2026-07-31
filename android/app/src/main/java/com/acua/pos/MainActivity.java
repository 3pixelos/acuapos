package com.acua.pos;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen native wrapper around the Acua POS web app. Exists because
 * the old staff phones run Chrome versions too old to offer the PWA
 * "Add to Home screen" install — a plain APK installs on anything >= 5.0.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "https://acua-pos.vercel.app";

    private WebView webView;

    /** Set when the user actually LEFT the app (home button, app switch) —
     * not when the screen merely timed out. Returning then forces a fresh
     * page load, which lands on the login screen because the web app keeps
     * its session in memory only. The staff share two phones, so handing
     * a phone over must always require the next person's PIN. */
    private boolean loggedOutInBackground = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        // localStorage — the POS keeps its Supabase login session there;
        // without this every app restart would land on the login screen.
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Lay the page out like a mobile browser would.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);

        webView.setWebViewClient(new WebViewClient() {
            // http/https stay inside the app; anything else (tel:, mailto:)
            // is handed to the system.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override // pre-API-24 phones call this variant instead
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        });

        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Screen timeout / power button also stop the Activity, but the
        // waiter is still holding the phone — don't sign them out for that.
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isInteractive()) return;
        loggedOutInBackground = true;
        // Fire the web app's own logout beacon (bound to pagehide) so the
        // seat frees on the server immediately, not after the heartbeat.
        webView.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (loggedOutInBackground) {
            loggedOutInBackground = false;
            webView.loadUrl(APP_URL); // fresh load -> login screen
        }
    }

    private boolean handleUrl(String url) {
        if (url.startsWith("http://") || url.startsWith("https://")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
            // no app handles the scheme — just stay where we are
        }
        return true;
    }

    /** Back navigates the web history; only exits when there is none left. */
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

}
