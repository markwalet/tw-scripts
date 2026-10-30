// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW; preconditions and the popup follow.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator } from './core/i18n.js';

const t = makeTranslator(resolveLang('auto', tw.market()));

// TODO(#13): confirm author/contact for the Script Library submission.
tw.register(t('scriptName'), true, 'markwalet', 'en.tribalwars@coma.innogames.de');
