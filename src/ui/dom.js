// ui/dom.js — tiny element builder. Replaces the original's .innerHTML string soup with
// structured DOM creation (safer, no parsing-order bugs; DESIGN.md §2).

/**
 * Create an element. Props: className, id, text, html (trusted only), style (object),
 * on (event map), and any other key set as an attribute. Children may be nodes/strings.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'className') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // use sparingly; prefer text/children
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'on' && typeof v === 'object') {
      for (const [evt, fn] of Object.entries(v)) el.addEventListener(evt, /** @type {any} */ (fn));
    } else el.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Inject a <style> block once, keyed by id. */
export function injectStyle(id, css) {
  if (document.getElementById(id)) return;
  const style = h('style', { id, type: 'text/css', text: css });
  document.head.appendChild(style);
}
