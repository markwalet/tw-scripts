// ui/snipe-bar.js — the bar CONTROLLER: owns timing state, drives the rAF repaint loop,
// wires the refocus resync, schedules cues, and listens (passively) to the submit click.
// All logic lives here; the renderer only paints (DESIGN.md §7).

import { now, onResync } from '../adapter/clock.js';
import * as tw from '../adapter/tw.js';
import { Renderer } from './renderer.js';
import {
  barViewModel,
  sendTimeMs,
  partsToArrivalMs,
  parseSnipeParts,
  formatDatePart,
  formatTimePart,
  formatClock,
  formatDuration,
  formatTabCountdown,
  msPart,
} from '../core/time-math.js';
import { updateTabTitle } from './notify.js';

/**
 * @param {{ t: (k:string)=>string, settings: import('../core/settings.js').Settings,
 *           cues: ReturnType<typeof import('./cues.js').createCues>,
 *           onPersist: () => void }} deps
 */
export function createSnipeBar({ t, settings, cues, onPersist }) {
  const durationMs = tw.attackDurationMs();

  const state = {
    /** @type {number|null} target arrival, epoch ms (ms-precise — no separate ms field) */
    arrivalMs: null,
    remember: settings.remember,
  };

  let rafId = 0;
  let titleTimer = 0;
  /** @type {'waiting'|'ready'|'idle'|null} previous bar state, for one-shot cue transitions */
  let prevState = null;
  let firedSend = false;

  /** Send instant = arrival − travel duration. */
  function sendMs() {
    return state.arrivalMs == null ? null : sendTimeMs(state.arrivalMs, durationMs);
  }

  /** Push settings.colors into CSS vars so all renderers pick them up (DESIGN.md §8). */
  function applyColors(colors = settings.colors) {
    const root = document.documentElement;
    root.style.setProperty('--tt2-wait', colors.waiting);
    root.style.setProperty('--tt2-ready', colors.ready);
    root.style.setProperty('--tt2-idle', colors.idle);
  }

  /** (Re)schedule audio cues for the current target; called whenever the target moves. */
  function rescheduleCues() {
    cues.cancel();
    firedSend = false;
    const s = sendMs();
    const server = now();
    if (s != null && s > server) cues.scheduleForSend(s - server);
  }

  /** Recompute the target from the three input segments. */
  function applyParts(parts) {
    state.arrivalMs = partsToArrivalMs(parts, { nowMs: now() });
    rescheduleCues();
    onPersist();
  }

  function paint() {
    const server = now();
    const s = sendMs();
    const vm = barViewModel(server, s, s != null ? msPart(s) : 0);
    Renderer.renderBar({ ...vm, clockText: formatClock(server) });

    // Visual cue: fire once on green-window entry / send (audio is pre-scheduled in cues.js).
    if (vm.state === 'ready' && prevState !== 'ready') Renderer.cue({ kind: 'enter-green' });
    prevState = vm.state;
    if (s != null && !firedSend && server >= s) {
      Renderer.cue({ kind: 'send' });
      firedSend = true;
    }

    Renderer.renderSendTime({
      sendText: s != null && server <= s ? formatDuration(s - server) : '',
      tooLate: s != null && server > s,
    });
  }

  /**
   * Tab-title countdown. Runs on a setInterval (NOT the rAF loop) so it keeps updating in a
   * BACKGROUND tab — rAF is paused when hidden, which is exactly when the tab title matters.
   */
  function tickTitle() {
    const server = now();
    const s = sendMs();
    updateTabTitle(s != null && server <= s ? formatTabCountdown(s - server) : '');
  }

  function loop() {
    paint();
    rafId = requestAnimationFrame(loop);
  }

  /** Push the current target back into the three segments. */
  function reflectArrival() {
    if (state.arrivalMs == null) return;
    Renderer.reflectInputs({
      date: formatDatePart(state.arrivalMs),
      time: formatTimePart(state.arrivalMs),
      ms: msPart(state.arrivalMs),
    });
  }

  const handlers = {
    onArrivalInput(parts) {
      applyParts(parts);
    },
    onPaste(text, current) {
      // Distribute a pasted timestamp across segments; keep segments the paste didn't fill.
      const p = parseSnipeParts(text);
      const merged = {
        date: p.date ?? current.date,
        time: p.time ?? current.time,
        // A pasted timestamp is a complete spec: if it has no ms, ms is 0 (not the old value).
        ms: p.ms != null ? p.ms : 0,
      };
      Renderer.reflectInputs({ date: merged.date, time: merged.time, ms: merged.ms });
      applyParts(merged);
    },
    onRememberToggle(on) {
      state.remember = on;
      onPersist();
    },
    onOpenSettings() {
      /* wired by bootstrap → settings-panel */
    },
  };

  return {
    handlers,
    get state() {
      return state;
    },
    applyColors,
    rescheduleCues,
    /** Fill the target directly from a timestamp (planner / click-to-fill). */
    setArrival(arrivalMs) {
      state.arrivalMs = arrivalMs;
      reflectArrival();
      rescheduleCues();
    },
    mount(rootEl) {
      // Pre-fill the fields with the expected arrival (now + travel duration) as a
      // convenient starting point — date = today, ms = 0 — but DON'T arm a target yet, so
      // the bar sits idle instead of screaming "Too Late!" for a send instant that's
      // already now. Editing any segment (or a planner timestamp) arms the real target.
      const defaultArrival = Math.floor((now() + durationMs) / 1000) * 1000; // floor → ms 0

      Renderer.mount(rootEl, {
        t,
        initialValues: {
          date: formatDatePart(defaultArrival),
          time: formatTimePart(defaultArrival),
          ms: 0,
          remember: state.remember,
        },
        handlers,
      });
      applyColors();
      onResync(paint);

      // Browsers require a user gesture before audio; unlock on the first click/keydown.
      const unlock = () => {
        cues.unlock();
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('click', unlock);
      document.addEventListener('keydown', unlock);

      rescheduleCues();
      loop();
      tickTitle(); // immediate, so the tab title is right without waiting a second
      titleTimer = setInterval(tickTitle, 1000);

      // Passive listener only — we NEVER click/submit. Logs your reaction ms (§10).
      const submit = tw.els.confirmSubmit();
      if (submit) {
        submit.addEventListener('click', () => {
          console.log('[timetool2] sent at', now() % 1000, 'ms');
          cancelAnimationFrame(rafId); // stop repainting once sent
          clearInterval(titleTimer);
          cues.cancel();
          onPersist();
        });
      }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      clearInterval(titleTimer);
      cues.cancel();
      Renderer.destroy();
    },
  };
}
