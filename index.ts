import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { parseConfig } from "./src/config.js";
import { GmailWatcher } from "./src/watcher.js";
import { enqueue, clear } from "./src/debounce.js";
const emptyObject = { type: "object" as const, properties: {} };

const plugin = {
  id: "gws",
  name: "GWS Gmail Watcher",
  description: "Watch Gmail for new emails via gws CLI and deliver to your agent in real-time",
  register(api: OpenClawPluginApi) {
    let watcher: GmailWatcher | null = null;

    function createAndStartWatcher() {
      const cfg = parseConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

      if (!cfg.project) {
        api.logger.error("[gws] No GCP project configured. Set 'project' in plugin config or GOOGLE_WORKSPACE_PROJECT_ID env var.");
        return null;
      }

      const w = new GmailWatcher({
        project: cfg.project,
        onEvent: (event) => {
          api.logger.info(`[gws] New email from ${event.from}: ${event.subject}`);
          enqueue(event, {
            debounceSeconds: cfg.debounceSeconds,
            maxBatchSize: cfg.maxBatchSize,
            agentId: cfg.agentId,
            onLog: (msg) => api.logger.info(`[gws] ${msg}`),
            onError: (msg) => api.logger.error(`[gws] ${msg}`),
          });
        },
        onError: (msg) => api.logger.error(`[gws] ${msg}`),
        onStatus: (msg) => api.logger.info(`[gws] ${msg}`),
      });

      w.start();
      api.logger.info(`[gws] Gmail watcher started (project: ${cfg.project}, agent: ${cfg.agentId})`);
      return w;
    }

    function updatePausedConfig(paused: boolean) {
      const config = api.runtime.config.loadConfig() ?? {};
      config.plugins ??= {};
      config.plugins.entries ??= {};
      config.plugins.entries.gws ??= {};
      config.plugins.entries.gws.config ??= {};
      config.plugins.entries.gws.config.paused = paused;
      api.runtime.config.writeConfigFile(config);
    }

    // --- Tools ---

    api.registerTool({
      name: "gws_status",
      description: "Check Gmail watcher status: what's being watched, last event, errors",
      parameters: emptyObject,
      async execute() {
        if (!watcher) {
          return { content: [{ type: "text", text: "Gmail watcher not running." }] };
        }

        const lines = [
          `Status: ${watcher.status}`,
          `Last email: ${watcher.lastEvent?.toISOString() ?? "none"}`,
          `Last error: ${watcher.lastError ?? "none"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    });

    api.registerTool({
      name: "gws_pause",
      description: "Pause Gmail watching. Emails will not be delivered until resumed.",
      parameters: emptyObject,
      async execute() {
        if (watcher) {
          watcher.stop();
          watcher = null;
        }
        updatePausedConfig(true);
        return { content: [{ type: "text", text: "Gmail watching paused." }] };
      },
    });

    api.registerTool({
      name: "gws_resume",
      description: "Resume Gmail watching after a pause.",
      parameters: emptyObject,
      async execute() {
        updatePausedConfig(false);

        if (!watcher) {
          watcher = createAndStartWatcher();
          if (!watcher) {
            return { content: [{ type: "text", text: "Failed to start watcher. Check plugin config (project ID required)." }] };
          }
        } else {
          watcher.start();
        }

        return { content: [{ type: "text", text: "Gmail watching resumed." }] };
      },
    });

    // --- Background service ---

    api.registerService({
      id: "gws-gmail-watcher",
      start: () => {
        const cfg = parseConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

        if (cfg.paused) {
          api.logger.info("[gws] Paused, skipping watch start");
          return;
        }

        watcher = createAndStartWatcher();
      },
      stop: () => {
        if (watcher) {
          watcher.stop();
          watcher = null;
        }
        clear();
        api.logger.info("[gws] Gmail watcher stopped");
      },
    });
  },
};

export default plugin;
