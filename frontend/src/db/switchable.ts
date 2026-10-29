/**
 * A stand-in object whose every read goes to whichever target is current, so
 * a module-level export (`db`) can be pointed at another connection without
 * touching the modules that imported it.
 *
 * A function read off the handle is bound to the target that was current at
 * the moment it was read. So `const run = handle.run` keeps running on that
 * target after a swap; only a fresh read through the handle sees the new one.
 *
 * Pure (no expo imports), so it is node-tested.
 */
export function createSwitchable<T extends object>(
  initial: T,
): { handle: T; swap(next: T): void; current(): T } {
  let target: T = initial;

  // The proxy's own target is a blank object, never a connection, so no
  // connection's non-configurable properties pin the proxy's invariants.
  const handle = new Proxy({} as T, {
    get(_blank, prop) {
      const now = target;
      const value: unknown = Reflect.get(now, prop, now);
      // `constructor` stays the class itself, so identity and class checks
      // (drizzle's `is()`, `instanceof`) see the target's class.
      return typeof value === 'function' && prop !== 'constructor' ? value.bind(now) : value;
    },
    set(_blank, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
    has(_blank, prop) {
      return Reflect.has(target, prop);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(target);
    },
  });

  return {
    handle,
    swap(next: T) {
      target = next;
    },
    current: () => target,
  };
}
