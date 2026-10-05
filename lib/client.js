/**
 * dsh-status-indicator — browser half.
 *
 * Цветная точка в ряду инструментов редактора, слева от меню модели (слот
 * conversation.input.right). Цвет повторяет шкалу страницы статуса DeepSeek:
 *
 *   зелёный   — All Systems Operational
 *   жёлтый    — Degraded Performance
 *   оранжевый — Partial Outage
 *   красный   — Full Outage / API не отвечает
 *   серый     — состояние неизвестно (ленту не прочитать)
 *
 * Клик открывает панель, привязанную к точке кареткой (как в
 * dsh-deepseek-peak-indicator): панель сама выбирает сторону - вверх или вниз,
 * смотря где больше места. Оформление - на переменных самого DSH
 * (--dsw-alias-*), поэтому светофор выглядит частью интерфейса и сам темнеет
 * в тёмной теме.
 *
 * Формат бандла: файл отдаётся как есть через client-modules и выполняется как
 * классический скрипт, поэтому регистрируется через window.__ModuleLoader__.load()
 * и отдаёт наружу { apply, inject }, как все встроенные клиентские пакеты.
 */
window.__ModuleLoader__.load({
  id: "dsh-status-indicator",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");

    const API = "/plugins/dsh-status-indicator/api";
    const PANEL_WIDTH = 340;
    const PANEL_MIN_SPACE = 300;

    /** Цвета светофора: [основной, цвет текста на светлой подложке]. */
    const TINTS = {
      green: ["#22c55e", "#15803d"],
      yellow: ["#eab308", "#a16207"],
      orange: ["#f97316", "#c2410c"],
      red: ["#ef4444", "#b91c1c"],
      unknown: ["#94a3b8", "#475569"]
    };
    function tintOf(level) { return TINTS[level] || TINTS.unknown; }

    // --- styles ---------------------------------------------------------
    // Один подключаемый набор стилей с префиксом dsi-. Цвета хрома берём у DSH
    // (--dsw-alias-*), а цвета светофора задаём своими переменными: они
    // смысловые и не должны зависеть от темы.
    const STYLE_ID = "dsh-status-indicator";
    const STYLES = [
      ".dsi-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;padding:0;margin:0;border:none;border-radius:6px;background:transparent;cursor:pointer;transition:background-color 140ms ease-out,transform 140ms ease-out}",
      ".dsi-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".dsi-btn:active{transform:scale(.88)}",
      ".dsi-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}",
      ".dsi-dot{display:block;width:8px;height:8px;border-radius:50%;transition:box-shadow 140ms ease-out}",
      ".dsi-btn:hover .dsi-dot{box-shadow:0 0 0 5px color-mix(in srgb,currentColor 22%,transparent)}",

      ".dsi-panel{position:fixed;width:" + PANEL_WIDTH + "px;max-width:calc(100vw - 16px);box-sizing:border-box;z-index:1000;border-radius:18px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 18px 48px -14px rgba(0,0,0,.26),0 4px 12px -4px rgba(0,0,0,.12);outline:none;display:flex;flex-direction:column;font:var(--dsw-font-xs-13,13px/1.5 system-ui,sans-serif);overflow:hidden}",
      ".dsi-panel:before{content:\"\";position:absolute;top:0;left:10px;right:10px;height:2px;border-radius:0 0 2px 2px;background:var(--dsi-tint,#94a3b8);opacity:.55;pointer-events:none}",
      ".dsi-caret{position:absolute;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;transform:translateX(-50%)}",
      ".dsi-caret-down{bottom:-7px;border-top:7px solid var(--dsw-alias-bg-layer-2,#fff)}",
      ".dsi-caret-up{top:-7px;border-bottom:7px solid var(--dsw-alias-bg-layer-2,#fff)}",
      "@media (prefers-reduced-motion:no-preference){.dsi-panel{animation:dsi-in 160ms cubic-bezier(.2,.8,.2,1)}}",
      "@keyframes dsi-in{from{opacity:0;transform:translateY(6px) scale(.99)}}",

      ".dsi-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 0}",
      ".dsi-eyebrow{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}",
      ".dsi-close{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:14px;line-height:1;cursor:pointer}",
      ".dsi-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}",
      ".dsi-close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}",

      ".dsi-status{display:flex;align-items:center;padding:10px 16px 0}",
      ".dsi-pill{display:inline-flex;align-items:center;gap:7px;padding:3px 10px;border-radius:999px;font-size:11px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:color-mix(in srgb,var(--dsi-tint,#94a3b8) 13%,transparent);color:var(--dsi-tint-text,#334155)}",
      ".dsi-pill-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}",

      ".dsi-hero{margin:12px 16px 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:12px;padding:9px 12px;background:var(--dsw-alias-bg-layer-1,#f8f8f8);display:flex;align-items:baseline;justify-content:space-between;gap:10px}",
      ".dsi-hero-label{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}",
      ".dsi-hero-value{font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:26px;line-height:32px;font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.02em}",
      ".dsi-hero-unit{font-size:12px;color:var(--dsw-alias-label-tertiary,#777);margin-left:3px}",

      ".dsi-sec{padding:12px 16px 0;display:flex;flex-direction:column;gap:6px}",
      ".dsi-sec-title{color:var(--dsw-alias-label-secondary,#555);font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}",
      ".dsi-row{display:flex;gap:10px;align-items:baseline}",
      ".dsi-k{flex:0 0 84px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}",
      ".dsi-v{flex:1 1 auto;min-width:0;word-break:break-word;font-size:12px;font-variant-numeric:tabular-nums}",
      ".dsi-chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;background:color-mix(in srgb,var(--dsi-tint,#94a3b8) 13%,transparent);color:var(--dsi-tint-text,#334155)}",
      ".dsi-desc{white-space:pre-wrap}",
      ".dsi-foot{margin-top:12px;padding:8px 16px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));color:var(--dsw-alias-label-tertiary,#777);font-size:11px;font-variant-numeric:tabular-nums;display:flex;justify-content:space-between;gap:8px}"
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
    /** Куда открыть панель: вверх или вниз, и где поставить каретку. */
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
      if (Math.abs(m) < 1) return "только что";
      if (Math.abs(m) < 60) return m + " мин назад";
      const h = Math.round(m / 60);
      if (Math.abs(h) < 24) return h + " ч назад";
      return Math.round(h / 24) + " дн назад";
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
      return react.createElement("div", { className: "dsi-row", key: k },
        react.createElement("div", { className: "dsi-k" }, k),
        react.createElement("div", { className: "dsi-v" }, v));
    }

    // --- panel ----------------------------------------------------------
    function Panel({ st, onClose }) {
      const [tint, tintText] = tintOf(st ? st.level : "unknown");
      const wrapStyle = { "--dsi-tint": tint, "--dsi-tint-text": tintText };

      const head = react.createElement("div", { className: "dsi-head", key: "h" },
        react.createElement("div", { className: "dsi-eyebrow" }, "DeepSeek API"),
        react.createElement("button", {
          className: "dsi-close", type: "button", "aria-label": "Закрыть",
          onClick: onClose
        }, "\u00d7"));

      if (!st) {
        return react.createElement("div", { style: wrapStyle },
          head,
          react.createElement("div", { className: "dsi-sec" },
            react.createElement("div", { className: "dsi-v" }, "Хост-часть плагина ещё не ответила.")));
      }

      const rows = [];
      rows.push(head);
      rows.push(react.createElement("div", { className: "dsi-status", key: "s" },
        react.createElement("span", { className: "dsi-pill" },
          react.createElement("span", { className: "dsi-pill-dot" }),
          st.stateLabel || st.state || "неизвестно")));

      // Задержка ответа API.
      if (st.latencyMs != null) {
        rows.push(react.createElement("div", { className: "dsi-hero", key: "hero" },
          react.createElement("div", { className: "dsi-hero-label" }, "Задержка API"),
          react.createElement("div", { className: "dsi-hero-value" },
            String(st.latencyMs), react.createElement("span", { className: "dsi-hero-unit" }, "мс"))));
      }

      // Последний инцидент - со стадией, временем, службами и описанием.
      if (st.incident) {
        const inc = st.incident;
        rows.push(react.createElement("div", { className: "dsi-sec", key: "inc" },
          react.createElement("div", { className: "dsi-sec-title" },
            inc.active ? "Активный инцидент" : "Последний инцидент (закрыт)"),
          react.createElement("div", { className: "dsi-row" },
            react.createElement("div", { className: "dsi-k" }, "Стадия"),
            react.createElement("div", { className: "dsi-v" },
              react.createElement("span", {
                className: "dsi-chip",
                style: { background: inc.active ? "color-mix(in srgb,var(--dsi-tint) 13%,transparent)" : undefined,
                         color: inc.active ? "var(--dsi-tint-text)" : undefined }
              }, inc.phaseLabel || inc.phase))),
          Row("Заголовок", inc.title),
          Row("Начат", inc.startedAtMs ? fmtDateTime(inc.startedAtMs) + " (" + rel(inc.startedAtMs) + ")" : null),
          Row("Затронуто", inc.components),
          inc.description
            ? react.createElement("div", { className: "dsi-row" },
                react.createElement("div", { className: "dsi-k" }, "Описание"),
                react.createElement("div", { className: "dsi-v dsi-desc" }, inc.description))
            : null));

        if (inc.link) {
          rows.push(react.createElement("div", { className: "dsi-sec", key: "lnk" },
            react.createElement("a", {
              href: inc.link, target: "_blank", rel: "noreferrer",
              style: { color: "var(--dsw-alias-state-business-primary,#4176e6)", fontSize: "12px" }
            }, "Открыть инцидент на status.deepseek.com")));
        }
      } else if (st.rssError) {
        rows.push(react.createElement("div", { className: "dsi-sec", key: "rsserr" },
          react.createElement("div", { className: "dsi-sec-title" }, "Статус-лента"),
          react.createElement("div", { className: "dsi-v" }, "недоступна: " + st.rssError)));
      } else {
        rows.push(react.createElement("div", { className: "dsi-sec", key: "noint" },
          react.createElement("div", { className: "dsi-sec-title" }, "Инцидентов нет"),
          react.createElement("div", { className: "dsi-v" }, "Лента пуста - за последнее время сбоев не объявляли.")));
      }

      rows.push(react.createElement("div", { className: "dsi-foot", key: "f" },
        react.createElement("span", null, "Проверено ", fmtTime(st.checkedAt), " (", rel(st.checkedAt), ")"),
        react.createElement("span", null, st.reachable === true ? "API отвечает" : st.reachable === false ? "API молчит" : "нет ответа")));

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

      // При открытии измеряем точку и решаем, куда встать панели.
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

      // Закрытие по клику мимо и по Escape.
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
      const title = st ? (st.stateLabel || st.level) : "проверяю доступность DeepSeek API…";

      return react.createElement(react.Fragment, null, [
        react.createElement("button", {
          key: "btn",
          ref: btnRef,
          type: "button",
          className: "dsi-btn",
          title,
          "aria-label": title,
          "aria-expanded": open,
          onClick: (event) => { event.stopPropagation(); setOpen((v) => !v); }
        }, react.createElement("span", {
          className: "dsi-dot",
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
              "aria-label": "Состояние DeepSeek API",
              tabIndex: -1,
              className: "dsi-panel",
              style: {
                right: style.right,
                ...(style.above ? { bottom: style.bottom } : { top: style.top }),
                // Цвет полоски и пилюли задаём на САМОЙ панели: :before тоже её
                // читает, а вниз переменные наследуются, вверх - нет.
                "--dsi-tint": panelTint,
                "--dsi-tint-text": panelTintText
              }
            }, [
              react.createElement("span", {
                key: "caret",
                className: "dsi-caret " + (style.above ? "dsi-caret-down" : "dsi-caret-up"),
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
        ctx.effect(injectStyles, "dsh-status-indicator: styles");
        ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
          name: "conversation.input.right",
          id: "dsh-status-indicator",
          order: 5
        }, StatusDot));
      } catch (error) {
        console.error("[dsh-status-indicator] registration failed:", error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
