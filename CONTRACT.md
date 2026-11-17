# Pane header contract

Version 1, draft (2026-11-17).

A pane header is a mod that a layout draws on each pane of its tab block:
`"pane": { "header": { "content": { "mod": "<name>" } } }`. Herdr runs one copy per pane and gives
it `props()` = `{ pane, terminal }`. Herdr's stock header, `pane`, shows the pane's program,
title, folder and agent status. A mod pane can't change any of that, and a program in a terminal
can only set the terminal's title.

This contract lets them. A **publisher** (a mod pane, or a program in a terminal) says what its
pane's header should show: a title, an icon, a detail, a badge, an info text and buttons. A
**header** that follows the contract draws them. A publisher checks whether the shown layout's
header does, and keeps its own controls when it doesn't.

Everything goes through Herdr's shared state (`shared`, `setShared`) and terminal labels
(`hc label`). Publishers and headers never import each other, and either side can be missing.

## Shared keys

| Key | Written by | Holds |
|---|---|---|
| `pane-heads` | publishers | `{ "<pane id>": Entry }`, one entry per pane |
| `pane-heads-headers` | headers | `{ "<header mod>": { "version": 1, "draws": [field, ...] } }` |
| `pane-heads-actions` | headers | `["<header mod>", ...]`: the headers that draw `actions` (kept for v0 publishers) |

## Entry

Every field is optional. A header ignores fields it doesn't know.

| Field | Type | Shown |
|---|---|---|
| `title` | string | In place of the pane's name. |
| `icon` | string | Before the title, in place of the program's icon. A path from the Herdr home (`mods/<mod>/icon.svg`), tinted with the header's text color. |
| `color` | boolean | `true` draws `icon` in its own colors instead of tinted. |
| `detail` | string | In place of the folder. A path under the home folder shows as `~/…`. It is the first thing to shrink when the pane is narrow. |
| `badge` | string | A label in the theme's accent, for something to notice: `3 unsent`. |
| `info` | string | Muted text near the end of the header, kept whole: a model, a port. |
| `actions` | Action[] | Buttons after the title, in this order. |

### Action

| Field | Type | |
|---|---|---|
| `command` | string, required | What a click runs: a mod command (`reviewer.scope-branch`) or an app command (`pane.zoom`). |
| `args` | object | Passed as `run(command, args)`. Only app commands take arguments: a mod command reaches `nextCommand()` as its name alone, so put the choice in the name. |
| `icon` | string | A path to an SVG, tinted, as the entry's `icon`. |
| `label` | string | Text, used when there's no `icon`. An action needs `icon` or `label`. |
| `tooltip` | string | Shown on hover. Defaults to `label`. |
| `selected` | boolean | Drawn as switched on. |
| `gap` | boolean | Extra space before this action, to start a group. |

A click runs `pane.focus { pane }`, then `run(command, args)`. The focus comes first because
Herdr delivers `<mod>.<command>` only to the focused copy of that mod.

## Terminal labels

A program in a terminal can't write shared state, but it can label its own terminal.
`$HC_TERMINAL_ID` holds the terminal's address, and `key=` removes a label:

```sh
hc label "$HC_TERMINAL_ID" "pane-head.info=Opus 5.5 · high · 120k/1m 12%" pane-head.while=agent
```

| Label | Means |
|---|---|
| `pane-head.title` | The entry's `title`. |
| `pane-head.detail` | The entry's `detail`. |
| `pane-head.badge` | The entry's `badge`. |
| `pane-head.info` | The entry's `info`. |
| `pane-head.while=agent` | Show this terminal's `pane-head.*` labels only while an agent reports a status in it. |

Labels outlive the program that set them, and an agent that crashes can't clear its own:
`pane-head.while=agent` hides them once the agent stops reporting. Labels carry text only, no
icon and no actions.

For each field, a `pane-heads` entry wins over a label, and a label over the header's own default.

## What a header does

1. When it starts (not while `checking()`), it adds itself, under its mod folder name, to
   `pane-heads-headers` as `{ "version": 1, "draws": [...] }`. `draws` lists the entry fields it
   draws, plus `"labels"` if it reads terminal labels. If it draws `actions`, it also adds its
   name to `pane-heads-actions`.
2. On each render it reads `shared("pane-heads")?.[props().pane]` and, for a terminal pane, that
   terminal's `labels` from `terminals()`. Herdr re-renders it when either changes.
3. It draws every field listed in its `draws`, in place of its own default.
4. Actions keep their order and their place. Buttons shown on hover (split, zoom, close) take
   their room from the detail, not from the actions.
5. A click on an action focuses the pane first, as above.

Registering says what a header mod can do, not that it is shown. Entries stay when the layout
changes, so publishers check the shown layout's header themselves.

## What a publisher does

### Find your pane

A header gets its pane id in `props()`; a mod pane doesn't. Pass your tab in the props you split
with (`pane.split { direction, mod, props: { tab: focused().tab } }` when splitting the focused
pane), then find your pane in `panes()`:

```js
const pane = panes().find((p) => p.mod === "<mod>" && p.tab === props().tab)?.pane;
```

This works while a tab holds one copy of the mod. Two copies in one tab can't tell their panes
apart (see [For Herdr](#for-herdr)).

### Write your entry

- Write when what the header should show changes, not on every render: `setShared` re-renders
  every mod. Compare with what's there first.
- Read and write in one go, with no `await` between, so another publisher's write isn't lost.
- Drop the entries of panes that are gone from `panes()`. The key is saved to disk, and a crash
  leaves entries behind.
- Remove your entry in `close(cx)`.

```js
import { shared, setShared, panes } from "herdr";

/** Sets this pane's entry, or removes it with `entry` null. */
function publish(pane, entry) {
  const heads = shared("pane-heads") ?? {};
  if (JSON.stringify(heads[pane] ?? null) === JSON.stringify(entry)) return;
  const live = new Set(panes().map((p) => p.pane));
  const rest = Object.fromEntries(Object.entries(heads).filter(([id]) => id !== pane && live.has(id)));
  setShared("pane-heads", entry ? { ...rest, [pane]: entry } : rest);
}
```

### Check the header

Always publish your entry: it costs little, and the person may switch to a layout whose header
draws it. Check the shown header only to decide whether to draw your own copy of what it would
show, usually the actions:

```js
import { layout, shared } from "herdr";

// The pane frame of the first visible tab block: hidden nodes skipped, a stack's shown child only.
function paneFrame(node) {
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

/** Whether the shown layout's pane header draws `field` all the time. */
export function headerDraws(field) {
  const header = paneFrame(layout())?.header;
  // A header shown only on hover would hide the field most of the time.
  if (!header || (header.reveal ?? "always") !== "always") return false;
  const mod = header.content?.mod;
  const h = shared("pane-heads-headers")?.[mod];
  if (h) return h.version >= 1 && h.draws.includes(field);
  // A v0 header: registered only in pane-heads-actions, and draws every v0 field.
  const v0 = ["title", "icon", "color", "detail", "badge", "actions"];
  return v0.includes(field) && (shared("pane-heads-actions") ?? []).includes(mod);
}
```

Keep the fallback. With Herdr's stock `pane`, a mod pane's header shows only the mod's name and
the split, zoom and close buttons.

## Versions

- **v0**: `pane-plus` in herdr-backup, and the reviewer up to `55dbf24`. Entries hold `title`,
  `icon`, `color`, `detail`, `badge` and `actions` without `args`. Headers register only in
  `pane-heads-actions`. No terminal labels.
- **v1**: this document. Adds `info`, action `args`, terminal labels and `pane-heads-headers`.
  Every v0 entry is a valid v1 entry, and v1 headers still write `pane-heads-actions`, so v0
  publishers keep working.

A later version may add fields and keys. It won't change what an existing one means. Publishers
check `draws` for the field they need, not the version number.

## For Herdr

The contract needs only shared state and labels, so Herdr's stock `pane` could follow it as is:
the five steps under [What a header does](#what-a-header-does). Three gaps only Herdr can close:

- A mod pane isn't told its pane id. With `props().pane`, as headers get, two copies of one mod
  in a tab could each publish.
- Mod commands carry no arguments, so an action for a mod command can't pass any.
- A mod can't set its pane's title, so even a plain title needs a header that follows this
  contract.

## Not in v1

- One shared key per pane instead of the `pane-heads` map: a write would re-render less, and
  publishers couldn't drop each other's entries.
- Folding actions into a menu when the pane is too narrow for them.
- An icon from a terminal label.
