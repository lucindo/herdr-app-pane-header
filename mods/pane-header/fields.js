// What the header shows for a pane under the pane-heads contract (CONTRACT.md). No Herdr
// imports, so the tests can load it.

export const HEADS_KEY = "pane-heads";
export const HEADERS_KEY = "pane-heads-headers";
// Header mods that draw `actions`, for publishers that read only this (contract v0).
export const ACTIONS_KEY = "pane-heads-actions";

export const VERSION = 1;
// The entry fields this header draws, and terminal labels.
export const DRAWS = ["title", "icon", "color", "detail", "badge", "info", "actions", "labels"];

const LABEL = "pane-head.";
const TEXT = ["title", "detail", "badge", "info"];

const text = (v) => (typeof v === "string" && v !== "" ? v : undefined);
/** @returns {v is Record<string, any>} */
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A valid action, or null. Entries come from other mods, so nothing in them is trusted. */
function action(a) {
  if (!isObject(a) || !text(a.command) || !(text(a.icon) || text(a.label))) return null;
  return {
    command: a.command,
    args: isObject(a.args) ? a.args : undefined,
    icon: text(a.icon),
    label: text(a.label),
    tooltip: text(a.tooltip) ?? text(a.label) ?? "",
    selected: a.selected === true,
    gap: a.gap === true,
  };
}

/**
 * What the header shows for a pane: its `pane-heads` entry, then its terminal's `pane-head.*`
 * labels, field by field. Labels set with `pane-head.while=agent` count only while an agent
 * reports a status there. Missing or invalid fields are left out; `actions` is always a list.
 * @param {unknown} entry
 * @param {Record<string, string> | null | undefined} labels
 * @param {string | null | undefined} status
 */
export function resolve(entry, labels, status) {
  const e = isObject(entry) ? entry : {};
  const l = labels && (labels[`${LABEL}while`] !== "agent" || status != null) ? labels : {};
  /** @type {{ title?: string, icon?: string, color: boolean, detail?: string, badge?: string, info?: string, actions: ReturnType<typeof action>[] }} */
  const out = { color: e.color === true, actions: [] };
  for (const f of TEXT) {
    const v = text(e[f]) ?? text(l[LABEL + f]);
    if (v !== undefined) out[f] = v;
  }
  const icon = text(e.icon);
  if (icon !== undefined) out.icon = icon;
  if (Array.isArray(e.actions)) out.actions = e.actions.map(action).filter(Boolean);
  return out;
}

/** A path under `home` as `~/…`. */
export function tilde(path, home) {
  if (!path) return "";
  return path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

/** The pane frame of the first visible tab block: hidden nodes skipped, a stack's shown child only. */
export function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter((c) => !c.hidden);
    children = [visible.find((c) => c.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

/** `pane-heads-headers` with this header registered, or null when it already is. */
export function withHeader(headers, self) {
  const mine = { version: VERSION, draws: DRAWS };
  const all = isObject(headers) ? headers : {};
  return JSON.stringify(all[self]) === JSON.stringify(mine) ? null : { ...all, [self]: mine };
}

/** `pane-heads-actions` with this header in it, or null when it already is. */
export function withActions(list, self) {
  const all = Array.isArray(list) ? list : [];
  return all.includes(self) ? null : [...all, self];
}
