/**
 * dsh-status-indicator — node half.
 *
 * Светофор доступности DeepSeek API. Раз в минуту снимает два независимых
 * сигнала и отдаёт итог браузеру по HTTP:
 *
 *   1) reachability — GET https://api.deepseek.com/models без ключа:
 *      200/401/403 = сервер жив (401/403 лишь значит «нужен ключ»),
 *      таймаут / 5xx / обрыв = не отвечает;
 *   2) статус-лента — https://status.deepseek.com/history.rss: объявлена ли
 *      деградация или сбой и что затронуто.
 *
 * Ключ модели не читаем намеренно: его хранилище меняется между версиями DSH,
 * а светофор должен переживать обновление платформы. Сигнал «жив/не жив»
 * снимается без авторизации и его достаточно.
 */

const API_PATH = '/plugins/dsh-status-indicator/api';
const API_URL = 'https://api.deepseek.com/models';
const RSS_URL = 'https://status.deepseek.com/history.rss';
const PROBE_TIMEOUT_MS = 8000;

let status = {
  level: 'unknown',   // green | yellow | red | unknown
  reachable: null,    // null | true | false
  latencyMs: null,
  rss: null,          // { title, phase, components } | null
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function parseRss(text) {
  try {
    const item = text.match(/<item>([\s\S]*?)<\/item>/);
    if (!item) return null;
    const block = item[1];
    const title = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    const desc = decodeEntities((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '');
    const phaseMatch = desc.match(/Status:\s*(\w+)/);
    const components = desc.split('Affected components:')[1] || '';
    return {
      title: title.slice(0, 180),
      phase: (phaseMatch?.[1] || 'resolved').toLowerCase(),
      components: components.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 260),
      active: /investigating|identified|monitoring/i.test(desc),
    };
  } catch {
    return null;
  }
}

async function probe() {
  // 1) reachability
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

  // 2) RSS — ошибка ленты не роняет светофор, просто сигнал недоступен
  let rss = null;
  let e1 = '';
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(RSS_URL, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) rss = parseRss(await r.text());
  } catch (e) {
    e1 = errText(e);
  }

  // 3) уровень
  let level = 'unknown';
  let error = '';
  if (reachable === false) {
    level = 'red';
    error = e0 || 'API недоступен';
  } else if (reachable === true) {
    // Зелёный только когда лента прочитана и инцидента нет. Если ленту не
    // прочитать — честнее показать жёлтый: «не могу подтвердить, что всё чисто».
    if (rss == null) {
      level = 'yellow';
      error = rssError ? `статус-лента недоступна: ${rssError}` : 'статус-лента не распознана';
    } else {
      const t = rss.title.toLowerCase();
      const outage = /outage|unavailable|中断|不可用/i.test(t);
      const degraded = rss.active || /degrad|性能|下降|partial|部分/i.test(t);
      if (outage) {
        level = 'red';
        error = rss.title || 'объявлен сбой';
      } else if (degraded) {
        level = 'yellow';
        error = rss.title || 'объявлена деградация';
      } else {
        level = 'green';
        error = '';
      }
    }
  }

  status = {
    level,
    reachable,
    latencyMs: latency,
    rss: rss ? { title: rss.title, phase: rss.phase, components: rss.components } : null,
    rssError: e1,
    error,
    checkedAt: Date.now(),
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
