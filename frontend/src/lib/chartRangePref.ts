/**
 * The exercise charts' last-chosen time range.
 *
 * Remembered app-wide rather than per exercise: the range is how the user reads
 * a chart, not a fact about any one lift, and re-picking "1Y" on every exercise
 * would be the sort of small tax that makes a feature go unused.
 */
import * as SecureStore from './secureStore';

import { CHART_RANGES, type ChartRangeId } from '../domain/chartRange';

const KEY = 'ischys.chartRange';
const DEFAULT: ChartRangeId = '3M';

const isRange = (v: string | null): v is ChartRangeId =>
  !!v && CHART_RANGES.some((r) => r.id === v);

export async function getChartRange(): Promise<ChartRangeId> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return isRange(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function setChartRange(range: ChartRangeId): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, range);
  } catch {
    // Losing the preference costs a tap, not the chart.
  }
}
