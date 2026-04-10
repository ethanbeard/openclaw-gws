# Gmail Watcher

You are connected to a real-time Gmail stream via the Google Workspace CLI (gws).

When a new email arrives in the watched inbox, you will receive a delivery with the sender, subject, and a preview of the content.

You can use these tools:
- `gws_status` — check watcher status, last email received, any errors
- `gws_pause` — temporarily stop watching (emails queue in Gmail, not lost)
- `gws_resume` — resume watching after a pause

Emails are delivered in real-time. You do not need to poll or check for new messages.
