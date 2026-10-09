// Tests for targets/ischys-watch/SessionEnd.swift — ending a session once, and
// cleaning up one that never reports it ended. Run with: npm run test:watch
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

let t0 = Date(timeIntervalSince1970: 1_700_000_000)
func at(_ seconds: TimeInterval) -> Date { t0.addingTimeInterval(seconds) }

check("the first request ends the session") {
  var e = SessionEnd()
  return e.request(discard: false, now: t0) && e.isEnding
}

check("a second request does not end it again") {
  // Discard on the wrist, then the phone's echo of it a moment later.
  var e = SessionEnd()
  let first = e.request(discard: true, now: t0)
  let echo = e.request(discard: true, now: at(1.6))
  return first && !echo
}

check("a plain end saves") {
  var e = SessionEnd()
  _ = e.request(discard: false, now: t0)
  return e.settle() == .save
}

check("a discard throws the recording away") {
  var e = SessionEnd()
  _ = e.request(discard: true, now: t0)
  return e.settle() == .discard
}

check("a discard is not undone by a stop that arrives behind it") {
  var e = SessionEnd()
  _ = e.request(discard: true, now: t0)
  _ = e.request(discard: false, now: at(1))
  return e.settle() == .discard
}

check("a discard that follows an end still discards") {
  var e = SessionEnd()
  _ = e.request(discard: false, now: t0)
  _ = e.request(discard: true, now: at(1))
  return e.settle() == .discard
}

check("a session of a few seconds is not saved") {
  var e = SessionEnd()
  _ = e.request(discard: false, now: t0)
  return e.settle(tooShort: true) == .discard
}

check("an end HealthKit confirms in time never times out") {
  var e = SessionEnd()
  _ = e.request(discard: false, now: t0)
  let early = e.timedOut(now: at(2))
  _ = e.settle()
  return !early && !e.timedOut(now: at(60))
}

check("an end that is never confirmed times out") {
  var e = SessionEnd()
  _ = e.request(discard: true, now: t0)
  return !e.timedOut(now: at(SessionEnd.timeout - 0.1)) && e.timedOut(now: at(SessionEnd.timeout))
}

check("the timeout discards what was to be discarded, once") {
  var e = SessionEnd()
  _ = e.request(discard: true, now: t0)
  let cleaned = e.settle()
  // HealthKit's confirmation, turning up after all: nothing left to do, and
  // above all no second chance to save.
  let late = e.settle()
  return cleaned == .discard && late == nil && !e.isEnding
}

check("nothing can be asked of a session that has been dealt with") {
  var e = SessionEnd()
  _ = e.request(discard: false, now: t0)
  _ = e.settle()
  return !e.request(discard: true, now: at(10))
}

check("a session that was never asked to end does not time out") {
  SessionEnd().timedOut(now: at(1_000)) == false
}

check("a session ended without being asked is saved") {
  // HealthKit ended it on its own; the recording is kept, as before.
  var e = SessionEnd()
  return e.settle() == .save
}

check("a clock set back does not stretch the wait") {
  var e = SessionEnd()
  _ = e.request(discard: true, now: at(100))
  return e.timedOut(now: at(40))
}

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
print("all passed")
