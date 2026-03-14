import type { OpenClawPluginApi } from "openclaw/plugin-sdk/memory-core-plus";
import type { MemoryCorePlusConfig } from "./config.js";
import { formatRelevantMemoriesContext } from "./safety.js";

export function createRecallHook(api: OpenClawPluginApi, cfg: MemoryCorePlusConfig) {
  return async (
    event: { prompt: string; messages: unknown[] },
    ctx: { agentId?: string; sessionKey?: string; trigger?: string },
  ) => {
    if (!event.prompt || event.prompt.length < cfg.autoRecallMinPromptLength) {
      api.logger.info(
        `memory-core-plus: recall skipped (prompt too short: ${event.prompt?.length ?? 0} < ${cfg.autoRecallMinPromptLength})`,
      );
      return;
    }

    if (ctx.trigger === "memory") {
      api.logger.info("memory-core-plus: recall skipped (trigger=memory)");
      return;
    }

    const agentId = ctx.agentId ?? "default";
    let manager;
    try {
      const result = await api.runtime.tools.getMemorySearchManager({
        cfg: api.config,
        agentId,
      });
      manager = result.manager;
      if (!manager) {
        if (result.error) {
          api.logger.warn(
            `memory-core-plus: recall skipped, search manager unavailable: ${result.error}`,
          );
        }
        return;
      }
    } catch (err) {
      api.logger.warn(`memory-core-plus: recall init failed: ${String(err)}`);
      return;
    }

    try {
      // Probe whether an embedding provider is available.
      // In FTS-only mode (no embedding model configured), BM25 scores top out
      // around 0.3–0.5, so applying the semantic minScore (default 0.7) would
      // filter every result. Instead, omit minScore and let the manager apply
      // its own DEFAULT_MIN_SCORE (0.35) — the same behaviour as openclaw's
      // built-in memory tool.
      const probe = await manager.probeEmbeddingAvailability();
      const isFtsOnly = !probe.ok;
      if (isFtsOnly) {
        api.logger.warn(
          `memory-core-plus: no embedding model configured, recall running in FTS-only mode (autoRecallMinScore ignored)`,
        );
      }

      const results = await manager.search(event.prompt, {
        maxResults: cfg.autoRecallMaxResults,
        sessionKey: ctx.sessionKey,
        ...(isFtsOnly ? {} : { minScore: cfg.autoRecallMinScore }),
      });

      if (results.length === 0) {
        api.logger.info("memory-core-plus: recall search returned 0 results");
        return;
      }

      api.logger.info(`memory-core-plus: injecting ${results.length} memories into context`);
      return {
        prependContext: formatRelevantMemoriesContext(results),
      };
    } catch (err) {
      api.logger.warn(`memory-core-plus: recall search failed: ${String(err)}`);
    }
  };
}
