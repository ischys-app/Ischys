// Tests for targets/ischys-watch/WatchScreen.swift — which screen a pushed
// state names, and the rules that hang off the "off" screen (another profile
// is active on the phone). Run with: npm run test:watch
import Foundation

var failures = 0

func check(_ name: String, _ body: () -> Bool) {
  if body() {
    print("ok   \(name)")
  } else {
    print("FAIL \(name)")
    failures += 1
  }
}

check("off parses to the off screen") { WatchScreen(wire: "off") == .off }
check("the known screens still parse") {
  WatchScreen(wire: "session") == .session && WatchScreen(wire: "summary") == .summary
    && WatchScreen(wire: "start") == .start
}
check("a missing or unknown screen falls back to start") {
  WatchScreen(wire: nil) == .start && WatchScreen(wire: "bogus") == .start
}
check("no session may start while off") {
  !WatchScreen.off.allowsSession && WatchScreen.start.allowsSession
    && WatchScreen.session.allowsSession && WatchScreen.summary.allowsSession
}
check("the off title names the profile") {
  WatchScreen.offTitle(profileName: "Maria") == "Watch is off for Maria"
}
check("the off title falls back for a blank name") {
  WatchScreen.offTitle(profileName: "") == "Watch is off for this profile"
    && WatchScreen.offTitle(profileName: "   ") == "Watch is off for this profile"
}
check("a long name is kept whole") {
  WatchScreen.offTitle(profileName: "Konstantinopoulos").hasSuffix("Konstantinopoulos")
}

// Off state across launches (OffMemory)

func freshMemory() -> OffMemory {
  let suite = "ischys.tests.\(UUID().uuidString)"
  return OffMemory(defaults: UserDefaults(suiteName: suite)!)
}

check("with nothing remembered the Watch opens on start, sessions allowed") {
  let m = freshMemory()
  return m.offFor == nil && m.launchScreen == .start && m.launchScreen.allowsSession
}
check("an off push is remembered, so a relaunch opens off with no session") {
  let m = freshMemory()
  m.remember(screen: .off, profileName: "Maria")
  return m.offFor == "Maria" && m.launchScreen == .off && !m.launchScreen.allowsSession
}
check("off for a blank name still opens off") {
  let m = freshMemory()
  m.remember(screen: .off, profileName: "")
  return m.offFor == "" && m.launchScreen == .off
}
check("an on push forgets the off state") {
  let m = freshMemory()
  m.remember(screen: .off, profileName: "Maria")
  m.remember(screen: .start, profileName: "")
  return m.offFor == nil && m.launchScreen == .start
}
check("a session or summary push also counts as on") {
  let m = freshMemory()
  m.remember(screen: .off, profileName: "Maria")
  m.remember(screen: .session, profileName: "")
  let afterSession = m.offFor == nil
  m.remember(screen: .off, profileName: "Maria")
  m.remember(screen: .summary, profileName: "")
  return afterSession && m.offFor == nil
}

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
