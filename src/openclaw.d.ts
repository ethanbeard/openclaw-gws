// Minimal type stubs for OpenClaw plugin SDK.
// At runtime, these are resolved by OpenClaw's jiti loader.
declare module "openclaw/plugin-sdk/core" {
  interface OpenClawPluginApi {
    id?: string;
    pluginConfig?: Record<string, unknown>;
    logger: {
      info(msg: string): void;
      error(msg: string): void;
      warn(msg: string): void;
    };
    runtime: {
      config: {
        loadConfig(): Record<string, any>;
        writeConfigFile(config: Record<string, any>): void;
      };
    };
    registerTool(tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute(...args: any[]): Promise<{ content: Array<{ type: string; text: string }> }>;
    }): void;
    registerService(service: {
      id: string;
      start(): void;
      stop(): void;
    }): void;
  }
}
