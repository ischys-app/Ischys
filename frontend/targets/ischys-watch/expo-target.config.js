/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch",
  name: "ischys-watch",
  displayName: "Ischys",
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
