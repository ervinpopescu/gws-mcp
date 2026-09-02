#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = Number(process.env.GWS_TIMEOUT_MS) || 60000;
const MAX_BUFFER_SIZE =
  Number(process.env.GWS_MAX_BUFFER_SIZE) || 10 * 1024 * 1024; // 10MB
const IDENTIFIER_REGEX = /^(?:\+[a-zA-Z0-9_-]+|[a-zA-Z0-9][a-zA-Z0-9_-]*)$/;
const ENDPOINT_REGEX =
  /^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9_-]+)*(?:\+[a-zA-Z0-9_-]+)?$/;

/**
 * Builds the command-line arguments array for the `gws` CLI.
 * Validates inputs against flag/argument injection.
 *
 * @param {string} toolName
 * @param {Record<string, any>} [args]
 * @returns {string[]}
 */
export function buildCommandArgs(toolName, args = {}) {
  if (!args || typeof args !== "object") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Tool arguments must be a non-null object.",
    );
  }

  if (toolName === "gws_command") {
    const {
      service,
      resource,
      subResource,
      method,
      params,
      body,
      pageAll,
      pageLimit,
      pageDelayMs,
      apiVersion,
      dryRun,
      sanitize,
      upload,
      download,
    } = args;

    if (
      !service ||
      typeof service !== "string" ||
      !IDENTIFIER_REGEX.test(service)
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid or missing 'service' parameter: ${JSON.stringify(service)}`,
      );
    }
    if (
      !resource ||
      typeof resource !== "string" ||
      !IDENTIFIER_REGEX.test(resource)
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid or missing 'resource' parameter: ${JSON.stringify(resource)}`,
      );
    }
    if (subResource !== undefined && subResource !== null) {
      if (
        typeof subResource !== "string" ||
        !IDENTIFIER_REGEX.test(subResource)
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid 'subResource' parameter: ${JSON.stringify(subResource)}`,
        );
      }
    }
    if (
      !method ||
      typeof method !== "string" ||
      !IDENTIFIER_REGEX.test(method)
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid or missing 'method' parameter: ${JSON.stringify(method)}`,
      );
    }

    const cmdArgs = [service, resource];
    if (subResource) {
      cmdArgs.push(subResource);
    }
    cmdArgs.push(method);
    cmdArgs.push("--format", "json");

    if (params !== undefined && params !== null) {
      if (typeof params === "string") {
        try {
          JSON.parse(params);
          cmdArgs.push("--params", params);
        } catch {
          cmdArgs.push("--params", JSON.stringify(params));
        }
      } else if (typeof params === "object") {
        cmdArgs.push("--params", JSON.stringify(params));
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'params' must be an object or JSON string.",
        );
      }
    }

    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        try {
          JSON.parse(body);
          cmdArgs.push("--json", body);
        } catch {
          cmdArgs.push("--json", JSON.stringify(body));
        }
      } else if (typeof body === "object") {
        cmdArgs.push("--json", JSON.stringify(body));
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'body' must be an object or JSON string.",
        );
      }
    }

    if (pageAll === true) {
      cmdArgs.push("--page-all");
    }
    if (pageLimit !== undefined && pageLimit !== null) {
      const limit = Number(pageLimit);
      if (Number.isNaN(limit) || limit < 1) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'pageLimit' must be a positive number.",
        );
      }
      cmdArgs.push("--page-limit", String(Math.floor(limit)));
    }
    if (pageDelayMs !== undefined && pageDelayMs !== null) {
      const delay = Number(pageDelayMs);
      if (Number.isNaN(delay) || delay < 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'pageDelayMs' must be a non-negative number.",
        );
      }
      cmdArgs.push("--page-delay-ms", String(Math.floor(delay)));
    }
    if (apiVersion) {
      if (
        typeof apiVersion !== "string" ||
        !IDENTIFIER_REGEX.test(apiVersion)
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid 'apiVersion' format.",
        );
      }
      cmdArgs.push("--api-version", apiVersion);
    }
    if (dryRun === true) {
      cmdArgs.push("--dry-run");
    }
    if (sanitize === true) {
      cmdArgs.push("--sanitize");
    }
    if (upload) {
      if (typeof upload !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'upload' must be a file path string.",
        );
      }
      cmdArgs.push("--upload", upload);
    }
    if (download) {
      if (typeof download !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "'download' must be a file path string.",
        );
      }
      cmdArgs.push("--download", download);
    }

    return cmdArgs;
  }

  if (toolName === "gws_schema") {
    const { endpoint, resolveRefs } = args;
    if (
      !endpoint ||
      typeof endpoint !== "string" ||
      !ENDPOINT_REGEX.test(endpoint)
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid or missing 'endpoint' parameter: ${JSON.stringify(endpoint)}`,
      );
    }
    const cmdArgs = ["schema", endpoint];
    if (resolveRefs === true) {
      cmdArgs.push("--resolve-refs");
    }
    return cmdArgs;
  }

  if (toolName === "gws_auth_status") {
    return ["auth", "status", "--format", "json"];
  }

  throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${toolName}`);
}

/**
 * Spawns a CLI process with stream decoding, buffer bounds, and timeout management.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export const runCommand = async (cmd, args, options = {}) => {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBufferSize = options.maxBufferSize || MAX_BUFFER_SIZE;

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...options.env },
      });
    } catch (err) {
      return reject(err);
    }

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            try {
              proc.kill("SIGTERM");
              const killTimer = setTimeout(() => {
                try {
                  proc.kill("SIGKILL");
                } catch (_) {}
              }, 2000);
              if (killTimer.unref) killTimer.unref();
            } catch (_) {}
          }, timeoutMs)
        : null;

    if (timer && timer.unref) {
      timer.unref();
    }

    proc.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > maxBufferSize) {
        if (!stdoutTruncated) {
          stdout += stdoutDecoder.write(
            chunk.subarray(0, Math.max(0, maxBufferSize - stdout.length)),
          );
          stdoutTruncated = true;
        }
      } else {
        stdout += stdoutDecoder.write(chunk);
      }
    });

    proc.stderr.on("data", (chunk) => {
      if (stderr.length + chunk.length > maxBufferSize) {
        if (!stderrTruncated) {
          stderr += stderrDecoder.write(
            chunk.subarray(0, Math.max(0, maxBufferSize - stderr.length)),
          );
          stderrTruncated = true;
        }
      } else {
        stderr += stderrDecoder.write(chunk);
      }
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    proc.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();

      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();

      if (stdoutTruncated) {
        stdout += "\n... [output truncated: exceeded maximum buffer size]";
      }
      if (stderrTruncated) {
        stderr += "\n... [stderr truncated: exceeded maximum buffer size]";
      }

      if (timedOut) {
        reject(
          new Error(
            `Command '${cmd} ${args.join(" ")}' timed out after ${timeoutMs}ms (terminated with SIGTERM/SIGKILL).`,
          ),
        );
      } else if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const exitDesc = signal ? `killed by signal ${signal}` : `code ${code}`;
        const detail =
          stderr.trim() || stdout.trim() || "No error output provided";
        reject(new Error(`Command failed with ${exitDesc}:\n${detail}`));
      }
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `The '${cmd}' CLI executable was not found in PATH.\n` +
              `Please ensure the Google Workspace CLI (gws) is installed and available in your PATH.\n` +
              `See: https://github.com/googleworkspace/cli`,
          ),
        );
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Creates and configures the MCP Server instance.
 * Accepts an optional runner override for testing.
 *
 * @param {object} [options]
 * @param {(cmd: string, args: string[]) => Promise<{ stdout: string, stderr: string }>} [options.runner]
 * @returns {Server}
 */
export function createServer(options = {}) {
  const runner = options.runner || runCommand;

  const server = new Server(
    {
      name: "google-workspace-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "gws_command",
          description:
            "Execute a Google Workspace CLI (gws) command to interact with Google Workspace APIs (e.g. drive, docs, sheets, gmail, calendar, etc). Supports dynamic API discovery, pagination, safety dry-runs, and file transfers.",
          inputSchema: {
            type: "object",
            properties: {
              service: {
                type: "string",
                description:
                  "The Google Workspace service (e.g. 'drive', 'sheets', 'gmail', 'calendar', 'docs', 'admin').",
              },
              resource: {
                type: "string",
                description:
                  "The resource (e.g. 'files', 'spreadsheets', 'users').",
              },
              subResource: {
                type: "string",
                description:
                  "An optional sub-resource (e.g. 'messages' for 'gmail users messages' or '+send' for helper).",
              },
              method: {
                type: "string",
                description:
                  "The method to call (e.g. 'list', 'get', 'create', 'update', 'delete').",
              },
              params: {
                type: "object",
                description: "URL/Query parameters as JSON object.",
              },
              body: {
                type: "object",
                description:
                  "Request body as JSON object (for POST/PATCH/PUT).",
              },
              pageAll: {
                type: "boolean",
                description:
                  "Auto-paginate all result pages, returning one JSON line per page (NDJSON).",
              },
              pageLimit: {
                type: "number",
                description:
                  "Maximum number of pages to fetch when pageAll is true (default: 10).",
              },
              pageDelayMs: {
                type: "number",
                description:
                  "Delay in milliseconds between page fetches to respect API rate limits.",
              },
              apiVersion: {
                type: "string",
                description: "Override the API version (e.g. 'v2', 'v3').",
              },
              dryRun: {
                type: "boolean",
                description:
                  "Inspect the HTTP request (method, URI, headers, body) without executing it.",
              },
              sanitize: {
                type: "boolean",
                description:
                  "Scan input prompts/parameters with Google Cloud Model Armor for safety.",
              },
              upload: {
                type: "string",
                description:
                  "Local file path to upload (multipart/media upload).",
              },
              download: {
                type: "string",
                description:
                  "Local file destination path to download media content directly to disk.",
              },
            },
            required: ["service", "resource", "method"],
          },
        },
        {
          name: "gws_schema",
          description:
            "Get the API schema for a specific gws endpoint (e.g. 'drive.files.list', 'gmail.users.messages.send') to inspect parameters and payload structure.",
          inputSchema: {
            type: "object",
            properties: {
              endpoint: {
                type: "string",
                description:
                  "The endpoint to get schema for (e.g. 'drive.files.list').",
              },
              resolveRefs: {
                type: "boolean",
                description:
                  "Whether to resolve JSON schema references inline.",
              },
            },
            required: ["endpoint"],
          },
        },
        {
          name: "gws_auth_status",
          description:
            "Check the active Google Workspace CLI authentication status, user identity, token expiration, and granted OAuth scopes.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      const cmdArgs = buildCommandArgs(name, args);
      const { stdout, stderr } = await runner("gws", cmdArgs);
      const resultText =
        stdout.trim() || stderr.trim() || "Success (no output)";
      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (err) {
      if (err instanceof McpError) {
        throw err;
      }
      return {
        content: [
          {
            type: "text",
            text: err.message || String(err),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Initializes and connects the MCP server over stdio transport.
 */
export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    try {
      await server.close();
    } catch (_) {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
}

const isMain =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === resolve(process.argv[1]) ||
    process.argv[1].endsWith("/gws-mcp") ||
    process.argv[1].endsWith("\\gws-mcp"));

if (isMain) {
  startServer().catch((err) => {
    console.error("Fatal error starting gws-mcp server:", err);
    process.exit(1);
  });
}
