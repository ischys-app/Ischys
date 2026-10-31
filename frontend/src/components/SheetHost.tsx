/**
 * Where bottom sheets are drawn on iOS: one layer over the whole app, inside
 * the root view, rather than an RN `<Modal>` per sheet (#131).
 *
 * A `<Modal>` is a view controller presented over the app. On a real iPhone
 * it now and then came up with its content never laid out: nothing showed,
 * but the empty controller still covered the screen and swallowed every tap,
 * so the app looked frozen until it was force-quit. Drawn here, a sheet is an
 * ordinary view in the app's own tree and that cannot happen.
 *
 * A sheet hands its content over with `useHostedSheet`; the host draws every
 * open one, the most recently opened on top.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Entry = { id: number; node: ReactNode };

let entries: Entry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const listener of listeners) listener();
}

function put(id: number, node: ReactNode) {
  const at = entries.findIndex((e) => e.id === id);
  if (at === -1) entries = [...entries, { id, node }];
  else if (entries[at].node !== node) entries = entries.map((e) => (e.id === id ? { id, node } : e));
  else return;
  emit();
}

function remove(id: number) {
  if (!entries.some((e) => e.id === id)) return;
  entries = entries.filter((e) => e.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => entries;

/**
 * Draws `node` in the host while it is not null. Called on every render, so
 * the hosted copy follows the sheet's props and state.
 */
export function useHostedSheet(node: ReactNode | null) {
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;

  useLayoutEffect(() => {
    if (node == null) remove(id.current);
    else put(id.current, node);
  });

  useEffect(() => {
    const mine = id.current;
    return () => remove(mine);
  }, []);
}

/** Mounted once, last, inside the root providers. */
export function SheetHost() {
  const open = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (open.length === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open.map((e) => (
        <Fragment key={e.id}>{e.node}</Fragment>
      ))}
    </View>
  );
}
