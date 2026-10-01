/**
 * dsh-status-indicator — browser half.
 *
 * Цветная точка в ряду инструментов редактора, слева от меню модели (слот
 * conversation.input.right). Цвет = уровень доступности DeepSeek API:
 *
 *   зелёный  — API жив, деградация не объявлена
 *   жёлтый   — деградация объявлена / активный инцидент
 *   красный  — API не отвечает / объявлен сбой
 *   серый    — данных ещё нет
 *
 * Клик открывает небольшую панель с деталями (задержка, статус-лента, затронутые
 * компоненты, время проверки). Данные берёт с host-маршрута /plugins/dsh-status-indicator/api
 * и обновляет раз в 30 секунд.
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
    const COLORS = { green: "#22c55e", yellow: "#eab308", red: "#ef4444", unknown: "#94a3b8" };
    const LABEL = { green: "API в порядке", yellow: "деградация", red: "API не отвечает", unknown: "нет данных" };

    function injectStyles() {
      if (document.getElementById("dsh-status-style")) return;
      const el = document.createElement("style");
      el.id = "dsh-status-style";
      el.textContent = [
        ".dsh-status-dot{width:10px;height:10px;border-radius:50%;display:inline-block;cursor:pointer;vertical-align:middle;box-shadow:0 0 0 1px rgba(0,0,0,.18)}",
        ".dsh-status-panel{position:fixed;z-index:99999;background:#fff;color:#111;border:1px solid #ddd;border-radius:8px;padding:10px 12px;font:12px/1.55 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16);max-width:340px}",
        ".dsh-status-panel b{display:block;margin-bottom:4px;font-size:13px}",
        ".dsh-status-panel .dsh-status-muted{color:#666}"
      ].join("\n");
      document.head.appendChild(el);
    }

    function StatusPanel(st) {
      if (!st) return react.createElement("div", null, "Нет данных от плагина.");
      const rows = [];
      rows.push(react.createElement("b", { key: "l" }, LABEL[st.level] || st.level));
      rows.push(react.createElement("div", { key: "lat" },
        "задержка: ", st.latencyMs != null ? st.latencyMs + " мс" : "—"));
      if (st.rss) {
        rows.push(react.createElement("div", { key: "t" }, "статус: ", st.rss.title));
        if (st.rss.components) rows.push(react.createElement("div", { key: "c" }, "затронуто: ", st.rss.components));
      }
      if (st.error) rows.push(react.createElement("div", { key: "e" }, st.error));
      rows.push(react.createElement("div", { key: "a", className: "dsh-status-muted" },
        "проверено: ", st.checkedAt ? new Date(st.checkedAt).toLocaleTimeString() : "—"));
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
        ? `${LABEL[st.level] || st.level} · ${st.latencyMs != null ? st.latencyMs + "мс" : "—"} · ${st.checkedAt ? new Date(st.checkedAt).toLocaleTimeString() : ""}`
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
