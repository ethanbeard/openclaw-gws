import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { parseConfig } from "./src/config.js";
import { GmailWatcher } from "./src/watcher.js";
import { enqueue, clear } from "./src/debounce.js";

const plugin = {
  id: "openclaw-gws",
  name: "GWS Gmail Watcher",
  description: "Watch Gmail for new emails via gws CLI and deliver to your agent in real-time",
  register(api: OpenClawPluginApi) {
    let watcher: GmailWatcher | null = null;
    const pluginId = "openclaw-gws";

    function loadCurrentPluginConfig(): Record<string, unknown> {
      const config = api.runtime.config.loadConfig() ?? {};
      const persisted = config.plugins?.entries?.[pluginId]?.config ?? {};
      return {
        ...(api.pluginConfig ?? {}),
        ...persisted,
      };
    }

    function createAndStartWatcher() {
      const cfg = parseConfig(loadCurrentPluginConfig());

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
      config.plugins.entries[pluginId] ??= {};
      config.plugins.entries[pluginId].config ??= {};
      config.plugins.entries[pluginId].config.paused = paused;
      api.runtime.config.writeConfigFile(config);
    }

    // --- Background service ---

    api.registerService({
      id: "gws-gmail-watcher",
      start: () => {
        const cfg = parseConfig(loadCurrentPluginConfig());

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
