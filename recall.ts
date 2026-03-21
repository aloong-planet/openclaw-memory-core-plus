import type { OpenClawPluginApi } from "openclaw/plugin-sdk/memory-core-plus";
import type { MemoryCorePlusConfig } from "./config.js";
import { extractUserQuery, formatRelevantMemoriesContext } from "./safety.js";

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

    if (ctx.trigger === "memory" || ctx.sessionKey?.includes(":memory-capture:")) {
      api.logger.info("memory-core-plus: recall skipped (inside memory-capture subagent, no recall needed)");
      return;
    }

    const tool = api.runtime.tools.createMemorySearchTool({
      config: api.config,
      agentSessionKey: ctx.sessionKey,
    });
    if (!tool) {
      api.logger.info("memory-core-plus: recall skipped, memory search unavailable");
      return;
    }

    try {
      const searchQuery = extractUserQuery(event.prompt);
      const searchStart = Date.now();
      const result = await tool.execute("recall-auto", {
        query: searchQuery,
        maxResults: cfg.autoRecallMaxResults,
      });
      const searchMs = Date.now() - searchStart;
      const details = result.details as {
        results?: Array<{ path: string; snippet: string; score: number }>;
        disabled?: boolean;
        error?: string;
      };

      if (details.disabled) {
        api.logger.info("memory-core-plus: recall skipped, memory search disabled");
        return;
      }
      if (details.error) {
        api.logger.warn(`memory-core-plus: recall search error: ${details.error}`);
        return;
      }

      const results = details.results ?? [];
      if (results.length === 0) {
        api.logger.info(
          `memory-core-plus: recall search returned 0 results (${searchMs}ms, query: "${truncate(searchQuery, 80)}")`,
        );
        return;
      }

      const summary = results.map((r) => `${r.path}(${(r.score * 100).toFixed(0)}%)`).join(", ");
      api.logger.info(
        `memory-core-plus: injecting ${results.length} memories into context (${searchMs}ms) [${summary}]`,
      );
      return {
        prependContext: formatRelevantMemoriesContext(results),
      };
    } catch (err) {
      api.logger.warn(`memory-core-plus: recall search failed: ${String(err)}`);
    }
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}
