import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createMcpServer from "./server.js";

async function runServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Design System MCP Server running on stdio");
}

runServer().catch((error: unknown) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
