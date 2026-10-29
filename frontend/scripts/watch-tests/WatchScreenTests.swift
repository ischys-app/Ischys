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

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
