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
      const results = await manager.search(event.prompt, {
        maxResults: cfg.autoRecallMaxResults,
        sessionKey: ctx.sessionKey,
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
