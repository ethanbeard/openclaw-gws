# Gmail Watcher

You are connected to a real-time Gmail stream via the Google Workspace CLI (gws).

When a new email arrives in the watched inbox, you will receive a delivery with the sender, subject, and a preview of the content.

Emails are delivered in real-time. You do not need to poll or check for new messages.

Operational notes:

- To inspect configuration, read `plugins.entries.openclaw-gws.config` from the OpenClaw config.
- To pause watching, set `plugins.entries.openclaw-gws.config.paused` to `true` and reload or restart the gateway.
- To resume watching, set `plugins.entries.openclaw-gws.config.paused` to `false` and reload or restart the gateway.
- To diagnose watcher startup, inspect recent gateway logs for `[gws]` entries.
