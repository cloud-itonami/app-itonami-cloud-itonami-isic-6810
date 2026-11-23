import java.util.Properties
import org.gradle.api.GradleException
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 37
    ndkVersion = "27.0.12077973"
    namespace = "network.itonami.registry"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "network.itonami.registry"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("AWAI_KEYSTORE_PATH")
            val keystorePassword = System.getenv("AWAI_KEYSTORE_PASSWORD")
            val keyAliasName = System.getenv("AWAI_KEY_ALIAS")
            val keyPasswordValue = System.getenv("AWAI_KEY_PASSWORD")
            val missing = buildList {
                if (keystorePath.isNullOrBlank()) add("AWAI_KEYSTORE_PATH")
                if (keystorePassword.isNullOrBlank()) add("AWAI_KEYSTORE_PASSWORD")
                if (keyAliasName.isNullOrBlank()) add("AWAI_KEY_ALIAS")
                if (keyPasswordValue.isNullOrBlank()) add("AWAI_KEY_PASSWORD")
            }
            if (missing.isNotEmpty()) {
                val isReleaseTask = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
                if (isReleaseTask) {
                    throw GradleException("signing env not set: missing ${missing.joinToString(", ")} -- release signing requires AWAI_KEYSTORE_PATH, AWAI_KEYSTORE_PASSWORD, AWAI_KEY_ALIAS, AWAI_KEY_PASSWORD (debug build stays as-is)")
                }
                // Non-release tasks (debug, help) must still resolve without signing env;
                // leave the release config unpopulated, it is never used for debug signing.
            } else {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = keyAliasName
                keyPassword = keyPasswordValue
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
