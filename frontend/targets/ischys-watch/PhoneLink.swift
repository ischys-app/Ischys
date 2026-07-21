import Foundation
import WatchConnectivity

/// The workout state the phone pushes to the Watch. The phone serialises the
/// exact same shape (see frontend/src/lib/watchBridge.ts).
///
/// Decoded leniently: any missing field falls back, so a partial push never
/// throws and blanks the screen.
struct PhoneState {
  var screen: WatchScreen = .start
  var routines: [RoutineItem] = []
  var routineName = ""
  var exerciseName = ""
  var equipment = ""
  var setNum = 1
  var setCount = 1
  var weight = ""
  var reps = ""
  var prevWeight = ""
  var prevReps = ""
  var setDots: [SetDot] = []
  var resting = false
  var restRemaining = 0
  var restTotal = 0
  var nextSetLabel = ""
  var volumeKg = 0
  var setsDone = 0
  var setsTotal = 0
  var summary: SessionSummary?

  init(from d: [String: Any]) {
    switch d["screen"] as? String {
    case "session": screen = .session
    case "summary": screen = .summary
    default: screen = .start
    }
    if let rs = d["routines"] as? [[String: Any]] {
      routines = rs.map {
        RoutineItem(
          id: $0["id"] as? String ?? "",
          name: $0["name"] as? String ?? "",
          initials: $0["initials"] as? String ?? "",
          exerciseCount: $0["exerciseCount"] as? Int ?? 0
        )
      }
    }
    routineName = d["routineName"] as? String ?? ""
    exerciseName = d["exerciseName"] as? String ?? ""
    equipment = d["equipment"] as? String ?? ""
    setNum = d["setNum"] as? Int ?? 1
    setCount = d["setCount"] as? Int ?? 1
    weight = d["weight"] as? String ?? ""
    reps = d["reps"] as? String ?? ""
    prevWeight = d["prevWeight"] as? String ?? ""
    prevReps = d["prevReps"] as? String ?? ""
    setDots = (d["setDots"] as? [String] ?? []).map {
      switch $0 {
      case "done": return .done
      case "active": return .active
      default: return .pending
      }
    }
    resting = d["resting"] as? Bool ?? false
    restRemaining = d["restRemaining"] as? Int ?? 0
    restTotal = d["restTotal"] as? Int ?? 0
    nextSetLabel = d["nextSetLabel"] as? String ?? ""
    volumeKg = d["volumeKg"] as? Int ?? 0
    setsDone = d["setsDone"] as? Int ?? 0
    setsTotal = d["setsTotal"] as? Int ?? 0
    if let s = d["summary"] as? [String: Any] {
      summary = SessionSummary(
        routineName: s["routineName"] as? String ?? "",
        dateLabel: s["dateLabel"] as? String ?? "",
        timeLabel: s["timeLabel"] as? String ?? "",
        volumeKg: s["volumeKg"] as? Int ?? 0,
        sets: s["sets"] as? Int ?? 0,
        avgHr: s["avgHr"] as? Int ?? 0,
        activeCal: s["activeCal"] as? Int ?? 0,
        prs: s["prs"] as? Int ?? 0
      )
    }
  }
}

/// The Watch's single WCSession owner. Receives state from the phone; sends the
/// user's actions and live metrics back. Metrics never travel any other way —
/// HR/energy are pushed here so the phone's header chip is real-time rather than
/// waiting on HealthKit sync.
final class PhoneLink: NSObject, WCSessionDelegate {
  static let shared = PhoneLink()

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  // MARK: Watch → phone

  private func send(_ payload: [String: Any]) {
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    if s.isReachable {
      s.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    } else {
      // Queued, delivered when the phone next runs. Fine for discrete actions.
      s.transferUserInfo(payload)
    }
  }

  func logSet(weight: String, reps: String) {
    send(["action": "logSet", "weight": weight, "reps": reps])
  }
  func adjustRest(_ seconds: Int) { send(["action": "adjustRest", "seconds": seconds]) }
  func skipRest() { send(["action": "skipRest"]) }
  func endWorkout() { send(["action": "end"]) }
  func discardWorkout() { send(["action": "discard"]) }
  func addSet() { send(["action": "addSet"]) }
  func startEmpty() { send(["action": "startEmpty"]) }
  func startRoutine(_ id: String) { send(["action": "startRoutine", "routineId": id]) }
  /// Ask the phone to (re)push the current workout state — closes the race where
  /// our session screen appears before the phone's first state push lands, which
  /// left the Watch showing empty defaults (0 reps, set 1 of 1).
  func requestState() { send(["action": "requestState"]) }
  /// Confirms the Watch saved this session as an HKWorkout, so the phone won't
  /// write a duplicate. The phone reads the absence of this (a timeout) as "the
  /// Watch didn't save" and writes the workout itself — no finished workout lost.
  func workoutSaved() { send(["action": "workoutSaved"]) }

  /// Live sensor metrics, pushed frequently. Sent live when the phone app is
  /// reachable; otherwise coalesced into the application context so the newest HR
  /// lands the moment the phone app is frontmost again — without this the phone's
  /// pulse froze whenever the wrist dropped and the Watch app backgrounded.
  func sendMetrics(hr: Int, activeCal: Int) {
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    let payload: [String: Any] = ["metrics": true, "hr": hr, "cal": activeCal]
    if s.isReachable {
      s.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    } else {
      try? s.updateApplicationContext(payload)
    }
  }

  // MARK: Phone → watch

  private func receive(_ context: [String: Any]) {
    let state = PhoneState(from: context)
    Task { @MainActor in WorkoutModel.shared.apply(state) }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  // Latest full state — the phone coalesces rapid updates into this.
  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    receive(context)
  }

  // A one-off push (e.g. immediately after launch, before context settles), or a
  // command from the phone ending the session on the user's behalf.
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if handleCommand(message) { return }
    receive(message)
  }

  // A queued delivery from the phone — an end/discard command sent while the Watch
  // was unreachable. transferUserInfo lands here FIFO once the app runs, so a phone
  // that ended the workout still ends our session even if it wasn't reachable then.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    if handleCommand(userInfo) { return }
    receive(userInfo)
  }

  // The phone ends the Watch session when the user finishes/discards there. Save
  // on a plain stop; throw away on a discard so nothing reaches Health.
  private func handleCommand(_ message: [String: Any]) -> Bool {
    guard let cmd = message["cmd"] as? String else { return false }
    DispatchQueue.main.async {
      switch cmd {
      case "discard": WorkoutManager.shared.discard()
      default: WorkoutManager.shared.end()
      }
    }
    return true
  }
}
