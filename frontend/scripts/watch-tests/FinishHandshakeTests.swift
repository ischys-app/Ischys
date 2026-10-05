// Tests for targets/ischys-watch/FinishHandshake.swift — what the Watch does
// between Finish being tapped and the phone saying how the finish went (#95).
// Run with: npm run test:watch
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
let timeout = FinishHandshake.verdictTimeout

/// Finish tapped at t0 with the phone in reach: waiting on request "a".
func waiting() -> FinishHandshake {
  var h = FinishHandshake()
  _ = h.begin(id: "a", now: t0, phoneReachable: true)
  return h
}

// MARK: Finish tapped

check("Finish with the phone in reach asks and waits") {
  var h = FinishHandshake()
  return h.begin(id: "a", now: t0, phoneReachable: true) == .ask && h.isWaiting
}

check("Finish with the phone out of reach ends and saves at once") {
  // Nothing can answer, so there is nothing to wait for: no spinner.
  var h = FinishHandshake()
  return h.begin(id: "a", now: t0, phoneReachable: false) == .endNow && !h.isWaiting
}

check("a second Finish while waiting does nothing") {
  var h = waiting()
  return h.begin(id: "b", now: at(1), phoneReachable: true) == .ignore
    // And the first request is still the one being waited on.
    && h.verdict(.finished, id: "b") == .none
    && h.verdict(.finished, id: "a") == .endAndSave
}

check("a second Finish while waiting does not push the deadline back") {
  var h = waiting()
  _ = h.begin(id: "b", now: at(timeout - 1), phoneReachable: true)
  return h.poll(now: at(timeout)) == .endAndSave
}

// MARK: The phone's answer

check("finished: end the session and save") {
  var h = waiting()
  return h.verdict(.finished, id: "a") == .endAndSave && !h.isWaiting
}

check("failed: keep recording") {
  var h = waiting()
  return h.verdict(.failed, id: "a") == .keepRecording && !h.isWaiting
}

check("an answer arriving twice acts once") {
  var done = waiting()
  var failed = waiting()
  return done.verdict(.finished, id: "a") == .endAndSave
    && done.verdict(.finished, id: "a") == .none
    && failed.verdict(.failed, id: "a") == .keepRecording
    && failed.verdict(.failed, id: "a") == .none
}

check("an answer to a different request is ignored") {
  // A stale answer from an earlier attempt, delivered late.
  var h = waiting()
  return h.verdict(.finished, id: "old") == .none
    && h.verdict(.failed, id: "old") == .none
    && h.isWaiting
}

check("an answer with nothing waiting is ignored") {
  var h = FinishHandshake()
  return h.verdict(.finished, id: "a") == .none && h.verdict(.failed, id: "a") == .none
}

check("after a failed finish, Finish can be asked again") {
  var h = waiting()
  _ = h.verdict(.failed, id: "a")
  return h.begin(id: "b", now: at(30), phoneReachable: true) == .ask
    // The first attempt's answer arriving again must not fail the second.
    && h.verdict(.failed, id: "a") == .none
    && h.verdict(.finished, id: "b") == .endAndSave
}

check("only 'finished' and 'failed' are answers") {
  return FinishHandshake.Verdict(rawValue: "finished") == .finished
    && FinishHandshake.Verdict(rawValue: "failed") == .failed
    && FinishHandshake.Verdict(rawValue: "") == nil
    && FinishHandshake.Verdict(rawValue: "stop") == nil
}

// MARK: No answer

check("stays waiting until the deadline") {
  var h = waiting()
  return h.poll(now: at(1)) == .none && h.poll(now: at(timeout - 0.1)) == .none && h.isWaiting
}

check("no answer by the deadline: end the session and save") {
  var h = waiting()
  return h.poll(now: at(timeout)) == .endAndSave && !h.isWaiting
}

check("the timeout fires once") {
  var h = waiting()
  _ = h.poll(now: at(timeout))
  return h.poll(now: at(timeout + 1)) == .none
}

check("the deadline is exposed for the caller's timer") {
  let h = waiting()
  return h.deadline == at(timeout) && FinishHandshake().deadline == nil
}

check("an answer after the timeout is ignored") {
  // The recording is saved by then. A late 'failed' must not claim it is
  // still running, and a late 'finished' must not end anything twice.
  var late = waiting()
  _ = late.poll(now: at(timeout))
  var lateFail = waiting()
  _ = lateFail.poll(now: at(timeout))
  return late.verdict(.finished, id: "a") == .none && lateFail.verdict(.failed, id: "a") == .none
}

check("a timer tick with nothing waiting does nothing") {
  var h = FinishHandshake()
  return h.poll(now: at(1000)) == .none
}

// MARK: The request could not be sent

check("a request that could not be delivered: end, save, and queue the request") {
  var h = waiting()
  return h.undeliverable(id: "a") == .endAndQueueRequest && !h.isWaiting
}

check("a delivery failure for another request is ignored") {
  var h = waiting()
  return h.undeliverable(id: "old") == .none && h.isWaiting
}

check("a delivery failure after the answer is ignored") {
  var h = waiting()
  _ = h.verdict(.failed, id: "a")
  return h.undeliverable(id: "a") == .none
}

check("a delivery failure after the timeout queues the request") {
  // Reachability was stale as the phone went out of range, and the error came
  // back after the Watch had given up, ended and saved. The phone never heard
  // of the finish, so the request is queued. Nothing is ended twice.
  var h = waiting()
  _ = h.poll(now: at(timeout))
  return h.undeliverable(id: "a") == .queueRequest && !h.isWaiting
}

check("a delivery failure after the timeout queues the request once") {
  var h = waiting()
  _ = h.poll(now: at(timeout))
  _ = h.undeliverable(id: "a")
  return h.undeliverable(id: "a") == .none
}

check("the session ending after the timeout does not forget the request") {
  // Giving up ends the session, and the session ending settles the handshake
  // (`cancel`). The delivery failure arrives after both.
  var h = waiting()
  _ = h.poll(now: at(timeout))
  h.cancel()
  return h.undeliverable(id: "a") == .queueRequest
}

check("a delivery failure after the timeout for another request is ignored") {
  var h = waiting()
  _ = h.poll(now: at(timeout))
  return h.undeliverable(id: "old") == .none
    // And the one given up on is still remembered.
    && h.undeliverable(id: "a") == .queueRequest
}

check("an answer after the timeout means the request was delivered") {
  // The phone answered, late: it has the request. A delivery failure reported
  // for it afterwards must not queue a second one.
  var h = waiting()
  _ = h.poll(now: at(timeout))
  return h.verdict(.finished, id: "a") == .none && h.undeliverable(id: "a") == .none
}

check("a request that was answered in time is not queued by a late failure") {
  var h = waiting()
  _ = h.verdict(.finished, id: "a")
  return h.undeliverable(id: "a") == .none
}

// MARK: The session ended some other way

check("the phone ending the workout settles the wait") {
  // Finish or Discard tapped on the phone while the Watch was waiting.
  var h = waiting()
  h.cancel()
  return !h.isWaiting
    && h.poll(now: at(timeout)) == .none
    && h.verdict(.finished, id: "a") == .none
    && h.verdict(.failed, id: "a") == .none
}

check("begin after cancel") {
  // The next workout's Finish, after the phone closed the last one mid-wait.
  var h = waiting()
  h.cancel()
  return h.begin(id: "b", now: at(60), phoneReachable: true) == .ask
    && h.isWaiting
    && h.deadline == at(60 + timeout)
    // The cancelled request is gone for good: nothing about it acts.
    && h.verdict(.finished, id: "a") == .none
    && h.undeliverable(id: "a") == .none
    && h.verdict(.finished, id: "b") == .endAndSave
}

check("a new request forgets the one given up on") {
  // Its delivery failure, arriving during the next workout's finish, must not
  // queue a finish that would land on that workout.
  var h = waiting()
  _ = h.poll(now: at(timeout))
  h.cancel()
  _ = h.begin(id: "b", now: at(600), phoneReachable: true)
  return h.undeliverable(id: "a") == .none && h.isWaiting
}

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
print("all passed")
