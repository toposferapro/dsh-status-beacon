/**
 * dsh-status-beacon — browser half.
 *
 * A coloured dot in the composer tool row, left of the model menu
 * (the conversation.input.right slot). The colour follows the DeepSeek
 * status page scale:
 *
 *   green  — All Systems Operational
 *   yellow — Degraded Performance
 *   orange — Partial Outage
 *   red    — Full Outage / API unreachable
 *   grey   — state unknown (feed unreadable)
 *
 * Clicking opens a panel anchored to the dot with a caret (the same approach
 * as dsh-deepseek-peak-indicator): the panel picks its side — above or below —
 * depending on where there is more room. Styling uses the DSH design tokens
 * (--dsw-alias-*), so the indicator looks like part of the interface and
 * follows the dark theme on its own.
 *
 * Bundle format: this file is served raw by the client-modules host and runs as
 * a classic script, so it registers itself through window.__ModuleLoader__.load()
 * and exports the client-plugin face ({ apply, inject }), like every shipped
 * client bundle.
 */
window.__ModuleLoader__.load({
  id: "dsh-status-beacon",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    const API = "/plugins/dsh-status-beacon/api";
    const PANEL_WIDTH = 340;
    const PANEL_MIN_SPACE = 300;

    /** Traffic-light colours: [main, text colour on a light background]. */
    const TINTS = {
      green: ["#22c55e", "#15803d"],
      yellow: ["#eab308", "#a16207"],
      orange: ["#f97316", "#c2410c"],
      red: ["#ef4444", "#b91c1c"],
      unknown: ["#94a3b8", "#475569"]
    };
    function tintOf(level) { return TINTS[level] || TINTS.unknown; }

    // --- styles ---------------------------------------------------------
    // One injectable stylesheet with the dsb- prefix. Chrome colours come from
    // DSH (--dsw-alias-*); traffic-light colours stay our own variables because
    // they are semantic and must not follow the theme.
    const STYLE_ID = "dsh-status-beacon";
    const STYLES = [
      ".dsb-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;padding:0;margin:0;border:none;border-radius:6px;background:transparent;cursor:pointer;transition:background-color 140ms ease-out,transform 140ms ease-out}",
      ".dsb-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".dsb-btn:active{transform:scale(.88)}",
      ".dsb-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}",
      ".dsb-dot{display:block;width:8px;height:8px;border-radius:50%;transition:box-shadow 140ms ease-out}",
      ".dsb-btn:hover .dsb-dot{box-shadow:0 0 0 5px color-mix(in srgb,currentColor 22%,transparent)}",

      ".dsb-panel{position:fixed;width:" + PANEL_WIDTH + "px;max-width:calc(100vw - 16px);box-sizing:border-box;z-index:1000;border-radius:18px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 18px 48px -14px rgba(0,0,0,.26),0 4px 12px -4px rgba(0,0,0,.12);outline:none;display:flex;flex-direction:column;font:var(--dsw-font-xs-13,13px/1.5 system-ui,sans-serif);overflow:hidden}",
      ".dsb-panel:before{content:\"\";position:absolute;top:0;left:10px;right:10px;height:2px;border-radius:0 0 2px 2px;background:var(--dsb-tint,#94a3b8);opacity:.55;pointer-events:none}",
      ".dsb-caret{position:absolute;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;transform:translateX(-50%)}",
      ".dsb-caret-down{bottom:-7px;border-top:7px solid var(--dsw-alias-bg-layer-2,#fff)}",
      ".dsb-caret-up{top:-7px;border-bottom:7px solid var(--dsw-alias-bg-layer-2,#fff)}",
      "@media (prefers-reduced-motion:no-preference){.dsb-panel{animation:dsb-in 160ms cubic-bezier(.2,.8,.2,1)}}",
      "@keyframes dsb-in{from{opacity:0;transform:translateY(6px) scale(.99)}}",

      ".dsb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 0}",
      ".dsb-eyebrow{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}",
      ".dsb-close{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:14px;line-height:1;cursor:pointer}",
      ".dsb-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}",
      ".dsb-close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}",

      ".dsb-status{display:flex;align-items:center;padding:10px 16px 0}",
      ".dsb-pill{display:inline-flex;align-items:center;gap:7px;padding:3px 10px;border-radius:999px;font-size:11px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:color-mix(in srgb,var(--dsb-tint,#94a3b8) 13%,transparent);color:var(--dsb-tint-text,#334155)}",
      ".dsb-pill-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}",

      ".dsb-hero{margin:12px 16px 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:12px;padding:9px 12px;background:var(--dsw-alias-bg-layer-1,#f8f8f8);display:flex;align-items:baseline;justify-content:space-between;gap:10px}",
      ".dsb-hero-label{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}",
      ".dsb-hero-value{font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:26px;line-height:32px;font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.02em}",
      ".dsb-hero-unit{font-size:12px;color:var(--dsw-alias-label-tertiary,#777);margin-left:3px}",

      ".dsb-sec{padding:12px 16px 0;display:flex;flex-direction:column;gap:6px}",
      ".dsb-sec-title{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}",
      ".dsb-row{display:flex;gap:10px;align-items:baseline}",
      ".dsb-k{flex:0 0 84px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}",
      ".dsb-v{flex:1 1 auto;min-width:0;word-break:break-word;font-size:12px;font-variant-numeric:tabular-nums}",
      ".dsb-chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;background:color-mix(in srgb,var(--dsb-tint,#94a3b8) 13%,transparent);color:var(--dsb-tint-text,#334155)}",
      ".dsb-desc{white-space:pre-wrap}",
      ".dsb-foot{margin-top:12px;padding:8px 16px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));color:var(--dsw-alias-label-tertiary,#777);font-size:11px;font-variant-numeric:tabular-nums;display:flex;justify-content:space-between;gap:8px}"
    ].join("\n");

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = STYLES;
      document.head.appendChild(el);
      return () => { el.remove(); };
    }

    // --- helpers --------------------------------------------------------
    /** Where to open the panel (above or below) and where to put the caret. */
    function panelStyle(rect) {
      const spaceAbove = rect.top;
      const spaceBelow = typeof window !== "undefined" ? window.innerHeight - rect.bottom : 0;
      const above = spaceAbove > PANEL_MIN_SPACE || spaceBelow <= PANEL_MIN_SPACE;
      const rightOffset = Math.max(8, window.innerWidth - rect.right);
      const panelLeft = window.innerWidth - rightOffset - PANEL_WIDTH;
      const caretLeft = rect.left + rect.width / 2 - panelLeft;
      return {
        above,
        right: rightOffset,
        top: above ? undefined : rect.bottom + 10,
        bottom: above ? window.innerHeight - rect.top + 10 : undefined,
        caretLeft: Math.min(PANEL_WIDTH - 16, Math.max(16, caretLeft))
      };
    }

    function rel(ms) {
      if (!ms) return "";
      const diff = Date.now() - ms;
      const m = Math.round(diff / 60000);
      if (Math.abs(m) < 1) return "just now";
      if (Math.abs(m) < 60) return m + " min ago";
      const h = Math.round(m / 60);
      if (Math.abs(h) < 24) return h + " h ago";
      return Math.round(h / 24) + " d ago";
    }

    function fmtTime(ms) {
      if (!ms) return "—";
      return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function fmtDateTime(ms) {
      if (!ms) return "—";
      return new Date(ms).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function Row(k, v) {
      if (v === null || v === undefined || v === "") return null;
      return react.createElement("div", { className: "dsb-row", key: k },
        react.createElement("div", { className: "dsb-k" }, k),
        react.createElement("div", { className: "dsb-v" }, v));
    }

    // --- panel ----------------------------------------------------------
    function Panel({ st, onClose }) {
      const [tint, tintText] = tintOf(st ? st.level : "unknown");
      const wrapStyle = { "--dsb-tint": tint, "--dsb-tint-text": tintText };

      const head = react.createElement("div", { className: "dsb-head", key: "h" },
        react.createElement("div", { className: "dsb-eyebrow" }, "DeepSeek API"),
        react.createElement("button", {
          className: "dsb-close", type: "button", "aria-label": "Close",
          onClick: onClose
        }, "\u00d7"));

      if (!st) {
        return react.createElement("div", { style: wrapStyle },
          head,
          react.createElement("div", { className: "dsb-sec" },
            react.createElement("div", { className: "dsb-v" }, "The host half has not responded yet.")));
      }

      const rows = [];
      rows.push(head);
      rows.push(react.createElement("div", { className: "dsb-status", key: "s" },
        react.createElement("span", { className: "dsb-pill" },
          react.createElement("span", { className: "dsb-pill-dot" }),
          st.stateLabel || st.state || "unknown")));

      // API response latency.
      if (st.latencyMs != null) {
        rows.push(react.createElement("div", { className: "dsb-hero", key: "hero" },
          react.createElement("div", { className: "dsb-hero-label" }, "API latency"),
          react.createElement("div", { className: "dsb-hero-value" },
            String(st.latencyMs), react.createElement("span", { className: "dsb-hero-unit" }, "ms"))));
      }

      // Latest incident: stage, timing, components and description.
      if (st.incident) {
        const inc = st.incident;
        rows.push(react.createElement("div", { className: "dsb-sec", key: "inc" },
          react.createElement("div", { className: "dsb-sec-title" },
            inc.active ? "Active incident" : "Last incident (resolved)"),
          react.createElement("div", { className: "dsb-row" },
            react.createElement("div", { className: "dsb-k" }, "Stage"),
            react.createElement("div", { className: "dsb-v" },
              react.createElement("span", {
                className: "dsb-chip",
                style: { background: inc.active ? "color-mix(in srgb,var(--dsb-tint) 13%,transparent)" : undefined,
                         color: inc.active ? "var(--dsb-tint-text)" : undefined }
              }, inc.phaseLabel || inc.phase))),
          Row("Title", inc.title),
          Row("Started", inc.startedAtMs ? fmtDateTime(inc.startedAtMs) + " (" + rel(inc.startedAtMs) + ")" : null),
          Row("Affected", inc.components),
          inc.description
            ? react.createElement("div", { className: "dsb-row" },
                react.createElement("div", { className: "dsb-k" }, "Description"),
                react.createElement("div", { className: "dsb-v dsb-desc" }, inc.description))
            : null));

        if (inc.link) {
          rows.push(react.createElement("div", { className: "dsb-sec", key: "lnk" },
            react.createElement("a", {
              href: inc.link, target: "_blank", rel: "noreferrer",
              style: { color: "var(--dsw-alias-state-business-primary,#4176e6)", fontSize: "12px" }
            }, "Open the incident on status.deepseek.com")));
        }
      } else if (st.rssError) {
        rows.push(react.createElement("div", { className: "dsb-sec", key: "rsserr" },
          react.createElement("div", { className: "dsb-sec-title" }, "Status feed"),
          react.createElement("div", { className: "dsb-v" }, "unavailable: " + st.rssError)));
      } else {
        rows.push(react.createElement("div", { className: "dsb-sec", key: "noint" },
          react.createElement("div", { className: "dsb-sec-title" }, "No incidents"),
          react.createElement("div", { className: "dsb-v" }, "The feed is empty — nothing has been reported recently.")));
      }

      rows.push(react.createElement("div", { className: "dsb-foot", key: "f" },
        react.createElement("span", null, "Checked ", fmtTime(st.checkedAt), " (", rel(st.checkedAt), ")"),
        react.createElement("span", null, st.reachable === true ? "API responding" : st.reachable === false ? "API silent" : "no response")));

      return react.createElement("div", { style: wrapStyle }, rows);
    }

    // --- dot + popover --------------------------------------------------
    function StatusDot() {
      const [st, setSt] = react.useState(null);
      const [open, setOpen] = react.useState(false);
      const [style, setStyle] = react.useState(null);
      const btnRef = react.useRef(null);
      const panelRef = react.useRef(null);

      react.useEffect(() => {
        let alive = true;
        const tick = () => fetch(API, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => { if (alive) setSt(d); })
          .catch(() => {});
        tick();
        const id = setInterval(tick, 30000);
        return () => { alive = false; clearInterval(id); };
      }, []);

      // On open, measure the dot and decide which side the panel takes.
      react.useEffect(() => {
        if (!open) return undefined;
        const place = () => {
          if (btnRef.current) setStyle(panelStyle(btnRef.current.getBoundingClientRect()));
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
          window.removeEventListener("resize", place);
          window.removeEventListener("scroll", place, true);
        };
      }, [open]);

      // Close on outside click and on Escape.
      react.useEffect(() => {
        if (!open) return undefined;
        const onDown = (event) => {
          if (panelRef.current && !panelRef.current.contains(event.target) && !btnRef.current?.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("pointerdown", onDown);
          document.removeEventListener("keydown", onKey);
        };
      }, [open]);

      const [dotColor] = tintOf(st ? st.level : "unknown");
      const [panelTint, panelTintText] = tintOf(st ? st.level : "unknown");
      const title = st ? (st.stateLabel || st.level) : "checking DeepSeek API availability…";

      return react.createElement(react.Fragment, null, [
        react.createElement("button", {
          key: "btn",
          ref: btnRef,
          type: "button",
          className: "dsb-btn",
          title,
          "aria-label": title,
          "aria-expanded": open,
          onClick: (event) => { event.stopPropagation(); setOpen((v) => !v); }
        }, react.createElement("span", {
          className: "dsb-dot",
          style: {
            background: dotColor,
            color: dotColor,
            boxShadow: "0 0 0 3px color-mix(in srgb," + dotColor + " 22%,transparent)"
          }
        })),
        open && style
          ? react.createElement("div", {
              key: "panel",
              ref: panelRef,
              role: "dialog",
              "aria-label": "DeepSeek API status",
              tabIndex: -1,
              className: "dsb-panel",
              style: {
                right: style.right,
                ...(style.above ? { bottom: style.bottom } : { top: style.top }),
                // The tint lives on the PANEL itself: :before reads it too, and
                // custom properties inherit downwards only.
                "--dsb-tint": panelTint,
                "--dsb-tint-text": panelTintText
              }
            }, [
              react.createElement("span", {
                key: "caret",
                className: "dsb-caret " + (style.above ? "dsb-caret-down" : "dsb-caret-up"),
                style: { left: style.caretLeft }
              }),
              react.createElement(Panel, { key: "body", st, onClose: () => setOpen(false) })
            ])
          : null
      ]);
    }

    const inject = ["slots"];
    function apply(ctx) {
      try {
        ctx.effect(injectStyles, "dsh-status-beacon: styles");
        ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
          name: "conversation.input.right",
          id: "dsh-status-beacon",
          order: 5
        }, StatusDot));
      } catch (error) {
        console.error("[dsh-status-beacon] registration failed:", error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
