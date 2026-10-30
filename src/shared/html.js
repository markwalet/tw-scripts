// shared/html.js — a small, forgiving HTML/XML reader for the pages we fetch (TW
// overviews, the world config). Pure JS, no DOM: parsers built on it unit-test in Node
// against saved pages, and the same code runs in the browser. It builds a light element
// tree; it is not a spec-complete HTML parser (it does not need to be: TW's markup is
// regular, and we only read ids, classes, attributes and numbers from it).

/**
 * @typedef {{ tag: string, attrs: Record<string, string>, children: Node[], parent: El | null }} El
 * @typedef {{ tag: '#text', text: string, parent: El | null }} Text
 * @typedef {El | Text} Node
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea']);
const CELL = new Set(['td', 'th']);
const TABLE_SECTION = new Set(['table', 'thead', 'tbody', 'tfoot']);

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" });

/** @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/**
 * Parse markup into a tree. Unknown/mismatched close tags are ignored; an opening
 * td/th/tr implicitly closes the previous one (the HTML table rules TW pages rely on).
 * @param {string} src
 * @returns {El}
 */
export function parseHtml(src) {
  /** @type {El} */
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  /** @type {El[]} */
  const stack = [root];
  const top = () => stack[stack.length - 1];
  /** @param {string} text */
  const addText = (text) => {
    if (text) top().children.push({ tag: '#text', text: decodeEntities(text), parent: top() });
  };
  /**
   * Close the nearest open element matching `closes`, unless a `stopAt` element is
   * nearer (an inner table boundary).
   * @param {(tag: string) => boolean} closes
   * @param {(tag: string) => boolean} stopAt
   */
  const popWhile = (closes, stopAt) => {
    for (let i = stack.length - 1; i > 0; i--) {
      const t = stack[i].tag;
      if (stopAt(t)) return;
      if (closes(t)) {
        stack.length = i;
        return;
      }
    }
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      addText(src.slice(i));
      break;
    }
    addText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const end = src.indexOf('>', lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      const tag = src.slice(lt + 2, end < 0 ? n : end).trim().toLowerCase();
      i = end < 0 ? n : end + 1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const m = /^<([a-zA-Z][\w:-]*)/.exec(src.slice(lt, lt + 64));
    if (!m) {
      addText('<');
      i = lt + 1;
      continue;
    }
    const tag = m[1].toLowerCase();
    // Find the tag's end, skipping '>' inside quoted attribute values.
    let j = lt + m[0].length;
    /** @type {string | null} */
    let quote = null;
    for (; j < n; j++) {
      const c = src[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    let attrSrc = src.slice(lt + m[0].length, j);
    const selfClosing = attrSrc.endsWith('/');
    if (selfClosing) attrSrc = attrSrc.slice(0, -1);
    i = j + 1;

    /** @type {Record<string, string>} */
    const attrs = {};
    for (const a of attrSrc.matchAll(ATTR)) {
      attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    }

    if (CELL.has(tag)) popWhile((t) => CELL.has(t), (t) => t === 'tr' || TABLE_SECTION.has(t));
    else if (tag === 'tr') popWhile((t) => t === 'tr', (t) => TABLE_SECTION.has(t));

    /** @type {El} */
    const el = { tag, attrs, children: [], parent: top() };
    top().children.push(el);
    if (RAW.has(tag)) {
      // Case-insensitive search from i (no lowercased copy of the whole page per tag).
      const closeRe = new RegExp(`</${tag}`, 'gi');
      closeRe.lastIndex = i;
      const close = closeRe.exec(src)?.index ?? -1;
      const end = close < 0 ? n : close;
      if (end > i) el.children.push({ tag: '#text', text: src.slice(i, end), parent: el });
      const gt = close < 0 ? n : src.indexOf('>', close);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (!selfClosing && !VOID.has(tag)) stack.push(el);
  }
  return root;
}

/** @param {Node} node @returns {node is El} */
const isEl = (node) => node.tag !== '#text';

/** All descendant elements matching `pred`, in document order. @param {El} node @param {(el: El) => boolean} pred */
export function findAll(node, pred) {
  /** @type {El[]} */
  const out = [];
  /** @param {El} el */
  const walk = (el) => {
    for (const c of el.children) {
      if (!isEl(c)) continue;
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/** First descendant element matching `pred`, or null. @param {El} node @param {(el: El) => boolean} pred */
export function find(node, pred) {
  for (const c of node.children) {
    if (!isEl(c)) continue;
    if (pred(c)) return c;
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
}

/** Direct child elements, optionally filtered by tag. @param {El} node @param {string} [tag] */
export const childElements = (node, tag) =>
  /** @type {El[]} */ (node.children.filter((c) => isEl(c) && (!tag || c.tag === tag)));

/** Concatenated text content. @param {Node} node @returns {string} */
export function textOf(node) {
  if (!isEl(node)) return node.text;
  return node.children.map(textOf).join('');
}

/** @param {El} el @param {string} cls */
export const hasClass = (el, cls) => (el.attrs.class || '').split(/\s+/).includes(cls);

/** Element predicate by tag and/or class and/or id. @param {{ tag?: string, cls?: string, id?: string }} q */
export const is = ({ tag, cls, id }) => (/** @type {El} */ el) =>
  (!tag || el.tag === tag) && (!cls || hasClass(el, cls)) && (!id || el.attrs.id === id);

/** Every digit in the text as one integer ("33.140" -> 33140), NaN when there are none. @param {string} s */
export function intOf(s) {
  const digits = s.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : NaN;
}
