/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch",
  name: "ischys-watch",
  displayName: "Ischys",
  // Watch app icon (generated into the target's AppIcon set). Path is relative to
  // this target directory; reuse the main app icon so the watch matches the phone.
  icon: "../../assets/icon.png",
  // Resolves to app.ischys.mobile.watch; WKCompanionAppBundleIdentifier is set
  // to the main app automatically by the tooling.
  bundleIdentifier: ".watch",
  deploymentTarget: "10.0",
  frameworks: ["SwiftUI", "HealthKit", "WatchConnectivity"],
  entitlements: {
    "com.apple.developer.healthkit": true,
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
