// Minimal type stubs for OpenClaw plugin SDK.
// At runtime, these are resolved by OpenClaw's jiti loader.
declare module "openclaw/plugin-sdk/core" {
  type ToolResult = Promise<{ content: Array<{ type: string; text: string }> }>;

  interface OpenClawTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(...args: any[]): ToolResult;
  }

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
    registerTool(tool: OpenClawTool | ((ctx: { agentId?: string; sessionKey?: string }) => OpenClawTool)): void;
    registerService(service: {
      id: string;
      start(): void;
      stop(): void;
    }): void;
  }
}
