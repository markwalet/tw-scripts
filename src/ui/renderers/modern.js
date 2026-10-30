// Renderer "modern" — self-contained dark card with its own accent. Reads clearly as a
// distinct tool. Default renderer.
import { makeRenderer } from './_base.js';

const css = `
.tt2-panel[data-look=modern]{
  --tt2-accent:#4f8cff;
  background:#1e2330; color:#e6e9ef; border-radius:10px; padding:12px 14px; margin:8px 0;
  box-shadow:0 4px 14px rgba(0,0,0,.35); font:13px/1.4 system-ui,sans-serif;
}
.tt2-panel[data-look=modern] .tt2-head{display:flex;justify-content:space-between;align-items:center;
  font-weight:600;letter-spacing:.3px;margin-bottom:8px;color:var(--tt2-accent);}
.tt2-panel[data-look=modern] .tt2-gear{background:none;border:none;color:#9aa4b2;cursor:pointer;font-size:15px;}
.tt2-panel[data-look=modern] .tt2-bar{position:relative;height:26px;background:#11151f;border-radius:6px;overflow:hidden;margin-bottom:10px;}
.tt2-panel[data-look=modern] .tt2-bar-fill{height:100%;width:0;background:var(--tt2-wait,#ff9933);transition:background .15s;}
.tt2-panel[data-look=modern] .tt2-bar-fill[data-state=ready]{background:var(--tt2-ready,#2ecc71);}
.tt2-panel[data-look=modern] .tt2-bar-fill[data-state=idle]{background:var(--tt2-idle,#2ecc71);}
.tt2-panel[data-look=modern] .tt2-bar-time{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-variant-numeric:tabular-nums;font-weight:600;text-shadow:0 1px 2px #000;}
.tt2-panel[data-look=modern] .tt2-row{display:flex;align-items:center;gap:6px;margin:4px 0;}
/* segmented date · time . ms — one pill, borderless fields inside, focus highlight */
.tt2-panel[data-look=modern] .tt2-datetime{display:inline-flex;align-items:center;gap:1px;
  background:#11151f;border:1px solid #333c4d;border-radius:7px;padding:2px 6px;transition:border-color .15s;}
.tt2-panel[data-look=modern] .tt2-datetime:focus-within{border-color:var(--tt2-accent);}
.tt2-panel[data-look=modern] .tt2-seg{background:transparent;border:none;outline:none;color:#e6e9ef;
  font:600 13px/1 ui-monospace,monospace;font-variant-numeric:tabular-nums;text-align:center;padding:3px 2px;border-radius:4px;}
.tt2-panel[data-look=modern] .tt2-seg:focus{background:#2a3346;}
.tt2-panel[data-look=modern] .tt2-seg::placeholder{color:#5a6478;}
.tt2-panel[data-look=modern] .tt2-seg{width:20px;}
.tt2-panel[data-look=modern] .tt2-seg-y{width:34px;}
.tt2-panel[data-look=modern] .tt2-seg-ms{width:26px;}
.tt2-panel[data-look=modern] .tt2-seg-sep{opacity:.5;padding:0;}
.tt2-panel[data-look=modern] .tt2-bar-ms{color:#9aa4b2;font-variant-numeric:tabular-nums;}
.tt2-panel[data-look=modern] .tt2-sendtime{margin-top:6px;font-variant-numeric:tabular-nums;}
.tt2-panel[data-look=modern] .tt2-toolate{color:#ff5555;font-weight:700;}
.tt2-panel[data-look=modern].tt2-cue-send{outline:2px solid var(--tt2-ready);}
`;

export const Renderer = makeRenderer({ name: 'modern', css });
