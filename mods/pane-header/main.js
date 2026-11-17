// A pane's header that mod panes and terminal programs can fill in, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane-header" } } } }
// Shows the program's icon (the app's program table), the agent's name or the terminal's title,
// the folder, and the agent's status; buttons split, zoom and close this pane. Props from the
// app: { pane, terminal }. Click: focus the pane.
//
// Based on Herdr's stock `pane` mod 0.1.16 (Apache-2.0). Changed: it draws what a pane publishes
// under the pane-heads contract (CONTRACT.md): a title, icon, detail, badge, info and buttons from
// the shared key `pane-heads`, or text from its terminal's `pane-head.*` labels; it registers
// itself in `pane-heads-headers` and `pane-heads-actions`; the logic is in fields.js.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme as herdrTheme, home, layout, shared, setShared, terminals, checking } from "herdr";
import { ACTIONS_KEY, HEADERS_KEY, HEADS_KEY, paneFrame, resolve, tilde, withActions, withHeader } from "./fields.js";

// `mod.clone` rewrites a mod's own `mods/<name>/` paths, so a clone registers under its own name.
const DIR = "mods/pane-header/";
const SELF = DIR.split("/")[1];

// herdr.d.ts types theme colors as plain strings; gpui-kit wants `#${string}`.
/** @typedef {import("gpui-kit").Color} Color */
const theme = () => /** @type {Record<string, Color>} */ (herdrTheme());

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Pane extends View {
  init() {
    this.hovered = false;
    if (checking()) return;
    // Every pane's copy runs this; only the first finds something to write.
    const headers = withHeader(shared(HEADERS_KEY), SELF);
    if (headers) setShared(HEADERS_KEY, headers);
    const actions = withActions(shared(ACTIONS_KEY), SELF);
    if (actions) setShared(ACTIONS_KEY, actions);
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`${DIR}${icon}.svg`).size(14));
  }

  // Herdr delivers a mod command only to the focused copy of that mod, so focus the pane first.
  action(t, pane, a, i) {
    const el = div()
      .id(`ph-a-${pane}-${i}`)
      .flex_none()
      .h(20)
      .flex()
      .items_center()
      .rounded(4)
      .cursor_pointer()
      .text_color(a.selected ? t.foreground : t.dim)
      .when(a.selected, (e) => e.bg(t.selected))
      .when(a.gap, (e) => e.ml(8))
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(a.tooltip)
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run("pane.focus", { pane });
        run(a.command, a.args);
      });
    return a.icon ? el.px(3).child(svg(a.icon).size(14)) : el.px(6).text_size(11).child(a.label);
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const pane = p.pane;
    const st = p.status;
    const labels = p.terminal ? terminals().find((x) => x.address === p.terminal)?.labels : null;
    const f = resolve(shared(HEADS_KEY)?.[pane], labels, st);
    const name = f.title ?? (((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell");
    const pic = icon(f.icon ?? p.program, 14, t.dim);
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      // Actions sit before the folder, which gives up its room to the hover buttons, so they never move.
      .when(f.actions.length > 0, el => el.child(h_flex().flex_none().gap(2).items_center()
        .children(f.actions.map((a, i) => this.action(t, pane, a, i)))))
      .when(Boolean(f.badge), el => el.child(div().flex_none().px(6).rounded(4).bg(t.accent).text_color(t.accent_foreground).text_size(11).child(f.badge)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(tilde(f.detail ?? p.cwd, home())))
      .when(Boolean(f.info), el => el.child(div().flex_none().text_color(t.muted).child(f.info)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(/** @type {Color} */ (t.blocked + "26")).text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
