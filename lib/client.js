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
 * Клик открывает панель: состояние службы, последний инцидент с его стадией
 * жизненного цикла (Investigating…Resolved), время начала, затронутые службы,
 * описание, задержка ответа API и время проверки.
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
    const COLORS = {
      green: "#22c55e",
      yellow: "#eab308",
      orange: "#f97316",
      red: "#ef4444",
      unknown: "#94a3b8"
    };

    function injectStyles() {
      if (document.getElementById("dsh-status-style")) return;
      const el = document.createElement("style");
      el.id = "dsh-status-style";
      el.textContent = [
        ".dsh-status-dot{width:10px;height:10px;border-radius:50%;display:inline-block;cursor:pointer;vertical-align:middle;box-shadow:0 0 0 1px rgba(0,0,0,.18)}",
        ".dsh-status-panel{position:fixed;z-index:99999;background:#fff;color:#111;border:1px solid #ddd;border-radius:8px;padding:12px 14px;font:12px/1.55 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16);width:360px;max-width:calc(100vw - 24px)}",
        ".dsh-status-head{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;margin-bottom:8px}",
        ".dsh-status-chip{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600;color:#fff}",
        ".dsh-status-row{display:flex;gap:8px;padding:3px 0;border-top:1px solid #f0f0f0}",
        ".dsh-status-row:first-of-type{border-top:none}",
        ".dsh-status-k{color:#666;flex:0 0 96px}",
        ".dsh-status-v{flex:1 1 auto;word-break:break-word}",
        ".dsh-status-muted{color:#666}",
        ".dsh-status-sec{margin-top:8px;padding-top:8px;border-top:1px solid #eee}",
        ".dsh-status-sec h4{margin:0 0 4px;font-size:12px;font-weight:600}",
        ".dsh-status-desc{white-space:pre-wrap;word-break:break-word}"
      ].join("\n");
      document.head.appendChild(el);
    }

    function rel(ms) {
      if (!ms) return "";
      const d = Date.now() - ms;
      const m = Math.round(d / 60000);
      if (Math.abs(m) < 1) return "только что";
      if (Math.abs(m) < 60) return m + " мин назад";
      const h = Math.round(m / 60);
      if (Math.abs(h) < 24) return h + " ч назад";
      return Math.round(h / 24) + " дн назад";
    }

    function Row(k, v) {
      if (v === null || v === undefined || v === "") return null;
      return react.createElement("div", { className: "dsh-status-row", key: k },
        react.createElement("div", { className: "dsh-status-k" }, k),
        react.createElement("div", { className: "dsh-status-v" }, v));
    }

    function StatusPanel(st) {
      if (!st) return react.createElement("div", { className: "dsh-status-muted" }, "Нет данных от плагина - хост-часть ещё не ответила.");

      const color = COLORS[st.level] || COLORS.unknown;
      const rows = [];

      rows.push(react.createElement("div", { className: "dsh-status-head", key: "h" },
        react.createElement("span", { className: "dsh-status-dot", style: { background: color, boxShadow: "none" } }),
        react.createElement("span", null, st.stateLabel || st.state || "неизвестно")));

      rows.push(Row("Задержка API", st.latencyMs != null ? st.latencyMs + " мс" : "—"));
      rows.push(Row("Проверено", st.checkedAt ? new Date(st.checkedAt).toLocaleTimeString() + "  (" + rel(st.checkedAt) + ")" : "—"));

      if (!st.rssError && st.reachable === true && !st.incident) {
        rows.push(Row("Статус-лента", "инцидентов нет"));
      }
      if (st.rssError) {
        rows.push(Row("Статус-лента", "недоступна: " + st.rssError));
      }

      const incidentBlock = st.incident
        ? react.createElement("div", { className: "dsh-status-sec", key: "inc" },
            react.createElement("h4", null, st.incident.active ? "Активный инцидент" : "Последний инцидент (закрыт)"),
            react.createElement("div", { className: "dsh-status-row" },
              react.createElement("div", { className: "dsh-status-k" }, "Состояние"),
              react.createElement("div", { className: "dsh-status-v" },
                react.createElement("span", {
                  className: "dsh-status-chip",
                  style: { background: st.incident.active ? color : "#94a3b8" }
                }, st.incident.phaseLabel || st.incident.phase))),
            Row("Заголовок", st.incident.title),
            Row("Начат", st.incident.startedAtMs
              ? new Date(st.incident.startedAtMs).toLocaleString() + "  (" + rel(st.incident.startedAtMs) + ")"
              : null),
            Row("Затронуто", st.incident.components),
            st.incident.description
              ? react.createElement("div", { className: "dsh-status-row" },
                  react.createElement("div", { className: "dsh-status-k" }, "Описание"),
                  react.createElement("div", { className: "dsh-status-v dsh-status-desc" }, st.incident.description))
              : null)
        : null;

      if (incidentBlock) rows.push(incidentBlock);
      return react.createElement("div", null, rows);
    }

    function StatusDot() {
      const [st, setSt] = react.useState(null);
      const [open, setOpen] = react.useState(false);
      const btnRef = react.useRef(null);

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

      const color = st ? (COLORS[st.level] || COLORS.unknown) : COLORS.unknown;
      const title = st
        ? `${st.stateLabel || st.level} · ${st.latencyMs != null ? st.latencyMs + " мс" : "—"}`
        : "проверяю доступность DeepSeek API…";

      return react.createElement(react.Fragment, null,
        react.createElement("button", {
          ref: btnRef,
          type: "button",
          title,
          style: { background: "none", border: "none", padding: 2, cursor: "pointer", lineHeight: 0 },
          onClick: (event) => { event.stopPropagation(); setOpen((v) => !v); }
        }, react.createElement("span", { className: "dsh-status-dot", style: { background: color } })),
        open && react.createElement("div", {
          className: "dsh-status-panel",
          style: { top: ((btnRef.current?.getBoundingClientRect().bottom ?? 40) + 6), right: 12 }
        }, StatusPanel(st))
      );
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
