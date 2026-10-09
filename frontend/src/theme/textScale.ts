/**
 * How far text may grow with the system's text size (Dynamic Type on iOS, font
 * scale on Android), passed as `maxFontSizeMultiplier`.
 *
 * Nothing was capped, so at the accessibility sizes — up to about three times
 * the type — text set inside a box of fixed size left it: Home's streak pill
 * ran off the screen, the tab labels were cut away, units dropped under their
 * numbers and a set row's fields no longer fitted their columns.
 *
 * The rule: text that has room to wrap is left alone and grows as far as the
 * user asks. Text in a control that cannot grow with it is capped at the size
 * that control still holds. A cap is always above 1, so everything still gets
 * larger for someone who asks for larger type.
 *
 * No imports, so `node --test` covers it. See textScale.test.ts.
 */
export const textScale = {
  /** One-line text in a fixed frame: tab labels, pills, chips, table cells, badges. */
  fixed: 1.2,
  /** Large display type and titles, which are big to begin with. */
  display: 1.35,
  /** A button's label, or a short line beside one: room to grow, not to wrap. */
  control: 1.5,
} as const;

export type TextScale = keyof typeof textScale;
