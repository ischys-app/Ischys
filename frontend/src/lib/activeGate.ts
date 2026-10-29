/**
 * Holds work back until the app is in the foreground. Pure, so it is
 * node-tested; lib/whenActive.ts binds it to React Native's AppState and Alert.
 *
 * Why: the app runs in the background — woken by the Watch, a Live Activity
 * button, a rest alert — and some of what it does there ends in an alert. An
 * alert shown from the background is presented by UIKit with no foreground
 * scene to attach to, and nobody is looking at it. So it waits for the user.
 */

/** What this needs of AppState. */
export type AppStateSource = {
  /** The current state: 'active', 'background', 'inactive', or not yet known. */
  current(): string | null | undefined;
  /** Calls `listener` on every change. Returns an unsubscribe. */
  subscribe(listener: (state: string) => void): () => void;
};

/**
 * `whenActive(fn)` runs `fn` now if the app is active, else once, on the next
 * change to active, and then stops listening. It returns a cancel: called
 * before then, `fn` never runs and the listener goes.
 */
export function createWhenActive(app: AppStateSource): (fn: () => void) => () => void {
  return (fn) => {
    if (app.current() === 'active') {
      fn();
      return () => {};
    }
    let done = false;
    let off: (() => void) | null = null;
    off = app.subscribe((state) => {
      if (done || state !== 'active') return;
      done = true;
      off?.();
      fn();
    });
    // A source that reported 'active' while subscribing has run `fn` already.
    if (done) off();
    return () => {
      if (done) return;
      done = true;
      off?.();
    };
  };
}

/**
 * `alert(title, message, ...rest)` shows through `show` when the app is active.
 * Asked again for the same title and message while one is still waiting, it
 * shows once: a failure retried in the background is one thing to tell.
 */
export function createAlertWhenActive<Rest extends unknown[]>(
  whenActive: (fn: () => void) => unknown,
  show: (title: string, message: string | undefined, ...rest: Rest) => void,
): (title: string, message?: string, ...rest: Rest) => void {
  const waiting = new Set<string>();
  return (title, message, ...rest) => {
    const key = `${title}\n${message ?? ''}`;
    if (waiting.has(key)) return;
    waiting.add(key);
    whenActive(() => {
      waiting.delete(key);
      show(title, message, ...rest);
    });
  };
}
