import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { GmailEvent } from "./watcher.js";

const execFile = promisify(execFileCb);

interface DeliverOptions {
  agentId: string;
  onLog: (msg: string) => void;
  onError: (msg: string) => void;
}

// Concurrency guard: one delivery at a time
let busy = false;
let deliveryLockExpires = 0;
const LOCK_TTL = 10 * 60 * 1000; // 10 minutes

export async function deliverToAgent(
  events: GmailEvent[],
  opts: DeliverOptions,
): Promise<void> {
  // Check and clear stale lock
  if (busy && Date.now() > deliveryLockExpires) {
    opts.onLog("Delivery lock expired, clearing");
    busy = false;
  }

  if (busy) {
    opts.onLog(`Delivery busy, queueing ${events.length} events`);
    return;
  }

  busy = true;
  deliveryLockExpires = Date.now() + LOCK_TTL;

  try {
    const lines = events.map((e, i) => {
      const from = e.from || "unknown sender";
      const subject = e.subject ? ` — ${e.subject}` : "";
      return `${i + 1}. **${from}**${subject}: ${e.snippet}`;
    });

    const message = [
      `New email${events.length === 1 ? "" : "s"} (${events.length}):`,
      "",
      ...lines,
    ].join("\n");

    const args = [
      "agent",
      "--agent", opts.agentId,
      "--message", message,
      "--deliver",
    ];

    await execFile("openclaw", args, { timeout: 120_000 });
    opts.onLog(`Delivered ${events.length} email(s) to agent ${opts.agentId}`);
  } catch (err: any) {
    opts.onError(`Delivery failed: ${err.message?.slice(0, 200)}`);
  } finally {
    busy = false;
  }
}
