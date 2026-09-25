import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Spawn the MCP server process
const serverPath = path.resolve(__dirname, "./build/index.js");
console.log(`Starting MCP server from: ${serverPath}`);

const mcpProcess = spawn("node", [serverPath]);

mcpProcess.stderr.on("data", (data) => {
  console.log(`[Server Stderr]: ${data.toString().trim()}`);
});

let responseId = 1;
const pendingRequests = new Map();

mcpProcess.stdout.on("data", (data) => {
  const messages = data.toString().split("\n").filter(Boolean);
  for (const message of messages) {
    try {
      const parsed = JSON.parse(message);
      console.log(`[Received JSON-RPC]:`, JSON.stringify(parsed, null, 2));
      if (parsed.id && pendingRequests.has(parsed.id)) {
        const resolve = pendingRequests.get(parsed.id);
        resolve(parsed);
        pendingRequests.delete(parsed.id);
      }
    } catch (err) {
      console.log(`[Non-JSON Output]: ${message}`);
    }
  }
});

function sendRequest(method, params = {}) {
  return new Promise((resolve) => {
    const id = responseId++;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    pendingRequests.set(id, resolve);
    console.log(`\n[Sending Request]: ${method} with params:`, JSON.stringify(params));
    mcpProcess.stdin.write(JSON.stringify(request) + "\n");
  });
}

async function runTests() {
  try {
    // Wait a brief moment for startup
    await new Promise((r) => setTimeout(r, 1000));

    // Test 1: listTools
    const toolsResult = await sendRequest("tools/list");
    
    // Test 2: Call get_theme_tokens for color
    await sendRequest("tools/call", {
      name: "get_theme_tokens",
      arguments: { category: "color" }
    });

    // Test 3: Call search_components
    await sendRequest("tools/call", {
      name: "search_components",
      arguments: { query: "Button" }
    });

    // Test 4: Call get_component_detail for Button
    await sendRequest("tools/call", {
      name: "get_component_detail",
      arguments: { name: "Button" }
    });

    // Test 5: Call suggest_sprinkles_match
    await sendRequest("tools/call", {
      name: "suggest_sprinkles_match",
      arguments: {
        style: {
          color: "#ef4444",
          padding: "12px",
          marginLeft: "auto"
        }
      }
    });

    console.log("\nAll tests completed!");
  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    mcpProcess.kill();
    process.exit(0);
  }
}

runTests();
