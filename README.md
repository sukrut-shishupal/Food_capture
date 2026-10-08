# Meal Lens (Android)

Snap a photo of a meal and Meal Lens estimates protein, calories, carbs and fat with Claude. It keeps a daily log, protein and calorie goals, and a 7-day protein chart, all stored on the phone.

## Get the APK

**Option A: GitHub (no tools needed)**
1. Push this folder to a GitHub repository (a private repo is best).
2. The **Build APK** workflow runs on every push to `main` (or run it by hand from the Actions tab).
3. When it finishes, open the repo's **Releases** page on your phone and tap `MealLens.apk`.

**Option B: Android Studio**
1. Open this folder in Android Studio and let it sync.
2. Choose **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
3. The file lands in `app/build/outputs/apk/debug/app-debug.apk`. Copy it to your phone.

## Install on the phone
1. Open the downloaded APK. Android asks to allow installs from that app (Chrome or Files). Allow it once.
2. Tap **Install**. Play Protect may warn that the app is from an unknown developer; choose **Install anyway**.

## First run
Meal Lens needs an Anthropic API key:
1. Go to https://console.anthropic.com, sign in, and add credit under Billing.
2. Create an API key.
3. In the app, open **Settings**, paste the key, tap **Test key**, then **Save**.

Each photo estimate is billed to that key. You can set a spending limit in the console.

## How it's built
- `app/src/main/assets/index.html` and `app.js`: the whole app UI and logic.
- `MainActivity.kt`: a WebView that serves those files, opens the camera or photo picker, and sends outside links to the browser.
- The API key and meal log live in the app's private storage on the phone. Uninstalling deletes them.

## Signing
`meallens-test.jks` is a test signing key (password `meallens`) so each new build installs over the last one without losing your log. It is fine for personal testing. Create a private key before publishing anywhere.
