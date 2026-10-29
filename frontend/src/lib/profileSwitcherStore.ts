/**
 * Whether the profile switcher (P2, #117) is open. One sheet, mounted once in
 * app/_layout.tsx, so the Profile tab's long-press, its header ▾, Settings and
 * the VoiceOver action all open the same one.
 */
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export function openProfileSwitcher(): void {
  set(true);
}

export function closeProfileSwitcher(): void {
  set(false);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): boolean => open;

export function useProfileSwitcherOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
