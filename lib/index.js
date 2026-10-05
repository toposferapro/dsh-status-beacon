/**
 * dsh-status-indicator — node half.
 *
 * Светофор доступности DeepSeek API. Раз в минуту снимает два независимых
 * сигнала и отдаёт итог браузеру по HTTP:
 *
 *   1) reachability — GET https://api.deepseek.com/models без ключа:
 *      200/401/403 = сервер жив (401/403 лишь значит «нужен ключ»),
 *      таймаут / 5xx / обрыв = не отвечает;
 *   2) статус-лента — https://status.deepseek.com/history.rss: последний
 *      инцидент, его стадия (Investigating…Resolved), время начала, затронутые
 *      службы и описание.
 *
 * ЦВЕТ СЛЕДУЕТ ШКАЛЕ САМОГО DEEPSEEK (четыре состояния + «неизвестно»):
 *   operational    → зелёный   (All Systems Operational)
 *   degraded       → жёлтый    (Degraded Performance)
 *   partial_outage → оранжевый (Partial Outage)
 *   full_outage    → красный   (Full Outage)
 *   unknown        → серый     (ленту не прочитать — подтвердить нечем)
 *
 * 🔴 ГЛАВНАЯ ОСТОРОЖНОСТЬ: последний элемент ленты почти всегда ЗАКРЫТЫЙ
 * инцидент («Status: resolved»). Судить по одному заголовку нельзя — иначе
 * закрытая деградация красит светофор в жёлтый навсегда. Цвет берём только от
 * АКТИВНОГО инцидента (investigating / identified / monitoring); закрытый
 * показываем в попапе как историю, но на цвет он не влияет.
 *
 * Ключ модели не читаем намеренно: его хранилище меняется между версиями DSH,
 * а светофор должен переживать обновление платформы.
 */

const API_PATH = '/plugins/dsh-status-indicator/api';
const API_URL = 'https://api.deepseek.com/models';
const RSS_URL = 'https://status.deepseek.com/history.rss';
const PROBE_TIMEOUT_MS = 8000;

/** Названия состояний — дословно со страницы статуса DeepSeek. */
const STATE_LABEL = {
  operational: 'All Systems Operational',
  degraded: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  full_outage: 'Full Outage',
  unreachable: 'API не отвечает',
  unknown: 'Состояние неизвестно',
};
const LEVEL_OF_STATE = {
  operational: 'green',
  degraded: 'yellow',
  partial_outage: 'orange',
  full_outage: 'red',
  unreachable: 'red',
  unknown: 'unknown',
};
/** Стадии жизненного цикла инцидента — тоже их словами. */
const PHASE_LABEL = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

let status = {
  level: 'unknown',
  state: 'unknown',
  stateLabel: STATE_LABEL.unknown,
  reachable: null,
  latencyMs: null,
  incident: null,
  rssError: '',
  error: '',
  checkedAt: 0,
};

function writeJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function errText(e) {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'таймаут';
  return String(e?.message ?? e).slice(0, 200);
}

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function clean(s) {
  return String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRss(text) {
  try {
    const item = text.match(/<item>([\s\S]*?)<\/item>/);
    if (!item) return null;
    const b = item[1];
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeEntities(m[1]) : '';
    };
    const title = clean(pick('title'));
    const link = pick('link').trim();
    const pubDate = pick('pubDate').trim();
    // 🔴 ТЕГИ СНИМАЕМ ДО РАЗБОРА. В ленте «Status:» и «Affected components:»
    // обёрнуты в <strong>, поэтому строка выглядит как
    //   <p><strong>Status:</strong> resolved</p><p>…
    // и шаблон «Status:\s+слово» не срабатывает: фаза молча падала в значение
    // по умолчанию «resolved», и АКТИВНЫЙ инцидент выглядел закрытым - светофор
    // не покраснел бы никогда. Проверено на живой ленте 05.10.2026.
    const desc = clean(pick('description'));

    const phaseMatch = desc.match(/Status:\s*([A-Za-z_]+)/);
    const phase = (phaseMatch?.[1] || 'resolved').toLowerCase();

    const parts = desc.split(/Affected components:/i);
    const body = clean(parts[0] || '').replace(/^Status:\s*[A-Za-z_]+\s*/i, '').trim();
    const components = clean(parts[1] || '');

    return {
      title,
      link,
      pubDate,
      startedAtMs: Date.parse(pubDate) || null,
      phase,
      body,
      components,
      active: /investigating|identified|monitoring/.test(phase),
    };
  } catch {
    return null;
  }
}

/** Состояние по заголовку АКТИВНОГО инцидента. «Частичный» проверяем раньше
 *  «недоступен»: «Partially Unavailable» содержит оба слова. */
function classifyTitle(title) {
  const t = String(title).toLowerCase();
  if (/partial|部分/.test(t)) return 'partial_outage';
  if (/full outage|major outage|\boutage\b|unavailable|不可用/.test(t)) return 'full_outage';
  if (/degrad|性能|下降|error|异常|issue/.test(t)) return 'degraded';
  return 'degraded';
}

async function probe() {
  // 1) доступность
  let reachable = null;
  let latency = null;
  let e0 = '';
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(API_URL, { method: 'GET', signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(to);
    latency = Date.now() - t0;
    reachable = r.ok || r.status === 401 || r.status === 403;
  } catch (e) {
    reachable = false;
    latency = Date.now() - t0;
    e0 = errText(e);
  }

  // 2) статус-лента (её ошибка не роняет светофор)
  let rss = null;
  let rssError = '';
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(RSS_URL, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) rss = parseRss(await r.text());
  } catch (e) {
    rssError = errText(e);
  }

  // 3) состояние: цвет — только от АКТИВНОГО инцидента
  let state = 'unknown';
  let error = '';
  if (reachable === false) {
    state = 'unreachable';
    error = e0 || 'API недоступен';
  } else if (reachable === true) {
    if (!rss) {
      state = 'unknown';
      error = rssError ? `статус-лента недоступна: ${rssError}` : 'статус-лента не распознана';
    } else if (rss.active) {
      state = classifyTitle(rss.title);
      error = rss.title;
    } else {
      state = 'operational'; // последний инцидент закрыт — на цвет не влияет
    }
  }

  status = {
    level: LEVEL_OF_STATE[state] || 'unknown',
    state,
    stateLabel: STATE_LABEL[state] || state,
    reachable,
    latencyMs: latency,
    checkedAt: Date.now(),
    incident: rss ? {
      title: rss.title,
      link: rss.link,
      phase: rss.phase,
      phaseLabel: PHASE_LABEL[rss.phase] || rss.phase,
      active: rss.active,
      startedAtMs: rss.startedAtMs,
      components: rss.components,
      description: rss.body,
    } : null,
    rssError,
    error,
  };
}

// 'timer' даёт ctx.interval (это не встроенный cordis-метод, а служба платформы).
export const inject = ['webServer', 'timer'];

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method not allowed' });
      writeJson(res, 200, status);
    },
  }), 'dsh-status-indicator: status API');

  void probe().catch(() => {});
  ctx.interval(() => { void probe().catch(() => {}); }, 60_000);
}
