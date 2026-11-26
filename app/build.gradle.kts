import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "dev.canvas.launcher"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.canvas.launcher"
        minSdk = 26
        targetSdk = 36
        // CI passes the GitHub run number, so every release is a higher version than the last.
        val build = System.getenv("CANVAS_VERSION_CODE")?.toIntOrNull() ?: 1
        versionCode = build
        versionName = "1.0.$build"
    }

    // The permanent key (see /signing/README.md). Only used when the password is available.
    val signingPassword = System.getenv("CANVAS_KEY_PASSWORD")
    val keyFile = rootProject.file("signing/canvas-release.p12")
    val canvasKey = if (!signingPassword.isNullOrEmpty() && keyFile.exists()) {
        signingConfigs.create("canvas") {
            storeFile = keyFile
            storeType = "pkcs12"
            storePassword = signingPassword
            keyAlias = "canvas"
            keyPassword = signingPassword
        }
    } else null

    // "lite" installs straight from a phone. "full" adds notification badges and the
    // accessibility gestures, which Play Protect blocks when sideloaded from a browser.
    flavorDimensions += "features"
    productFlavors {
        create("lite") {
            dimension = "features"
            buildConfigField("boolean", "FULL_FEATURES", "false")
        }
        create("full") {
            dimension = "features"
            versionNameSuffix = "-full"
            buildConfigField("boolean", "FULL_FEATURES", "true")
        }
    }

    buildTypes {
        release {
            // Not minified: keeps release behaviour identical to what's been tested.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = canvasKey ?: signingConfigs.getByName("debug")
        }
        debug {
            if (canvasKey != null) signingConfig = canvasKey
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.08.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
