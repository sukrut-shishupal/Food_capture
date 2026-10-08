plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.meallens.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.meallens.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
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
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
}
