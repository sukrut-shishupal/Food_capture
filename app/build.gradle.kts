plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.meallens.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.meallens.app"
        // ML Kit GenAI (Gemini Nano) needs API 26+; the model itself only runs on supported phones.
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "2.0"
    }

    // A fixed test key, so every new build installs over the previous one
    // and your meal log survives updates. Fine for personal testing only;
    // make a private key before ever publishing to the Play Store.
    signingConfigs {
        create("test") {
            storeFile = rootProject.file("meallens-test.jks")
            storePassword = "meallens"
            keyAlias = "meallens"
            keyPassword = "meallens"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("test")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("test")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
