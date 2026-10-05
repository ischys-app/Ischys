import SwiftUI

/// Design tokens from `export/ischys-app/Apple Watch.dc.html`. Watch screens use
/// pure black (not the phone's `#0A0A0B`) to exploit the OLED and match the
/// native workout look.
enum Ischys {
  static func hex(_ v: UInt32) -> Color {
    Color(
      .sRGB,
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255,
      opacity: 1
    )
  }

  static let bg = Color.black
  static let surface1 = hex(0x111113)
  static let surface2 = hex(0x17171A)
  static let surface3 = hex(0x212127)
  static let border = hex(0x26262C)
  static let hair = hex(0x1D1D22)

  static let text1 = hex(0xF4F4F5)
  static let text2 = hex(0x97979E)
  static let text3 = hex(0x5B5B63)

  /// Set from the phone's pushed state; cached so the Watch starts in the
  /// right colour when the phone is out of reach.
  static var themeId: String? = UserDefaults.standard.string(forKey: "ischys.themeId") {
    didSet { UserDefaults.standard.set(themeId, forKey: "ischys.themeId") }
  }
  static var accent: Color { hex(IschysPalette.accent(themeId)) }
  static let accentFg = hex(0x0B0B0C)
  static let success = hex(0x2DD881)
  static let warning = hex(0xFFC24B)
  static let error = hex(0xFF4D4D)
  static let water = hex(0x4C8DFF)

  /// The design was drawn at a 322×394 reference; on a real 42mm screen it runs
  /// tight, so every text size is scaled down a notch here in one place.
  static let scale: CGFloat = 0.88

  /// Interface text. SF Pro rounded stands in for Space Grotesk on watchOS.
  static func ui(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
    .system(size: size * scale, weight: weight, design: .rounded)
  }

  /// All numbers, timers, metric labels. SF Mono stands in for JetBrains Mono;
  /// always monospaced-digit for tabular alignment.
  static func mono(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
    .system(size: size * scale, weight: weight, design: .monospaced)
  }

  /// A weight for the wrist: one decimal at most ("149.91" → "149.9", "225" →
  /// "225"). Display only — two decimals do not fit beside the unit at this
  /// size, and the value logged stays the exact string the phone sent.
  static func shortWeight(_ text: String) -> String {
    guard let v = Double(text.replacingOccurrences(of: ",", with: ".")) else { return text }
    let r = (v * 10).rounded() / 10
    return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
  }

  /// Seconds → "M:SS". Minutes run past 60 for long sessions, which is fine.
  static func clock(_ seconds: Int) -> String {
    String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
  }
}

/// Accent palettes, keyed by the same ids the app stores (#72).
///
/// Duplicated from `src/theme/palettes.ts` rather than shared, because these
/// are separate processes with no JS runtime. The ids are the contract; if a
/// palette is added there and not here, an unknown id falls back to Ember
/// rather than rendering no colour at all.
enum IschysPalette {
  static func accent(_ id: String?) -> UInt32 {
    switch id {
    case "volt": return 0xC6F135
    case "ion": return 0xC58BFF
    case "chalk": return 0xF4F4F5
    default: return 0xFF4A1C
    }
  }
  static let accentFg: UInt32 = 0x0B0B0C
}
