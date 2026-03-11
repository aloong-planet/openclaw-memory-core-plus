export type MemoryCorePlusConfig = {
  autoRecall: boolean;
  autoRecallMaxResults: number;
  autoRecallMinScore: number;
  autoRecallMinPromptLength: number;
  autoCapture: boolean;
  autoCaptureMaxMessages: number;
};

const DEFAULT_CONFIG: MemoryCorePlusConfig = {
  autoRecall: false,
  autoRecallMaxResults: 5,
  autoRecallMinScore: 0.7,
  autoRecallMinPromptLength: 5,
  autoCapture: false,
  autoCaptureMaxMessages: 10,
};

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const int = Math.floor(value);
  return int >= 1 ? int : fallback;
}

function normalizeScore(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 0 || value > 1) return fallback;
  return value;
}

export function parseConfig(pluginConfig?: Record<string, unknown>): MemoryCorePlusConfig {
  if (!pluginConfig || typeof pluginConfig !== "object") {
    return { ...DEFAULT_CONFIG };
  }

  return {
    autoRecall: pluginConfig.autoRecall === true,
    autoRecallMaxResults: normalizePositiveInt(
      pluginConfig.autoRecallMaxResults,
      DEFAULT_CONFIG.autoRecallMaxResults,
    ),
    autoRecallMinScore: normalizeScore(
      pluginConfig.autoRecallMinScore,
      DEFAULT_CONFIG.autoRecallMinScore,
    ),
    autoRecallMinPromptLength: normalizePositiveInt(
      pluginConfig.autoRecallMinPromptLength,
      DEFAULT_CONFIG.autoRecallMinPromptLength,
    ),
    autoCapture: pluginConfig.autoCapture === true,
    autoCaptureMaxMessages: normalizePositiveInt(
      pluginConfig.autoCaptureMaxMessages,
      DEFAULT_CONFIG.autoCaptureMaxMessages,
    ),
  };
}

export const memoryCoreConfigSchema = {
  parse(value: unknown): MemoryCorePlusConfig {
    if (value === undefined || value === null) {
      return { ...DEFAULT_CONFIG };
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory-core-plus config must be an object");
    }
    return parseConfig(value as Record<string, unknown>);
  },
  safeParse(value: unknown) {
    try {
      return { success: true as const, data: this.parse(value) };
    } catch (err) {
      return {
        success: false as const,
        error: { issues: [{ path: [] as string[], message: String(err) }] },
      };
    }
  },
  uiHints: {
    autoRecall: {
      label: "Auto-Recall",
      help: "Automatically inject relevant memories into context before each agent turn",
    },
    autoRecallMaxResults: {
      label: "Max Recall Results",
      help: "Maximum number of memories to inject per turn",
      advanced: true,
    },
    autoRecallMinScore: {
      label: "Min Recall Score",
      help: "Minimum relevance score threshold (0-1)",
      advanced: true,
    },
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically capture important information from conversations via LLM extraction",
    },
    autoCaptureMaxMessages: {
      label: "Max Capture Messages",
      help: "Maximum recent messages to analyze for capture",
      advanced: true,
    },
  },
};
