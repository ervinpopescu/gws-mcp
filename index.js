#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";

const server = new Server(
  {
    name: "google-workspace-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const runCommand = async (cmd, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "gws_command",
        description: "Execute a Google Workspace CLI (gws) command to interact with Google Workspace APIs (e.g. drive, docs, gmail, calendar, etc).",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string", description: "The Google Workspace service (e.g. 'drive', 'sheets', 'gmail')." },
            resource: { type: "string", description: "The resource (e.g. 'files', 'spreadsheets')." },
            subResource: { type: "string", description: "An optional sub-resource (e.g. 'messages' for 'gmail users messages')." },
            method: { type: "string", description: "The method to call (e.g. 'list', 'get', 'create')." },
            params: { type: "object", description: "URL/Query parameters as JSON object." },
            body: { type: "object", description: "Request body as JSON object (for POST/PATCH/PUT)." },
            pageAll: { type: "boolean", description: "Auto-paginate, one JSON line per page (NDJSON)." },
            pageLimit: { type: "number", description: "Max pages to fetch with pageAll (default: 10)." },
            apiVersion: { type: "string", description: "Override the API version (e.g. 'v2', 'v3')." },
          },
          required: ["service", "resource", "method"],
        },
      },
      {
        name: "gws_schema",
        description: "Get the API schema for a specific gws endpoint (e.g. drive.files.list).",
        inputSchema: {
          type: "object",
          properties: {
            endpoint: { type: "string", description: "The endpoint to get schema for (e.g. 'drive.files.list')." },
            resolveRefs: { type: "boolean", description: "Whether to resolve JSON schema references." },
          },
          required: ["endpoint"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "gws_command") {
    const { service, resource, subResource, method, params, body, pageAll, pageLimit, apiVersion } = request.params.arguments;
    
    const args = [service, resource];
    if (subResource) args.push(subResource);
    args.push(method);
    args.push("--format", "json");

    if (params) {
      args.push("--params", JSON.stringify(params));
    }
    if (body) {
      args.push("--json", JSON.stringify(body));
    }
    if (pageAll) {
      args.push("--page-all");
    }
    if (pageLimit !== undefined) {
      args.push("--page-limit", pageLimit.toString());
    }
    if (apiVersion) {
      args.push("--api-version", apiVersion);
    }

    try {
      const { stdout, stderr } = await runCommand("gws", args);
      return {
        content: [
          { type: "text", text: stdout || stderr || "Success (no output)" },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: err.message },
        ],
        isError: true,
      };
    }
  } else if (request.params.name === "gws_schema") {
    const { endpoint, resolveRefs } = request.params.arguments;
    const args = ["schema", endpoint];
    if (resolveRefs) {
      args.push("--resolve-refs");
    }
    
    try {
      const { stdout, stderr } = await runCommand("gws", args);
      return {
        content: [
          { type: "text", text: stdout || stderr || "Success (no output)" },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: err.message },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);