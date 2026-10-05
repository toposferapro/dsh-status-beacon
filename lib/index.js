/**
 * dsh-status-beacon — node half.
 *
 * Availability traffic light for the DeepSeek API. Once a minute it takes two
 * independent readings and serves the result to the browser over HTTP:
 *
 *   1) reachability — GET https://api.deepseek.com/models without a key:
 *      200/401/403 means the server is alive (401/403 only means "key needed"),
 *      a timeout / 5xx / network break means it is not answering;
 *   2) status feed — https://status.deepseek.com/history.rss: the latest
 *      incident, its stage (Investigating…Resolved), start time, affected
 *      components and description.
 *
 * THE COLOUR FOLLOWS DEEPSEEK'S OWN SCALE (four states plus "unknown"):
 *   operational    -> green  (All Systems Operational)
 *   degraded       -> yellow (Degraded Performance)
 *   partial_outage -> orange (Partial Outage)
 *   full_outage    -> red    (Full Outage)
 *   unknown        -> grey   (feed unreadable — nothing to confirm with)
 *
 * MAIN PITFALL: the newest feed item is almost always a CLOSED incident
 * ("Status: resolved"). Judging by the headline alone is wrong — a resolved
 * degradation would paint the light yellow forever. The colour is taken only
 * from an ACTIVE incident (investigating / identified / monitoring); a closed
 * one is shown in the popover as history and does not affect the colour.
 *
 * The model API key is deliberately not read: its storage changes between DSH
 * versions, and the indicator must survive platform upgrades.
 *
 * Note on the feed markup (verified 2026-10-05): "Status:" and "Affected
 * components:" are wrapped in <strong>, so tags must be stripped BEFORE
 * parsing — otherwise the stage silently falls back to its default value.
 */

const API_PATH = '/plugins/dsh-status-beacon/api';
const API_URL = 'https://api.deepseek.com/models';
const RSS_URL = 'https://status.deepseek.com/history.rss';
const PROBE_TIMEOUT_MS = 8000;

/** State names — verbatim from the DeepSeek status page. */
const STATE_LABEL = {
  operational: 'All Systems Operational',
  degraded: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  full_outage: 'Full Outage',
  unreachable: 'API unreachable',
  unknown: 'State unknown',
};
const LEVEL_OF_STATE = {
  operational: 'green',
  degraded: 'yellow',
  partial_outage: 'orange',
  full_outage: 'red',
  unreachable: 'red',
  unknown: 'unknown',
};
/** Incident lifecycle stages — the site's own wording. */
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
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'timeout';
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
    // Tags are stripped BEFORE parsing: the feed wraps "Status:" in <strong>,
    // so the stage would otherwise fall back to the default and an active
    // incident would look resolved.
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

/** State from the headline of an ACTIVE incident. "Partial" is checked before
 *  "unavailable", because "Partially Unavailable" contains both words.
 *  The Chinese alternatives match the original feed headlines. */
function classifyTitle(title) {
  const t = String(title).toLowerCase();
  if (/partial|部分/.test(t)) return 'partial_outage';
  if (/full outage|major outage|\boutage\b|unavailable|不可用/.test(t)) return 'full_outage';
  if (/degrad|性能|下降|error|异常|issue/.test(t)) return 'degraded';
  return 'degraded';
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

  // 2) status feed (its own failure must not bring the light down)
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

  // 3) state: the colour comes only from an ACTIVE incident
  let state = 'unknown';
  let error = '';
  if (reachable === false) {
    state = 'unreachable';
    error = e0 || 'API unreachable';
  } else if (reachable === true) {
    if (!rss) {
      state = 'unknown';
      error = rssError ? `status feed unavailable: ${rssError}` : 'status feed not recognised';
    } else if (rss.active) {
      state = classifyTitle(rss.title);
      error = rss.title;
    } else {
      state = 'operational'; // the latest incident is closed — it cannot tint the light
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

// 'timer' provides ctx.interval (it is a platform service, not a cordis built-in).
export const inject = ['webServer', 'timer'];

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method not allowed' });
      writeJson(res, 200, status);
    },
  }), 'dsh-status-beacon: status API');

  void probe().catch(() => {});
  ctx.interval(() => { void probe().catch(() => {}); }, 60_000);
}
