import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/shared/queue.js';

/** Let pending promise callbacks run. */
const flush = () => new Promise((r) => setImmediate(r));

/** A manual clock + timer pair for the queue's injectable `now` / `setTimer`. */
function fakeClock() {
  let t = 0;
  /** @type {Array<{ at: number, fn: () => void }>} */
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      timers.push({ at: t + ms, fn });
    },
    /** Fire every timer (and whatever they schedule) in time order until idle. */
    async drain() {
      await flush();
      while (timers.length) {
        timers.sort((a, b) => a.at - b.at);
        const next = /** @type {{ at: number, fn: () => void }} */ (timers.shift());
        t = Math.max(t, next.at);
        next.fn();
        await flush();
      }
    },
  };
}

const gaps = (xs) => xs.slice(1).map((x, i) => x - xs[i]);

test('queue starts requests at least 200 ms apart (at most 5 per second)', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer });
  const starts = [];
  const done = Array.from({ length: 6 }, (_, i) =>
    q.add(async () => {
      starts.push(clock.now());
      return i;
    }),
  );
  await clock.drain();
  assert.deepEqual(await Promise.all(done), [0, 1, 2, 3, 4, 5]);
  assert.equal(starts.length, 6);
  assert.deepEqual(starts, [0, 200, 400, 600, 800, 1000]);
});

test('queue does not delay a request when the last one started long enough ago', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer });
  const starts = [];
  q.add(async () => starts.push(clock.now()));
  await clock.drain();
  clock.setTimer(() => {}, 1000); // let 1 s pass
  await clock.drain();
  q.add(async () => starts.push(clock.now()));
  await clock.drain();
  assert.deepEqual(starts, [0, 1000]);
});

test('queue retries a failing request, and the retry is throttled too', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer, maxAttempts: 3 });
  const starts = [];
  let calls = 0;
  const result = q.add(async () => {
    starts.push(clock.now());
    calls += 1;
    if (calls < 3) throw new Error('flaky');
    return 'ok';
  });
  await clock.drain();
  assert.equal(await result, 'ok');
  assert.equal(calls, 3);
  assert.ok(gaps(starts).every((g) => g >= 200), `gaps ${gaps(starts)}`);
});

test('queue rejects once maxAttempts is used up', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer, maxAttempts: 2 });
  let calls = 0;
  const result = q.add(async () => {
    calls += 1;
    throw new Error('down');
  });
  result.catch(() => {}); // observed below; avoid an unhandled-rejection warning meanwhile
  await clock.drain();
  await assert.rejects(result, /down/);
  assert.equal(calls, 2);
});

test('queue: a task added with retry: false runs once, even when it fails (a POST is never re-sent)', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer, maxAttempts: 3 });
  let calls = 0;
  const result = q.add(async () => {
    calls += 1;
    throw new Error('post threw');
  }, { retry: false });
  result.catch(() => {});
  await clock.drain();
  await assert.rejects(result, /post threw/);
  assert.equal(calls, 1);
});

test('queue: a synchronously throwing task rejects instead of stalling the queue', async () => {
  const clock = fakeClock();
  const q = createQueue({ now: clock.now, setTimer: clock.setTimer, maxAttempts: 1, concurrency: 1 });
  const result = q.add(() => { throw new Error('sync'); });
  result.catch(() => {});
  const next = q.add(async () => 'next');
  await clock.drain();
  await assert.rejects(result, /sync/);
  assert.equal(await next, 'next');
});
