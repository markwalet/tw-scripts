// bootstrap.js — entry point. Registers with TW, detects the page, wires modules, starts.
// Mirrors the original's two entry paths: run immediately on the rally/confirm screen, or
// wait via a MutationObserver when an attack window opens from the map (DESIGN.md §1/§4).

import * as tw from './adapter/tw.js';
import { installResync } from './adapter/clock.js';
import { load, save } from './core/settings.js';
import { resolveLang, makeTranslator } from './core/i18n.js';
import { createQueue } from './shared/queue.js';
import { createSnipeBar } from './ui/snipe-bar.js';
import { createIncomings } from './ui/incomings.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { createCues } from './ui/cues.js';
import { setTabTitleEnabled, initTabTitle } from './ui/notify.js';

tw.register('TimeTool2', true, 'Bottenkraker/rewrite', 'nl.tribalwars@coma.innogames.de');

let started = false;

function startScript() {
  if (started) return;
  started = true;

  installResync();

  const world = tw.world();
  const settings = load(world);
  const persist = () => save(world, settings);
  const t = makeTranslator(resolveLang(settings.language, tw.market()));
  initTabTitle(); // capture original title before the loop starts overwriting it
  setTabTitleEnabled(settings.tabTitle);

  const queue = createQueue({ concurrency: 5, maxAttempts: 3 });
  const cues = createCues({ settings });
  const bar = createSnipeBar({ t, settings, cues, onPersist: persist });
  const incomings = createIncomings({ queue, onPick: (arrivalMs) => bar.setArrival(arrivalMs) });
  const settingsPanel = createSettingsPanel({
    t,
    settings,
    onChange: (patch) => {
      // cues holds a live reference to `settings`, so mutating it in place is what makes
      // volume/toggle changes take effect on the next schedule.
      Object.assign(settings, patch);
      if (patch.tabTitle != null) setTabTitleEnabled(patch.tabTitle);
      if (patch.colors) bar.applyColors(settings.colors);
      if (patch.cues) bar.rescheduleCues(); // re-apply master/beep toggles to any pending cues
      // NOTE: patch.language persists but only takes effect on next load — the translator
      // and already-rendered labels aren't rebuilt live (v1 limitation; see DESIGN.md).
      persist();
    },
  });
  bar.handlers.onOpenSettings = () => settingsPanel.open();

  // Mount the panel into TW's arrival block.
  const host = tw.els.arrivalContainer();
  if (host) bar.mount(host);

  // Planner / off-pack handoff: arrivalTimestamp (epoch ms) on the referrer (§11).
  const ref = new URLSearchParams(document.referrer.split('?')[1] || '');
  const arrivalTs = ref.get('arrivalTimestamp');
  if (arrivalTs) bar.setArrival(parseInt(arrivalTs, 10));

  incomings.init();
}

// Entry path 1: already on the confirm/rally screen.
if (tw.els.arrivalContainer()) {
  startScript();
} else {
  // Entry path 2: attack window opens from the map — watch for the arrival block.
  const body = tw.els.dsBody();
  if (body) {
    const observer = new MutationObserver(() => {
      if (tw.els.arrivalContainer()) {
        observer.disconnect();
        startScript();
      }
    });
    observer.observe(body, { childList: true, subtree: true });
  }
}
