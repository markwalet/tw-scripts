# tw-scripts

Userscripts for [TribalWars](https://www.tribalwars.net). The main one is the
**Noble Package Planner**.

## Noble Package Planner

For **classic worlds** on the international (`.net`) servers: worlds where nobles are paid
with resource packages stored in the academy, not with minted coins.

The planner reads your villages and plans market transports between them so your academy
villages end up holding as many **complete noble packages** as possible. You send the
transports from its list; when they have arrived you store the packages yourself in
Academy › Store.

### The hard line

It is a transport aid, not a bot.

- **One click = one action.** Every button sends one market request for one target, and
  only when you click it. Holding Enter moves down the list one click at a time.
- **It never sends anything automatically.** Nothing is retried, repeated, stored, minted
  or trained by the script.
- **Read-only fetches.** It reads your premium overviews, the public world config and (only
  with a noble target) one academy page, through one queue of at most 5 requests per second.
- **No external calls.** Everything stays on your TribalWars world.

### Requirements

- A premium account (the data comes from the premium overviews).
- A classic world. Coin worlds are refused with a message.

### How to use it

1. Build `dist/package-planner.js` (see below) and add it to your quickbar, or paste it
   into the browser console on a TribalWars page.
2. Run it on any page. A popup opens.
3. Adjust the settings if you want, then click **Calculate**. The popup shows how many
   packages you can store after everything arrives, and one card per academy village.
4. Click each card's **Send** button (or hold Enter). A card the game refuses shows the
   game's message and offers to send village by village instead. If a captcha or error
   stops everything, refresh, solve it and run the planner again: transports already on
   the way are counted.
5. When the resources have arrived, go to **Academy › Store** and store the packages.

### Settings

Saved per world in your browser.

| Setting | Default |
|---|---|
| Max travel time | none |
| Reserve per resource (wood/clay/iron) | 0 |
| Merchants to keep home | 0 |
| Sender group / receiver group | all |
| Collect for X new nobles | empty: as many packages as possible |
| Warehouse buffer | 2% |
| Count production until arrival | on |

## Development

Node 24, ESM. esbuild is the only dependency.

```bash
npm install
npm run build                              # dist/package-planner.js and dist/timetool2.js
npm run watch                              # rebuild on change
npm test                                   # unit tests
node test/package-planner/send.smoke.mjs   # headless-Chrome send smoke test (after build)
```

`dist/` is generated; edit `src/` and rebuild. The design and its rationale live in
[`DESIGN-package-planner.md`](DESIGN-package-planner.md).

## timetool2 (not ready)

The repo also holds **timetool2**, a rewrite of an attack-timing aid (countdown bar and
cues on the attack-confirm screen; it never clicks or sends for you). It is work in
progress, not tested on a live page and not submitted to the Script Library. Design:
[`DESIGN.md`](DESIGN.md).

## License

[MIT](LICENSE)
