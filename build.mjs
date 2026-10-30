// Build: bundle src/ -> dist/timetool2.js as a single, NON-minified, readable IIFE.
// Readable output is a hard requirement — TW reviewers read the hosted file.
// JSDoc type comments are stripped automatically (esbuild re-prints the AST and drops
// non-legal comments); legalComments:'none' guarantees nothing lingers.
//
// Renderer selection is a BUILD-TIME swap (DESIGN.md §7). Choose with:
//   node build.mjs --renderer=modern|native|minimal   (default: modern)
// This aliases the `@renderer` import to the chosen file.

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
const options = {
  entryPoints: [resolve(__dirname, 'src/bootstrap.js')],
  outfile: resolve(__dirname, 'dist/timetool2.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  legalComments: 'none',
  charset: 'utf8',
  // The banner is the ONE block guaranteed to ship (esbuild strips most other comments
  // unpredictably). Keep the reviewer-facing "what/why" summary here, not scattered in src.
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

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`watching… (renderer: ${rendererArg})`);
} else {
  await esbuild.build(options);
  console.log(`built dist/timetool2.js (renderer: ${rendererArg})`);
}
