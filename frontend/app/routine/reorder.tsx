/**
 * Reorder routines — opened from Reorder in a routine's menu on Home. The
 * shared ReorderList, drawing each routine as on Home (initials, name and
 * exercise count). Every completed move is stored at once (reorderRoutines,
 * one transaction); Home, and through it the Watch's Start screen, read the
 * new order when they come back into focus.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listRoutinesInOrder, reorderRoutines, type RoutineOrderRow } from '../../src/api/routines';
import { ReorderList, type ReorderMoveActions, type ReorderRow } from '../../src/components/ReorderList';
import { t } from '../../src/i18n';

const routineRow = (r: RoutineOrderRow): ReorderRow => ({
  initials: r.initials,
  title: r.name,
  subtitle: t('home.exerciseCount', { count: r.exerciseCount }),
});

export default function ReorderRoutinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RoutineOrderRow[]>([]);

  const reload = useCallback(() => {
    listRoutinesInOrder()
      .then(setRows)
      .catch((e) => {
        if (__DEV__) console.warn('[routines] list failed', e);
      });
  }, []);

  useFocusEffect(reload);

  const commit = (next: RoutineOrderRow[]) => {
    setRows(next);
    reorderRoutines(next.map((r) => r.id)).catch((e) => {
      if (__DEV__) console.warn('[routines] reorder failed', e);
      reload();
    });
  };

  const moveActions: ReorderMoveActions = {
    label: (r) => t('routineReorder.handleLabel', { name: r.title }),
    hint: t('routineReorder.handleHint'),
    moveUp: t('routineReorder.moveUp'),
    moveDown: t('routineReorder.moveDown'),
  };

  return (
    <ReorderList
      visible
      items={rows}
      row={routineRow}
      title={t('routineReorder.title')}
      topInset={insets.top}
      bottomInset={insets.bottom}
      onDone={() => router.back()}
      onReorder={commit}
      moveActions={moveActions}
    />
  );
}
