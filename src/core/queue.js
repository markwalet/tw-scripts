// core/queue.js — throttled task queue with retry (ports twLib, DESIGN.md §2).
// Generic and pure: it queues async task-functions, so it has no dependency on jQuery
// or the network and is unit-testable. incomings supplies the actual fetch task.

/**
 * @param {{ concurrency?: number, maxAttempts?: number }} [opts]
 */
export function createQueue({ concurrency = 5, maxAttempts = 3 } = {}) {
  /** @type {Array<() => void>} */
  const waiting = [];
  let active = 0;

  function pump() {
    while (active < concurrency && waiting.length) {
      const run = waiting.shift();
      if (run) run();
    }
  }

  /**
   * Enqueue an async task. Retries up to maxAttempts on rejection.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function add(task) {
    return new Promise((resolve, reject) => {
      const attempt = (n) => {
        active += 1;
        task()
          .then((value) => {
            active -= 1;
            resolve(value);
            pump();
          })
          .catch((err) => {
            active -= 1;
            if (n < maxAttempts) {
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
