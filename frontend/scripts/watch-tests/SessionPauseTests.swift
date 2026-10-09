// Tests for targets/ischys-watch/SessionPause.swift — the Pause / Resume
// button on the Watch's Controls page. Run with: npm run test:watch
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

check("a running session offers Pause") {
  SessionPause().toggle == .pause
}

check("a paused session offers Resume") {
  // The bug: it went on offering Pause, and nothing ever resumed.
  var p = SessionPause()
  p.sessionChanged(paused: true)
  return p.paused && p.toggle == .resume
}

check("resumed, it offers Pause again") {
  var p = SessionPause()
  p.sessionChanged(paused: true)
  p.sessionChanged(paused: false)
  return !p.paused && p.toggle == .pause
}

check("the button follows the session, not the tap") {
  // Tapping changes nothing here: until HealthKit reports the pause, the
  // session is still measuring and the button still says Pause.
  let p = SessionPause()
  return p.toggle == .pause
}

check("a set logged while paused resumes the session") {
  var p = SessionPause()
  p.sessionChanged(paused: true)
  return p.resumesOnSets(from: 3, to: 4)
}

check("a set logged while running changes nothing") {
  SessionPause().resumesOnSets(from: 3, to: 4) == false
}

check("a set unticked while paused does not resume") {
  var p = SessionPause()
  p.sessionChanged(paused: true)
  return !p.resumesOnSets(from: 4, to: 3) && !p.resumesOnSets(from: 4, to: 4)
}

check("a new session starts unpaused") {
  var p = SessionPause()
  p.sessionChanged(paused: true)
  p.reset()
  return !p.paused && p.toggle == .pause
}

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
print("all passed")
