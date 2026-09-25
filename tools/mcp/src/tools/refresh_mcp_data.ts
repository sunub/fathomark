import { execSync } from "child_process";
import type { McpTool } from "./types.js";
import { designSystemData, loadData } from "../data.js";
import { ToolCategory } from "./category.js";

export const refreshMcpData: McpTool<Record<string, never>> = {
  name: "refresh_mcp_data",
  annotations: {
    category: ToolCategory.SYSTEM,
    readOnlyHint: false,
  },
  schema: {},
  handler: async () => {
    try {
      const root = designSystemData.designSystemRoot;
      console.error(`Running build:mcp in ${root}...`);
      execSync("pnpm build:mcp", { cwd: root });

      loadData();

      return {
        content: [
          {
            type: "text",
            text: "MCP metadata generated and reloaded successfully!",
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to refresh MCP metadata: ${errorMessage}`,
          },
        ],
      };
    }
  },
};
