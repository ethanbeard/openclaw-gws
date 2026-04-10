export interface GwsConfig {
  project: string;
  debounceSeconds: number;
  maxBatchSize: number;
  paused: boolean;
}

export function parseConfig(raw: Record<string, unknown>): GwsConfig {
  return {
    project: (raw.project as string) || process.env.GOOGLE_WORKSPACE_PROJECT_ID || "",
    debounceSeconds: typeof raw.debounceSeconds === "number" ? raw.debounceSeconds : 30,
    maxBatchSize: typeof raw.maxBatchSize === "number" ? raw.maxBatchSize : 10,
    paused: raw.paused === true,
  };
}
