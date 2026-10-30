// Build: bundle src/ into two single, NON-minified, readable IIFEs:
//   dist/timetool2.js        (entry src/bootstrap.js)
//   dist/package-planner.js  (entry src/package-planner/bootstrap.js)
// Readable output is a hard requirement — TW reviewers read the hosted files.
// JSDoc type comments are stripped automatically (esbuild re-prints the AST and drops
// non-legal comments); legalComments:'none' guarantees nothing lingers.
//
// timetool2's renderer is a BUILD-TIME swap (DESIGN.md §7). Choose with:
//   node build.mjs --renderer=modern|native|minimal   (default: modern)
// This aliases the `@renderer` import to the chosen file. The planner has no renderer.

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const rendererArg = (args.find((a) => a.startsWith('--renderer=')) || '').split('=')[1] || 'modern';

const VALID_RENDERERS = ['modern', 'native', 'minimal'];
if (!VALID_RENDERERS.includes(rendererArg)) {
  console.error(`Unknown renderer "${rendererArg}". Valid: ${VALID_RENDERERS.join(', ')}`);
  process.exit(1);
}

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  legalComments: 'none',
  charset: 'utf8',
};

// The banner is the ONE block guaranteed to ship (esbuild strips most other comments
// unpredictably). Keep each script's reviewer-facing "what/why" summary here, not in src.

/** @type {import('esbuild').BuildOptions} */
const timetool2 = {
  ...common,
  entryPoints: [resolve(__dirname, 'src/bootstrap.js')],
  outfile: resolve(__dirname, 'dist/timetool2.js'),
  banner: {
    js: [
      `// timetool2 — TribalWars attack-timing aid (renderer: "${rendererArg}").`,
      `// A timing AID only: it shows a countdown/bar and cues; it never auto-clicks or`,
      `// submits an attack — every send is a manual click. Read-only network use (reads the`,
      `// target's command list). No external calls beyond TribalWars itself.`,
      `// Built from source; do not edit dist/ by hand. Design: DESIGN.md.`,
    ].join('\n'),
  },
  // `@renderer` resolves to the chosen look. Everything else imports from `@renderer`,
  // never from a specific renderers/*.js file, so the swap is a single point.
  alias: {
    '@renderer': resolve(__dirname, `src/ui/renderers/${rendererArg}.js`),
  },
};

/** @type {import('esbuild').BuildOptions} */
const packagePlanner = {
  ...common,
  entryPoints: [resolve(__dirname, 'src/package-planner/bootstrap.js')],
  outfile: resolve(__dirname, 'dist/package-planner.js'),
  banner: {
    js: [
      `// Noble Package Planner — TribalWars (classic worlds) market-transport planner.`,
      `// Plans transports between your own villages so academy villages can store as many`,
      `// complete noble packages as possible. One click = one action: every transport is a`,
      `// manual click; nothing is sent, stored or trained automatically. Reads premium`,
      `// overviews and the public world config (read-only), throttled to <= 5 requests/s.`,
      `// No external calls beyond TribalWars itself.`,
      `// Built from source; do not edit dist/ by hand. Design: DESIGN-package-planner.md.`,
    ].join('\n'),
  },
};

const builds = [
  { name: `dist/timetool2.js (renderer: ${rendererArg})`, options: timetool2 },
  { name: 'dist/package-planner.js', options: packagePlanner },
];

if (watch) {
  for (const { options } of builds) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
  console.log(`watching… (renderer: ${rendererArg})`);
} else {
  await Promise.all(builds.map(({ options }) => esbuild.build(options)));
  for (const { name } of builds) console.log(`built ${name}`);
}
