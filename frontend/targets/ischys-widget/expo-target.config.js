/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "ischys-widget",
  displayName: "Ischys",
  // Resolves to app.ischys.mobile.widget
  bundleIdentifier: ".widget",
  // ActivityKit needs 16.1, but interactive App Intents in a widget need 17.0.
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
