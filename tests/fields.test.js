import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAWS, VERSION, paneFrame, resolve, tilde, withActions, withHeader } from "../mods/pane-header/fields.js";

test("resolve: nothing published is no fields and no actions", () => {
  assert.deepEqual(resolve(undefined, null, null), { color: false, actions: [] });
  assert.deepEqual(resolve("junk", undefined, "idle"), { color: false, actions: [] });
});

test("resolve: the entry's fields win over the labels, field by field", () => {
  const f = resolve({ title: "Reviewer", badge: "2 unsent" }, { "pane-head.title": "shell", "pane-head.info": "port 3000" }, null);
  assert.equal(f.title, "Reviewer");
  assert.equal(f.badge, "2 unsent");
  assert.equal(f.info, "port 3000");
});

test("resolve: only pane-head.* labels count, and only the text fields", () => {
  const f = resolve(null, { "claude.info": "x", "pane-head.icon": "a.svg", "pane-head.detail": "~/src" }, null);
  assert.deepEqual(f, { color: false, actions: [], detail: "~/src" });
});

test("resolve: pane-head.while=agent shows the labels only while an agent reports", () => {
  const labels = { "pane-head.info": "Opus 5.5", "pane-head.while": "agent" };
  assert.equal(resolve(null, labels, null).info, undefined);
  assert.equal(resolve(null, labels, "idle").info, "Opus 5.5");
  assert.equal(resolve(null, labels, "working").info, "Opus 5.5");
});

test("resolve: an entry's fields show whatever the labels' while says", () => {
  const f = resolve({ info: "mine" }, { "pane-head.while": "agent" }, null);
  assert.equal(f.info, "mine");
});

test("resolve: fields that aren't non-empty strings are left out", () => {
  const f = resolve({ title: 3, detail: "", badge: null, info: ["x"], icon: {} }, null, null);
  assert.deepEqual(f, { color: false, actions: [] });
});

test("resolve: icon and color come from the entry only", () => {
  assert.deepEqual(resolve({ icon: "mods/x/i.svg", color: true }, null, null), { color: true, actions: [], icon: "mods/x/i.svg" });
  assert.equal(resolve({ color: "yes" }, null, null).color, false);
});

test("resolve: actions keep their order; invalid ones are dropped", () => {
  const f = resolve({ actions: [
    { command: "r.a", label: "A" },
    { label: "no command" },
    { command: "r.b" },
    null,
    { command: "r.c", icon: "mods/r/c.svg", tooltip: "C", selected: true, gap: true },
  ] }, null, null);
  assert.deepEqual(f.actions.map((a) => a.command), ["r.a", "r.c"]);
  assert.deepEqual(f.actions[0], { command: "r.a", args: undefined, icon: undefined, label: "A", tooltip: "A", selected: false, gap: false });
  assert.deepEqual(f.actions[1], { command: "r.c", args: undefined, icon: "mods/r/c.svg", label: undefined, tooltip: "C", selected: true, gap: true });
});

test("resolve: an action's args pass through only as an object", () => {
  const f = resolve({ actions: [
    { command: "pane.split", label: "S", args: { direction: "down" } },
    { command: "pane.zoom", label: "Z", args: ["x"] },
  ] }, null, null);
  assert.deepEqual(f.actions[0].args, { direction: "down" });
  assert.equal(f.actions[1].args, undefined);
});

test("resolve: actions that aren't a list are none", () => {
  assert.deepEqual(resolve({ actions: { command: "r.a", label: "A" } }, null, null).actions, []);
});

test("tilde: paths under home start with ~, others stay", () => {
  assert.equal(tilde("/Users/me", "/Users/me"), "~");
  assert.equal(tilde("/Users/me/Code", "/Users/me"), "~/Code");
  assert.equal(tilde("/Users/meow", "/Users/me"), "/Users/meow");
  assert.equal(tilde("No folder", "/Users/me"), "No folder");
  assert.equal(tilde(null, "/Users/me"), "");
});

const frame = { header: { content: { mod: "pane-header" } } };
const tab = (id, extra = {}) => ({ id, type: "block", content: { tab: "active", pane: frame }, ...extra });

test("paneFrame: finds the tab block's frame in nested rows", () => {
  assert.equal(paneFrame({ type: "row", children: [{ id: "side", type: "block" }, { type: "column", children: [tab("main")] }] }), frame);
});

test("paneFrame: skips hidden nodes", () => {
  const other = { header: { content: { mod: "pane" } } };
  const layout = { type: "row", children: [tab("a", { hidden: true }), { id: "b", type: "block", content: { tab: "active", pane: other } }] };
  assert.equal(paneFrame(layout), other);
});

test("paneFrame: in a stack, follows only the shown child", () => {
  const other = { header: { content: { mod: "pane" } } };
  const stack = { type: "stack", active: "b", children: [tab("a"), { id: "b", type: "block", content: { tab: "active", pane: other } }] };
  assert.equal(paneFrame(stack), other);
  assert.equal(paneFrame({ ...stack, active: "gone" }), frame);
});

test("paneFrame: a tab block without a frame is none", () => {
  assert.equal(paneFrame({ type: "row", children: [{ type: "block", content: { tab: "active" } }] }), null);
  assert.equal(paneFrame(null), null);
});

test("withHeader: adds this header, keeps others, and is null once registered", () => {
  const next = withHeader({ other: { version: 1, draws: ["title"] } }, "pane-header");
  assert.deepEqual(next, { other: { version: 1, draws: ["title"] }, "pane-header": { version: VERSION, draws: DRAWS } });
  assert.equal(withHeader(next, "pane-header"), null);
});

test("withHeader: replaces an older registration and junk", () => {
  assert.deepEqual(withHeader({ "pane-header": { version: 0, draws: [] } }, "pane-header"), { "pane-header": { version: VERSION, draws: DRAWS } });
  assert.deepEqual(withHeader("junk", "pane-header"), { "pane-header": { version: VERSION, draws: DRAWS } });
});

test("withActions: adds this header once", () => {
  assert.deepEqual(withActions(["pane-plus"], "pane-header"), ["pane-plus", "pane-header"]);
  assert.equal(withActions(["pane-plus", "pane-header"], "pane-header"), null);
  assert.deepEqual(withActions(undefined, "pane-header"), ["pane-header"]);
});
