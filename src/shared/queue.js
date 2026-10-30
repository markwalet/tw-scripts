// shared/queue.js — throttled task queue with retry (ports twLib, DESIGN.md §2).
// Generic and pure: it queues async task-functions, so it has no dependency on jQuery
// or the network and is unit-testable. Callers supply the actual fetch/post task.
//
// Throttle: request STARTS are spaced at least `minIntervalMs` apart (default 200 ms,
// i.e. at most 5 requests/s — the TW script-approval limit). Retries count as requests
// and are throttled the same way. `concurrency` additionally caps requests in flight.
// `now`/`setTimer` are injectable so tests can drive a fake clock.

/**
 * @param {{
 *   concurrency?: number,
 *   maxAttempts?: number,
 *   minIntervalMs?: number,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => void,
 * }} [opts]
 */
export function createQueue({
  concurrency = 5,
  maxAttempts = 3,
  minIntervalMs = 200,
  now = () => Date.now(),
  setTimer = (fn, ms) => {
    setTimeout(fn, ms);
  },
} = {}) {
  /** @type {Array<() => void>} */
  const waiting = [];
  let active = 0;
  let lastStart = -Infinity;
  let timerPending = false;

  function pump() {
    while (active < concurrency && waiting.length) {
      const wait = lastStart + minIntervalMs - now();
      if (wait > 0) {
        if (!timerPending) {
          timerPending = true;
          setTimer(() => {
            timerPending = false;
            pump();
          }, wait);
        }
        return;
      }
      const run = waiting.shift();
      if (run) {
        lastStart = now();
        run();
      }
    }
  }

  /**
   * Enqueue an async task. Retries up to maxAttempts on rejection, unless `retry: false`
   * (a request that must never be sent twice, e.g. a POST). A task that throws
   * synchronously counts as a rejection.
   * @template T
   * @param {() => Promise<T>} task
   * @param {{ retry?: boolean }} [opts]
   * @returns {Promise<T>}
   */
  function add(task, { retry = true } = {}) {
    const attempts = retry ? maxAttempts : 1;
    return new Promise((resolve, reject) => {
      /** @param {number} n */
      const attempt = (n) => {
        active += 1;
        new Promise((r) => r(task()))
          .then((value) => {
            active -= 1;
            resolve(value);
            pump();
          })
          .catch((err) => {
            active -= 1;
            if (n < attempts) {
              waiting.unshift(() => attempt(n + 1)); // retry at the front
            } else {
              reject(err);
            }
            pump();
          });
      };
      waiting.push(() => attempt(1));
      pump();
    });
  }

  return { add };
}
