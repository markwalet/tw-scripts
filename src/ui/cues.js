// ui/cues.js — countdown cues (DESIGN.md §6). Alerts only; never automates the send.
//
// Background-reliable audio: beeps are PRE-SCHEDULED on the Web Audio clock at absolute
// times (ac.currentTime + offset), so T-3/2/1 + "now" fire even when the tab is
// throttled/hidden — that background reliability is the entire point of using Web Audio
// instead of setTimeout. Visual cues are NOT this module's concern: they're handled by
// the renderer's cue() hook (DESIGN.md §7) and driven from the throttled render loop
// elsewhere.
//
// This module is audio-only: no DOM, no TW globals.

/**
 * @typedef {Object} ScheduledNode
 * @property {OscillatorNode} osc
 * @property {GainNode} gain
 */

/**
 * @param {{ settings: import('../core/settings.js').Settings }} deps
 */
export function createCues({ settings }) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {ScheduledNode[]} */
  let scheduled = [];

  /** Lazily create the single shared AudioContext. */
  function audio() {
    if (!ctx) {
      const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      ctx = new Ctor();
    }
    return ctx;
  }

  /**
   * Resume/create the AudioContext. Browsers require a user gesture before audio can
   * play, so call this from the first click/keydown handler. Safe to call repeatedly —
   * resume() on an already-running context is a no-op.
   */
  function unlock() {
    const ac = audio();
    if (ac.state === 'suspended') {
      // Fire-and-forget: resume() returns a promise but callers don't need to await it.
      void ac.resume();
    }
  }

  /**
   * Emit a short tone at an absolute AudioContext time, tracked so `cancel()` can stop it.
   * @param {number} when  absolute AudioContext time (seconds)
   * @param {number} [freq]
   * @param {number} [dur]  seconds
   */
  function beepAt(when, freq = 880, dur = 0.08) {
    const ac = audio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = freq;
    gain.gain.value = clampVolume(settings.cues.volume);
    osc.connect(gain).connect(ac.destination);
    osc.start(when);
    osc.stop(when + dur);
    const node = { osc, gain };
    scheduled.push(node);
    // Stop tracking once the node has finished playing on its own.
    osc.addEventListener('ended', () => {
      const i = scheduled.indexOf(node);
      if (i !== -1) scheduled.splice(i, 1);
      disconnectNode(node);
    });
  }

  /**
   * Schedule cues for a known send instant.
   * @param {number} sendMsFromNow  ms until send (server-relative); negative/past is ignored
   */
  function scheduleForSend(sendMsFromNow) {
    if (!settings.cues.enabled) return;
    if (!Number.isFinite(sendMsFromNow)) return;
    const ac = audio();
    const base = ac.currentTime + sendMsFromNow / 1000;
    // Cues are always background-capable: the Web Audio clock schedules them at absolute
    // times, so they fire even when the tab is throttled/hidden. That's inherent to
    // AudioContext, not a separate setting.
    for (const lead of [3, 2, 1]) {
      const when = base - lead;
      if (when >= ac.currentTime) beepAt(when, 660, 0.08);
    }
    if (base >= ac.currentTime) beepAt(base, 1040, 0.14); // distinct "now" tone
  }

  /** Disconnect a scheduled node's audio graph (idempotent). */
  function disconnectNode({ osc, gain }) {
    try {
      osc.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      gain.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  /**
   * Cancel every pending scheduled cue: stop each oscillator (which also fires its
   * `ended` handler) and disconnect the graph, then clear the tracking list.
   */
  function cancel() {
    const pending = scheduled;
    scheduled = [];
    for (const node of pending) {
      try {
        node.osc.stop();
      } catch {
        /* already stopped/ended */
      }
      disconnectNode(node);
    }
  }

  return { unlock, scheduleForSend, cancel };
}

/** Clamp settings.cues.volume to a sane 0..1 range. */
function clampVolume(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}
