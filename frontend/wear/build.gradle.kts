// The Wear OS companion. A standalone Gradle project: it shares nothing with
// the generated phone project in ../android except the applicationId and the
// signing key, both of which the Wearable Data Layer requires to match.
//
// Plugin versions follow the phone build (React Native's version catalog), so
// one Gradle cache serves both.
plugins {
  id("com.android.application") version "8.12.0" apply false
  id("org.jetbrains.kotlin.android") version "2.1.20" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.1.20" apply false
}
