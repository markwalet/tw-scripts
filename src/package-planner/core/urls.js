// @ts-check
// package-planner/core/urls.js — sitter parameter on our own requests (DESIGN-package-planner.md §2). Pure.
// TW's request helper adds `&t=<player id>` to its posts when sitting; every GET we make
// ourselves must carry it too, or the server answers for the sitter's own account.

/**
 * @param {string} url
 * @param {{ id?: number | string, sitter?: number | string }} player  game_data.player
 */
export function withSitter(url, player) {
  if (!(parseInt(String(player.sitter), 10) > 0) || /[?&]t=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${player.id}`;
}
