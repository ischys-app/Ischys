import groovy.json.JsonSlurper

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

// The version comes from the phone's app.json, so the two cannot drift. Google
// Play wants every artifact of one package to have its own versionCode; the
// Watch's is the phone's plus this offset.
val wearVersionCodeOffset = 1_000_000

@Suppress("UNCHECKED_CAST")
val expo = (JsonSlurper().parse(rootProject.file("../app.json")) as Map<String, Any>)["expo"] as Map<String, Any>
val phoneVersionName = expo["version"] as String
val phoneVersionCode = ((expo["android"] as Map<String, Any>)["versionCode"] as Number).toInt()

// The upload key reaches Gradle the way it does for the phone: as project
// properties, never written into the project (see ../scripts/gradleRelease.js).
// Without them the release build is signed with the debug key.
val hasUploadKey = project.hasProperty("ISCHYS_UPLOAD_STORE_FILE")

android {
  namespace = "app.ischys.wear"
  compileSdk = 36

  defaultConfig {
    // The phone app's id. The Data Layer only connects apps that share one.
    applicationId = "app.ischys.mobile"
    minSdk = 30
    targetSdk = 36
    versionCode = wearVersionCodeOffset + phoneVersionCode
    versionName = phoneVersionName
  }

  signingConfigs {
    create("release") {
      if (hasUploadKey) {
        storeFile = file(project.property("ISCHYS_UPLOAD_STORE_FILE") as String)
        storePassword = project.property("ISCHYS_UPLOAD_STORE_PASSWORD") as String
        keyAlias = project.property("ISCHYS_UPLOAD_KEY_ALIAS") as String
        keyPassword = project.property("ISCHYS_UPLOAD_KEY_PASSWORD") as String
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = if (hasUploadKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions {
    unitTests.isReturnDefaultValues = true
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.activity:activity-compose:1.10.1")
  implementation("androidx.compose.ui:ui:1.8.3")
  implementation("androidx.compose.foundation:foundation:1.8.3")
  implementation("androidx.wear.compose:compose-foundation:1.5.6")
  implementation("androidx.wear.compose:compose-material3:1.5.6")

  // Heart rate and calories for the running session.
  implementation("androidx.health:health-services-client:1.1.0")
  // The phone link.
  implementation("com.google.android.gms:play-services-wearable:19.0.0")
  // The session's entry on the watch face and in Recents.
  implementation("androidx.wear:wear-ongoing:1.1.0")
  // Phone notifications are not bridged while this app buzzes for a rest itself.
  implementation("androidx.wear:wear-phone-interactions:1.1.0")

  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")

  constraints {
    // Google Play services still asks for a Fragment from before the activity
    // result API, which the permission request in MainActivity uses.
    implementation("androidx.fragment:fragment:1.8.6")
  }

  testImplementation("junit:junit:4.13.2")
  // android.jar's org.json is stubs on the JVM; the logic under test parses with it.
  testImplementation("org.json:json:20240303")
}
