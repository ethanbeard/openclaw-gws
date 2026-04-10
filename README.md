# openclaw-gws

Gmail watcher for [OpenClaw](https://openclaw.ai) agents. Uses the [Google Workspace CLI](https://github.com/googleworkspace/cli) (`gws`) to stream new emails to your agent in real-time.

Zero tokens burned between emails. Agent only wakes when something arrives.

## Prerequisites

1. [gws](https://github.com/googleworkspace/cli) installed and authenticated:

```bash
npm install -g @anthropic-ai/gws
gws auth setup
gws auth login
```

2. A GCP project with the Gmail API enabled:

```bash
gcloud services enable gmail.googleapis.com --project YOUR_PROJECT_ID
```

Note: `gws auth setup` creates a GCP project and OAuth client for you. You need to add your Gmail address as a test user in the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) while the app is unverified.

## Install

```bash
openclaw plugins install openclaw-gws
```

## Configure

```bash
openclaw config set plugins.entries.gws.config.project YOUR_PROJECT_ID
```

Or set the environment variable `GOOGLE_WORKSPACE_PROJECT_ID`.

Optional settings:

```bash
openclaw config set plugins.entries.gws.config.debounceSeconds 30
openclaw config set plugins.entries.gws.config.maxBatchSize 10
```

## How it works

The plugin spawns `gws gmail +watch` as a background process. When a new email arrives in your Gmail inbox, `gws` streams it as NDJSON. The plugin parses the event, extracts From/Subject/snippet, batches emails within a 30-second window, and delivers them to your agent via `openclaw agent --deliver`.

If the `gws` process exits (network issue, auth expired), the plugin automatically restarts it with exponential backoff.

## Agent tools

- `gws_status` — watcher state, last email, errors
- `gws_pause` — stop watching
- `gws_resume` — resume watching

## License

MIT
