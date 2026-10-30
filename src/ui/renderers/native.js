// Renderer "native" — respects TW's parchment/wood theme but far more polished. Feels
// like a premium built-in part of the game.
import { makeRenderer } from './_base.js';

const css = `
.tt2-panel[data-look=native]{
  background:#f4e4bc; color:#4a3018; border:1px solid #a58b5c; border-radius:4px;
  padding:8px 10px; margin:8px 0; font:12px/1.4 Verdana,serif;
  box-shadow:inset 0 0 0 1px #e8d4a0;
}
.tt2-panel[data-look=native] .tt2-head{display:flex;justify-content:space-between;align-items:center;
  font-weight:700;color:#5c3a17;border-bottom:1px solid #c9b038;padding-bottom:4px;margin-bottom:6px;}
.tt2-panel[data-look=native] .tt2-gear{background:none;border:none;color:#7a5a2a;cursor:pointer;font-size:14px;}
.tt2-panel[data-look=native] .tt2-bar{position:relative;height:24px;background:#8a8a8a;border:1px solid #6b6b6b;overflow:hidden;margin-bottom:8px;}
.tt2-panel[data-look=native] .tt2-bar-fill{height:100%;width:0;background:var(--tt2-wait,#c8862b);}
.tt2-panel[data-look=native] .tt2-bar-fill[data-state=ready]{background:var(--tt2-ready,#5c8a3a);}
.tt2-panel[data-look=native] .tt2-bar-fill[data-state=idle]{background:var(--tt2-idle,#5c8a3a);}
.tt2-panel[data-look=native] .tt2-bar-time{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;text-shadow:0 1px 1px #000;font-variant-numeric:tabular-nums;}
.tt2-panel[data-look=native] .tt2-row{display:flex;align-items:center;gap:6px;margin:3px 0;}
/* segmented date · time . ms — one parchment pill, borderless fields inside */
.tt2-panel[data-look=native] .tt2-datetime{display:inline-flex;align-items:center;gap:1px;
  background:#fffbea;border:1px solid #a58b5c;border-radius:4px;padding:2px 5px;box-shadow:inset 0 1px 2px rgba(120,90,40,.15);}
.tt2-panel[data-look=native] .tt2-datetime:focus-within{border-color:#7a5a2a;}
.tt2-panel[data-look=native] .tt2-seg{background:transparent;border:none;outline:none;color:#4a3018;
  font:bold 12px/1 Verdana,sans-serif;font-variant-numeric:tabular-nums;text-align:center;padding:3px 2px;border-radius:3px;}
.tt2-panel[data-look=native] .tt2-seg:focus{background:#f0dfb0;}
.tt2-panel[data-look=native] .tt2-seg{width:20px;}
.tt2-panel[data-look=native] .tt2-seg-y{width:34px;}
.tt2-panel[data-look=native] .tt2-seg-ms{width:26px;}
.tt2-panel[data-look=native] .tt2-seg-sep{opacity:.6;padding:0;}
.tt2-panel[data-look=native] .tt2-bar-ms{color:#6b4a20;}
.tt2-panel[data-look=native] .tt2-toolate{color:#a11;font-weight:700;}
.tt2-panel[data-look=native].tt2-cue-send{outline:2px solid var(--tt2-ready);}
`;

export const Renderer = makeRenderer({ name: 'native', css });
