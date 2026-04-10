import type { GmailEvent } from "./watcher.js";
import { deliverToAgent } from "./deliver.js";

interface DebounceOptions {
  debounceSeconds: number;
  maxBatchSize: number;
  agentId: string;
  onLog: (msg: string) => void;
  onError: (msg: string) => void;
}

const pending: GmailEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentOpts: DebounceOptions | null = null;

export function enqueue(event: GmailEvent, opts: DebounceOptions) {
  currentOpts = opts;
  pending.push(event);

  // Flush immediately at max batch size
  if (pending.length >= opts.maxBatchSize) {
    flush();
    return;
  }

  // Reset debounce timer
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, opts.debounceSeconds * 1000);
}

function flush() {
  if (pending.length === 0 || !currentOpts) return;

  const batch = pending.splice(0, currentOpts.maxBatchSize);
  const opts = currentOpts;

  // If overflow remains, schedule another flush
  if (pending.length > 0) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, opts.debounceSeconds * 1000);
  }

  deliverToAgent(batch, {
    agentId: opts.agentId,
    onLog: opts.onLog,
    onError: opts.onError,
  });
}

export function clear() {
  pending.length = 0;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
