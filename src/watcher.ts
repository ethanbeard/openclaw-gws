import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface GmailEvent {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  labelIds: string[];
}

/** Parse a raw gws +watch JSON line into a GmailEvent */
export function parseWatchLine(json: Record<string, unknown>): GmailEvent | null {
  // Skip error events
  if ("error" in json) return null;

  const payload = json.payload as Record<string, unknown> | undefined;
  if (!payload) return null;

  const headers = (payload.headers ?? []) as Array<{ name: string; value: string }>;
  const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";

  return {
    id: (json.id as string) ?? "",
    threadId: (json.threadId as string) ?? "",
    from: get("From"),
    subject: get("Subject"),
    snippet: (json.snippet as string) ?? "",
    date: get("Date"),
    labelIds: (json.labelIds as string[]) ?? [],
  };
}

interface WatcherOptions {
  project: string;
  onEvent: (event: GmailEvent) => void;
  onError: (error: string) => void;
  onStatus: (status: string) => void;
}

export class GmailWatcher {
  private proc: ChildProcess | null = null;
  private backoff = 1000;
  private maxBackoff = 60000;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lineBuffer = "";
  private errorBuffer = "";
  private _lastEvent: Date | null = null;
  private _lastError: string | null = null;
  private _status: "stopped" | "starting" | "watching" | "reconnecting" = "stopped";

  constructor(private opts: WatcherOptions) {}

  get status() { return this._status; }
  get lastEvent() { return this._lastEvent; }
  get lastError() { return this._lastError; }

  start() {
    if (this.proc) return;
    this.stopped = false;
    this.spawn();
  }

  stop() {
    this.stopped = true;
    this._status = "stopped";
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private spawn() {
    if (this.stopped) return;

    this._status = "starting";
    this.lineBuffer = "";

    const args = ["gmail", "+watch"];
    if (this.opts.project) {
      args.push("--project", this.opts.project);
    }

    this.opts.onStatus(`Starting gws ${args.join(" ")}`);

    const child = spawn("gws", args, {
      env: { ...process.env, GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: "file" },
    });
    this.proc = child;

    child.stdout?.on("data", (chunk: string | Buffer) => {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split("\n");
      // Keep incomplete last line in buffer
      this.lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleLine(trimmed);
      }
    });

    child.stderr?.on("data", (chunk: string | Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        // gws prints status messages to stderr (e.g. "Listening for new emails...")
        if (msg.includes("Listening for new emails")) {
          this._status = "watching";
          this.backoff = 1000; // Reset backoff on successful connection
          this.opts.onStatus("Watching Gmail for new emails");
        } else {
          this.opts.onStatus(msg);
        }
      }
    });

    child.on("error", (err: Error) => {
      if (err.message.includes("ENOENT")) {
        this._lastError = "gws not found. Install from https://github.com/googleworkspace/cli";
        this.opts.onError(this._lastError);
        this._status = "stopped";
        this.stopped = true; // Don't retry if binary not found
        return;
      }
      this._lastError = err.message;
      this.opts.onError(err.message);
      this.scheduleRestart();
    });

    child.on("exit", (code: number | null) => {
      this.proc = null;
      if (this.stopped) return;
      this._lastError = `gws exited with code ${code}`;
      this.opts.onError(this._lastError);
      this.scheduleRestart();
    });
  }

  private handleLine(line: string) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      // gws issue #680: errors are pretty-printed across multiple lines.
      // Buffer them and try to parse as a complete JSON object.
      this.errorBuffer += line;
      try {
        const errJson = JSON.parse(this.errorBuffer);
        this.errorBuffer = "";
        if (errJson.error?.message) {
          this.opts.onError(errJson.error.message);
        }
      } catch {
        // Still incomplete, keep buffering
      }
      return;
    }

    // Successful parse clears any error buffer
    this.errorBuffer = "";

    const event = parseWatchLine(json);
    if (!event) return;

    // Only deliver INBOX messages
    if (!event.labelIds.includes("INBOX")) return;

    this._lastEvent = new Date();
    this.opts.onEvent(event);
  }

  private scheduleRestart() {
    if (this.stopped) return;
    this._status = "reconnecting";
    this.opts.onStatus(`Reconnecting in ${this.backoff / 1000}s...`);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawn();
    }, this.backoff);

    // Exponential backoff
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }
}
