// Renderer "minimal" — keeps the original footprint, just tidier: a better bar with a
// target marker + ms readout, tighter spacing. Lowest-key refresh.
import { makeRenderer } from './_base.js';

const css = `
.tt2-panel[data-look=minimal]{font:12px/1.4 Verdana,sans-serif;margin:6px 0;color:inherit;}
.tt2-panel[data-look=minimal] .tt2-head{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:4px;}
.tt2-panel[data-look=minimal] .tt2-gear{background:none;border:none;cursor:pointer;font-size:13px;opacity:.6;}
.tt2-panel[data-look=minimal] .tt2-bar{position:relative;height:20px;background:#999;overflow:hidden;margin-bottom:6px;}
.tt2-panel[data-look=minimal] .tt2-bar-fill{height:100%;width:0;background:var(--tt2-wait,#ff9933);}
.tt2-panel[data-look=minimal] .tt2-bar-fill[data-state=ready]{background:var(--tt2-ready,green);}
.tt2-panel[data-look=minimal] .tt2-bar-fill[data-state=idle]{background:var(--tt2-idle,green);}
.tt2-panel[data-look=minimal] .tt2-bar-time{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-variant-numeric:tabular-nums;}
.tt2-panel[data-look=minimal] .tt2-row{margin:2px 0;}
.tt2-panel[data-look=minimal] .tt2-datetime{display:inline-flex;align-items:center;gap:1px;border:1px solid #aaa;border-radius:3px;padding:1px 4px;background:#fff;}
.tt2-panel[data-look=minimal] .tt2-datetime:focus-within{border-color:#666;}
.tt2-panel[data-look=minimal] .tt2-seg{background:transparent;border:none;outline:none;font-family:monospace;font-variant-numeric:tabular-nums;text-align:center;padding:2px 1px;}
.tt2-panel[data-look=minimal] .tt2-seg:focus{background:#eee;}
.tt2-panel[data-look=minimal] .tt2-seg{width:18px;}
.tt2-panel[data-look=minimal] .tt2-seg-y{width:32px;}
.tt2-panel[data-look=minimal] .tt2-seg-ms{width:24px;}
.tt2-panel[data-look=minimal] .tt2-seg-sep{opacity:.6;}
.tt2-panel[data-look=minimal] .tt2-bar-ms{display:inline-block;margin-left:6px;color:#555;}
.tt2-panel[data-look=minimal] .tt2-toolate{color:red;font-weight:700;}
.tt2-panel[data-look=minimal].tt2-cue-send{outline:2px solid green;}
`;

export const Renderer = makeRenderer({ name: 'minimal', css });
