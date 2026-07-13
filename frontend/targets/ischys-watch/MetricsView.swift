import SwiftUI

/// S4 — Metrics. A read-only glance at the live workout, mirroring Apple's native
/// workout metrics screen: the one place we intentionally use several semantic
/// colours at once (HR red, calories amber, sets green) rather than the usual
/// accent-only restraint. Numbers are `Ischys.mono` + `.monospacedDigit()`; the
/// elapsed clock keeps the accent, as everywhere else.
struct MetricsView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    ScrollView {
      VStack(spacing: 14) {
        Text(model.routineName)
          .font(Ischys.mono(13))
          .foregroundStyle(Ischys.text2)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .frame(maxWidth: .infinity)

        elapsedBlock

        LazyVGrid(
          columns: [GridItem(.flexible()), GridItem(.flexible())],
          spacing: 8
        ) {
          statCard(label: "HEART RATE", color: Ischys.error) {
            HStack(alignment: .lastTextBaseline, spacing: 3) {
              Text("\(model.heartRate)")
                .font(Ischys.mono(26, .semibold)).monospacedDigit()
                .foregroundStyle(Ischys.error)
              Text("bpm")
                .font(Ischys.ui(11)).foregroundStyle(Ischys.text2)
            }
          }
          statCard(label: "ACTIVE CAL", color: Ischys.warning) {
            Text("\(model.activeCal)")
              .font(Ischys.mono(26, .semibold)).monospacedDigit()
              .foregroundStyle(Ischys.warning)
          }
          statCard(label: "VOLUME", color: Ischys.text1) {
            Text("\(fmtVolume(model.volumeKg)) kg")
              .font(Ischys.mono(26, .semibold)).monospacedDigit()
              .foregroundStyle(Ischys.text1)
          }
          statCard(label: "SETS", color: Ischys.success) {
            Text("\(model.setsDone) / \(model.setsTotal)")
              .font(Ischys.mono(26, .semibold)).monospacedDigit()
              .foregroundStyle(Ischys.success)
          }
        }
      }
      .padding(.top, 2)
    }
  }

  private var elapsedBlock: some View {
    VStack(spacing: 2) {
      Text("ELAPSED")
        .font(Ischys.mono(10))
        .tracking(1.8)
        .foregroundStyle(Ischys.text3)
      Text(Ischys.clock(model.elapsedSec))
        .font(Ischys.mono(56, .semibold))
        .monospacedDigit()
        .foregroundStyle(Ischys.accent)
    }
    .frame(maxWidth: .infinity)
  }

  /// A single metric tile: leading label over a big value, on a bordered surface.
  private func statCard<Value: View>(
    label: String,
    color: Color,
    @ViewBuilder value: () -> Value
  ) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(Ischys.mono(9.5))
        .tracking(1.2)
        .foregroundStyle(Ischys.text3)
      value()
    }
    .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
    .padding(10)
    .background(
      RoundedRectangle(cornerRadius: 18).fill(Ischys.surface1)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 18).stroke(Ischys.border, lineWidth: 1)
    )
  }

  /// 9200 → "9.2k"; small values stay plain. Keeps wide totals from overflowing
  /// the tile at `Ischys.mono(26)`.
  private func fmtVolume(_ kg: Int) -> String {
    if kg >= 1000 { return String(format: "%.1fk", Double(kg) / 1000) }
    return String(kg)
  }
}
