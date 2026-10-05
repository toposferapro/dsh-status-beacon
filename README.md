# dsh-status-beacon

Availability traffic light for the DeepSeek API, as a DeepSeek Harness (DSH) plugin.

A coloured dot in the composer tool row (left of the model menu):

- **green** — All Systems Operational;
- **yellow** — Degraded Performance;
- **orange** — Partial Outage;
- **red** — Full Outage, or the API is not answering;
- **grey** — state unknown (the status feed cannot be read).

Clicking the dot opens a panel anchored to it by a caret: API response latency,
the latest incident with its lifecycle stage (Investigating → Identified →
Monitoring → Resolved), its start time, the affected components, the incident
description and a link to the status page.

## How it works

The host half takes two independent readings once a minute:

1. **Reachability** — `GET https://api.deepseek.com/models` without a key:
   `200/401/403` means the server is alive, while a timeout, 5xx or network
   break means it is not answering.
2. **Status feed** — `https://status.deepseek.com/history.rss`: the latest
   incident, its stage and what it affected.

The colour follows DeepSeek's own four-state scale. A **closed** incident never
tints the light — only an active one does, otherwise a resolved degradation
would keep the indicator yellow forever.

The model API key is deliberately **not** used: the alive/not-alive signal is
taken without authorisation, so the plugin survives DSH upgrades that move the
key storage around.

The browser half reads `/plugins/dsh-status-beacon/api` and refreshes the dot
every 30 seconds. Styling uses the DSH design tokens (`--dsw-alias-*`), so the
widget matches the interface and follows the dark theme.

## Installation

```sh
dsh plugin --profile web add github:toposferapro/dsh-status-beacon#<commit>
```

After any `dsh plugin add/remove`, check `dsh.profile.bundles`: this plugin must
stay in the bundle list.

## Requirements

- DSH with the web profile.
- Outbound HTTPS to `api.deepseek.com` and `status.deepseek.com`.
- No API key, no extra dependencies.

## License

MIT.
