import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { parseConfig } from "./src/config.js";
import { GmailWatcher } from "./src/watcher.js";
import { enqueue, clear } from "./src/debounce.js";
import { Type } from "@sinclair/typebox";

const plugin = {
  id: "gws",
  name: "GWS Gmail Watcher",
  description: "Watch Gmail for new emails via gws CLI and deliver to your agent in real-time",
  register(api: OpenClawPluginApi) {
    let watcher: GmailWatcher | null = null;

    // --- Tools ---

    api.registerTool({
      name: "gws_status",
      description: "Check Gmail watcher status: what's being watched, last event, errors",
      parameters: Type.Object({}),
      async execute() {
        if (!watcher) {
          return { content: [{ type: "text", text: "Gmail watcher not initialized." }] };
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
      parameters: Type.Object({}),
      async execute() {
        if (watcher) watcher.stop();

        const config = api.runtime.config.loadConfig();
        const pluginConfig = config?.plugins?.entries?.gws?.config ?? {};
        pluginConfig.paused = true;
        config.plugins ??= {};
        config.plugins.entries ??= {};
        config.plugins.entries.gws ??= {};
        config.plugins.entries.gws.config = pluginConfig;
        api.runtime.config.writeConfigFile(config);

        return { content: [{ type: "text", text: "Gmail watching paused." }] };
      },
    });

    api.registerTool({
      name: "gws_resume",
      description: "Resume Gmail watching after a pause.",
      parameters: Type.Object({}),
      async execute() {
        const config = api.runtime.config.loadConfig();
        const pluginConfig = config?.plugins?.entries?.gws?.config ?? {};
        pluginConfig.paused = false;
        config.plugins ??= {};
        config.plugins.entries ??= {};
        config.plugins.entries.gws ??= {};
        config.plugins.entries.gws.config = pluginConfig;
        api.runtime.config.writeConfigFile(config);

        if (watcher) watcher.start();
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

        if (!cfg.project) {
          api.logger.error("[gws] No GCP project configured. Set 'project' in plugin config or GOOGLE_WORKSPACE_PROJECT_ID env var.");
          return;
        }

        // Determine which OpenClaw agent to deliver to
        const config = api.runtime.config.loadConfig();
        const agents = config?.agents?.list ?? [];
        const agentId = agents[0]?.id ?? "main";

        watcher = new GmailWatcher({
          project: cfg.project,
          onEvent: (event) => {
            api.logger.info(`[gws] New email from ${event.from}: ${event.subject}`);
            enqueue(event, {
              debounceSeconds: cfg.debounceSeconds,
              maxBatchSize: cfg.maxBatchSize,
              agentId,
              onLog: (msg) => api.logger.info(`[gws] ${msg}`),
              onError: (msg) => api.logger.error(`[gws] ${msg}`),
            });
          },
          onError: (msg) => api.logger.error(`[gws] ${msg}`),
          onStatus: (msg) => api.logger.info(`[gws] ${msg}`),
        });

        watcher.start();
        api.logger.info(`[gws] Gmail watcher started (project: ${cfg.project})`);
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
