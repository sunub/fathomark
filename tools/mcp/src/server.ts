import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { tools } from "./tools/index.js";

export default function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "my-design-system",
      version: "1.0.0",
    },
    {
      instructions: `
This server provides access to design system tokens and component metadata.

Available tools:
- get_theme_tokens: Retrieve theme tokens (colors, spacing, sizes, etc.).
- search_components: Search for components in the design system.
- get_component_detail: Retrieve details for a specific component.
- suggest_sprinkles_match: Suggest Vanilla-Extract Sprinkles mappings for CSS styles.
- refresh_mcp_data: Trigger a rebuild and reload of MCP design system metadata.
      `,
    },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema as Record<string, z.ZodType>,
        annotations: tool.annotations,
      },
      tool.handler as (args: Record<string, unknown>) => Promise<{
        isError?: boolean;
        content: Array<{
          type: "text";
          text: string;
        }>;
      }>,
    );
  }

  return server;
}
