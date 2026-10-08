# Meal Lens (Android)

Snap a photo of a meal and Meal Lens estimates protein, calories, carbs and fat **on your phone**, using the Gemini Nano model built into supported Android phones. No API key, no server, no per-photo cost, and it works offline once the model is on the phone.

It keeps a daily log, protein and calorie goals, and a 7-day protein chart, all stored on the phone.

## How the numbers are worked out
1. Gemini Nano looks at the photo and lists each food with its estimated weight in grams.
2. For common foods, Meal Lens takes protein, calories, carbs and fat per 100 g from a built-in nutrition table (`app/src/main/assets/nutrition.js`, about 140 foods including common Indian dishes) and scales them by the weight.
3. Foods not in the table keep the model's own estimate and are labelled "AI estimate".
You can nudge any portion up or down before adding the meal.

## Which phones work
Gemini Nano through ML Kit's Prompt API (beta) runs on supported phones only, such as the Pixel 9, 10 and 11 series and recent flagship Samsung, OnePlus, Xiaomi, OPPO and vivo models. See https://developers.google.com/ml-kit/genai for the current list. On other phones the app still works for typing in numbers by hand.

## Get the APK

**Option A: GitHub (no tools needed)**
1. Push this folder to a GitHub repository (a private repo is best).
2. The **Build APK** workflow runs on every push to `main` (or run it by hand from the Actions tab).
3. When it finishes, open the repo's **Releases** page on your phone and tap `MealLens.apk`.

**Option B: Android Studio**
1. Open this folder in Android Studio and let it sync.
2. Choose **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
3. The file lands in `app/build/outputs/apk/debug/app-debug.apk`. Copy it to your phone.

## Install and first run
1. Open the downloaded APK. Allow installs from Chrome or Files when Android asks, and choose **Install anyway** if Play Protect warns.
2. Open Meal Lens. If the model isn't on the phone yet, tap **Download the model** (one time, Wi-Fi recommended).
3. If it says the model isn't available, install the latest system update and update **Google Play services** and **AICore** from the Play Store, restart, and tap **Check again**.

## How it's built
- `app/src/main/assets/`: the app UI and logic (`index.html`, `app.js`) and the nutrition table (`nutrition.js`).
- `MainActivity.kt`: a WebView that serves those files, opens the camera or photo picker, and sends outside links to the browser.
- `NanoBridge.kt`: connects the page to Gemini Nano through ML Kit GenAI (`com.google.mlkit:genai-prompt`).

## Signing
`meallens-test.jks` is a test signing key (password `meallens`) so each new build installs over the last one without losing your log. Fine for personal testing; create a private key before publishing anywhere.
