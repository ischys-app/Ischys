/**
 * The exercise reorder overlay on the workout and edit-workout screens: the
 * shared ReorderList, drawing each exercise as initials, name and set count.
 */
import { t } from '../../i18n';

import { ReorderList, type ReorderRow } from '../ReorderList';
import type { Exercise } from './types';

type Props = {
  visible: boolean;
  exercises: Exercise[];
  topInset: number;
  onDone: () => void;
  /** Called once per completed drag, with the reordered array. */
  onReorder: (nextOrder: Exercise[]) => void;
};

const exerciseRow = (ex: Exercise): ReorderRow => ({
  initials: ex.initials,
  title: ex.name,
  subtitle: t('common.setsCount', { count: ex.sets.length }),
});

export function ReorderExercises({ visible, exercises, topInset, onDone, onReorder }: Props) {
  return (
    <ReorderList
      visible={visible}
      items={exercises}
      row={exerciseRow}
      title={t('reorder.title')}
      topInset={topInset}
      onDone={onDone}
      onReorder={onReorder}
    />
  );
}
