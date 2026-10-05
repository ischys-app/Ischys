// Tests for targets/ischys-watch/RestAlarm.swift — the rule for when the wrist
// buzzes at the end of a rest. Run with: npm run test:watch
//
// The Watch target cannot be exercised without a device, but this one file is
// plain Foundation, so it is compiled for the Mac together with these checks.
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

/// A rest armed at t0 that ends 90 s later, alerts on.
func armed() -> RestAlarm {
  var a = RestAlarm()
  _ = a.update(resting: true, endsAt: at(90), alertsOn: true, now: t0)
  return a
}

check("stays quiet while the rest is running") {
  var a = RestAlarm()
  let onPush = a.update(resting: true, endsAt: at(90), alertsOn: true, now: t0)
  return !onPush && !a.poll(now: at(45)) && !a.poll(now: at(89.9))
}

check("buzzes when the end date passes") {
  var a = armed()
  return a.poll(now: at(90))
}

check("buzzes once: later ticks stay quiet") {
  var a = armed()
  _ = a.poll(now: at(90))
  return !a.poll(now: at(91)) && !a.poll(now: at(92))
}

check("a repeated push of the same rest does not buzz again") {
  // The phone pushes every second, and its last 'still resting' push can land
  // after our timer has already fired.
  var a = armed()
  _ = a.poll(now: at(90))
  return !a.update(resting: true, endsAt: at(90), alertsOn: true, now: at(90.2))
    && !a.poll(now: at(91))
}

check("repeated pushes before the end do not buzz or disarm") {
  var a = armed()
  for s in stride(from: 1.0, through: 89.0, by: 1.0) {
    if a.update(resting: true, endsAt: at(90), alertsOn: true, now: at(s)) { return false }
  }
  return a.poll(now: at(90))
}

check("a skipped rest never buzzes") {
  var a = armed()
  let onSkip = a.update(resting: false, endsAt: nil, alertsOn: true, now: at(30))
  return !onSkip && !a.poll(now: at(90)) && !a.poll(now: at(95))
}

check("an extended rest buzzes at the new end, not the old one") {
  var a = armed()
  _ = a.update(resting: true, endsAt: at(105), alertsOn: true, now: at(60))
  return !a.poll(now: at(90)) && a.poll(now: at(105)) && !a.poll(now: at(106))
}

check("a shortened rest buzzes at the new end and not again at the old one") {
  var a = armed()
  _ = a.update(resting: true, endsAt: at(75), alertsOn: true, now: at(40))
  return !a.poll(now: at(74)) && a.poll(now: at(75)) && !a.poll(now: at(90))
}

check("a rest trimmed to nothing is a skip, not a completion") {
  // -15 with under 15 s left: the phone reports the rest over, well before the
  // end date we were armed for.
  var a = armed()
  return !a.update(resting: false, endsAt: nil, alertsOn: true, now: at(80))
    && !a.poll(now: at(90))
}

check("alerts off: no buzz") {
  var a = RestAlarm()
  _ = a.update(resting: true, endsAt: at(90), alertsOn: false, now: t0)
  return !a.poll(now: at(90))
    && !a.update(resting: false, endsAt: nil, alertsOn: false, now: at(90.5))
}

check("alerts switched off mid-rest disarm it") {
  var a = armed()
  _ = a.update(resting: true, endsAt: at(90), alertsOn: false, now: at(30))
  return !a.poll(now: at(90))
}

check("the phone reporting the end just ahead of our timer still buzzes, once") {
  // Phone clock a little ahead of the Watch's: 'rest over' lands first.
  var a = armed()
  let onPush = a.update(resting: false, endsAt: nil, alertsOn: true, now: at(89.7))
  return onPush && !a.poll(now: at(90)) && !a.poll(now: at(91))
}

check("'rest over' after we buzzed does not buzz again") {
  var a = armed()
  _ = a.poll(now: at(90))
  return !a.update(resting: false, endsAt: nil, alertsOn: true, now: at(90.6))
}

check("a new rest after one that finished buzzes on its own end") {
  var a = armed()
  _ = a.poll(now: at(90))
  _ = a.update(resting: false, endsAt: nil, alertsOn: true, now: at(91))
  _ = a.update(resting: true, endsAt: at(300), alertsOn: true, now: at(200))
  return !a.poll(now: at(299)) && a.poll(now: at(300))
}

check("a rest learned of moments after it ended still buzzes") {
  var a = RestAlarm()
  return a.update(resting: true, endsAt: at(90), alertsOn: true, now: at(92))
}

check("a rest that ended long ago does not buzz late") {
  // A stale state delivered when the app next runs.
  var a = RestAlarm()
  let onPush = a.update(resting: true, endsAt: at(90), alertsOn: true, now: at(300))
  return !onPush && !a.poll(now: at(301))
}

check("a timer that was held back too long does not buzz late") {
  var a = armed()
  return !a.poll(now: at(120)) && !a.poll(now: at(121))
}

check("cancel drops the pending buzz") {
  var a = armed()
  a.cancel()
  return !a.poll(now: at(90))
}

check("claims the forwarded notification while armed and just after buzzing") {
  var a = armed()
  let whileArmed = a.owns(now: at(89))
  _ = a.poll(now: at(90))
  return whileArmed && a.owns(now: at(91)) && !a.owns(now: at(120))
}

check("does not claim the notification when it never buzzed") {
  var off = RestAlarm()
  _ = off.update(resting: true, endsAt: at(90), alertsOn: false, now: t0)
  var skipped = armed()
  _ = skipped.update(resting: false, endsAt: nil, alertsOn: true, now: at(30))
  return !RestAlarm().owns(now: t0) && !off.owns(now: at(90)) && !skipped.owns(now: at(90))
}

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
print("all passed")
