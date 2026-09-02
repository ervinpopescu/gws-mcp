import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { buildCommandArgs, createServer, runCommand } from "../index.js";

describe("buildCommandArgs", () => {
  describe("gws_command", () => {
    it("should build basic command arguments", () => {
      const args = buildCommandArgs("gws_command", {
        service: "drive",
        resource: "files",
        method: "list",
      });
      assert.deepEqual(args, ["drive", "files", "list", "--format", "json"]);
    });

    it("should include subResource when provided", () => {
      const args = buildCommandArgs("gws_command", {
        service: "gmail",
        resource: "users",
        subResource: "messages",
        method: "list",
      });
      assert.deepEqual(args, [
        "gmail",
        "users",
        "messages",
        "list",
        "--format",
        "json",
      ]);
    });

    it("should serialize params and body objects to JSON strings", () => {
      const args = buildCommandArgs("gws_command", {
        service: "drive",
        resource: "files",
        method: "create",
        params: { supportsAllDrives: true },
        body: {
          name: "Report.docx",
          mimeType: "application/vnd.google-apps.document",
        },
      });
      assert.deepEqual(args, [
        "drive",
        "files",
        "create",
        "--format",
        "json",
        "--params",
        JSON.stringify({ supportsAllDrives: true }),
        "--json",
        JSON.stringify({
          name: "Report.docx",
          mimeType: "application/vnd.google-apps.document",
        }),
      ]);
    });

    it("should accept valid JSON strings for params and body without double-encoding", () => {
      const paramsJson = JSON.stringify({ q: "mimeType='image/png'" });
      const bodyJson = JSON.stringify({ title: "My Sheet" });
      const args = buildCommandArgs("gws_command", {
        service: "sheets",
        resource: "spreadsheets",
        method: "create",
        params: paramsJson,
        body: bodyJson,
      });
      assert.deepEqual(args, [
        "sheets",
        "spreadsheets",
        "create",
        "--format",
        "json",
        "--params",
        paramsJson,
        "--json",
        bodyJson,
      ]);
    });

    it("should handle pagination, delay, and version flags", () => {
      const args = buildCommandArgs("gws_command", {
        service: "calendar",
        resource: "events",
        method: "list",
        pageAll: true,
        pageLimit: 5,
        pageDelayMs: 250,
        apiVersion: "v3",
      });
      assert.deepEqual(args, [
        "calendar",
        "events",
        "list",
        "--format",
        "json",
        "--page-all",
        "--page-limit",
        "5",
        "--page-delay-ms",
        "250",
        "--api-version",
        "v3",
      ]);
    });

    it("should handle safety and file transfer flags (dryRun, sanitize, upload, download)", () => {
      const args = buildCommandArgs("gws_command", {
        service: "drive",
        resource: "files",
        method: "create",
        dryRun: true,
        sanitize: true,
        upload: "/tmp/upload.pdf",
        download: "/tmp/download.pdf",
      });
      assert.deepEqual(args, [
        "drive",
        "files",
        "create",
        "--format",
        "json",
        "--dry-run",
        "--sanitize",
        "--upload",
        "/tmp/upload.pdf",
        "--download",
        "/tmp/download.pdf",
      ]);
    });

    it("should throw InvalidParams when missing required fields", () => {
      assert.throws(
        () =>
          buildCommandArgs("gws_command", {
            service: "drive",
            resource: "files",
          }),
        (err) =>
          err instanceof McpError && err.code === ErrorCode.InvalidParams,
      );
    });

    it("should reject flag-like positional parameters to prevent injection", () => {
      assert.throws(
        () =>
          buildCommandArgs("gws_command", {
            service: "--danger",
            resource: "files",
            method: "list",
          }),
        (err) =>
          err instanceof McpError && err.code === ErrorCode.InvalidParams,
      );
    });

    it("should reject invalid pageLimit values", () => {
      assert.throws(
        () =>
          buildCommandArgs("gws_command", {
            service: "drive",
            resource: "files",
            method: "list",
            pageLimit: -1,
          }),
        (err) =>
          err instanceof McpError && err.code === ErrorCode.InvalidParams,
      );
    });
  });

  describe("gws_schema", () => {
    it("should build schema inspection command", () => {
      const args = buildCommandArgs("gws_schema", {
        endpoint: "drive.files.list",
      });
      assert.deepEqual(args, ["schema", "drive.files.list"]);
    });

    it("should include resolveRefs flag when true", () => {
      const args = buildCommandArgs("gws_schema", {
        endpoint: "gmail.users.messages.send",
        resolveRefs: true,
      });
      assert.deepEqual(args, [
        "schema",
        "gmail.users.messages.send",
        "--resolve-refs",
      ]);
    });

    it("should throw on invalid endpoint format", () => {
      assert.throws(
        () =>
          buildCommandArgs("gws_schema", {
            endpoint: "invalid;endpoint& injection",
          }),
        (err) =>
          err instanceof McpError && err.code === ErrorCode.InvalidParams,
      );
    });
  });

  describe("gws_auth_status", () => {
    it("should build auth status command", () => {
      const args = buildCommandArgs("gws_auth_status", {});
      assert.deepEqual(args, ["auth", "status", "--format", "json"]);
    });
  });

  describe("unknown tool", () => {
    it("should throw MethodNotFound for unrecognized tool names", () => {
      assert.throws(
        () => buildCommandArgs("nonexistent_tool", {}),
        (err) =>
          err instanceof McpError && err.code === ErrorCode.MethodNotFound,
      );
    });
  });
});

describe("MCP Server Integration (InMemoryTransport)", () => {
  it("should list all available tools and their schemas", async () => {
    const server = createServer();
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    assert.ok(toolNames.includes("gws_command"));
    assert.ok(toolNames.includes("gws_schema"));
    assert.ok(toolNames.includes("gws_auth_status"));

    await client.close();
    await server.close();
  });

  it("should successfully execute tool calls with mock runner", async () => {
    const mockOutput = JSON.stringify({
      status: "authenticated",
      email: "user@example.com",
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const recordedCalls = [];
    const mockRunner = async (cmd, args) => {
      recordedCalls.push({ cmd, args });
      return { stdout: mockOutput, stderr: "" };
    };

    const server = createServer({ runner: mockRunner });
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: "gws_auth_status",
      arguments: {},
    });

    assert.equal(recordedCalls.length, 1);
    assert.equal(recordedCalls[0].cmd, "gws");
    assert.deepEqual(recordedCalls[0].args, [
      "auth",
      "status",
      "--format",
      "json",
    ]);
    assert.equal(result.content[0].text, mockOutput);
    assert.equal(result.isError, undefined);

    await client.close();
    await server.close();
  });

  it("should handle runner failure gracefully with isError: true", async () => {
    const mockRunner = async () => {
      throw new Error(
        "CLI authentication required. Please run 'gws auth login'.",
      );
    };

    const server = createServer({ runner: mockRunner });
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: "gws_command",
      arguments: {
        service: "drive",
        resource: "files",
        method: "list",
      },
    });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("CLI authentication required"));

    await client.close();
    await server.close();
  });
});

describe("runCommand", () => {
  it("should execute standard command and return stdout", async () => {
    const { stdout } = await runCommand("node", [
      "-e",
      "console.log('test-output')",
    ]);
    assert.equal(stdout.trim(), "test-output");
  });

  it("should reject on non-zero exit code with stderr", async () => {
    await assert.rejects(
      () =>
        runCommand("node", [
          "-e",
          "process.stderr.write('fatal failure'); process.exit(2)",
        ]),
      (err) =>
        err.message.includes("fatal failure") && err.message.includes("code 2"),
    );
  });

  it("should give helpful error when executable is missing in PATH (ENOENT)", async () => {
    await assert.rejects(
      () => runCommand("non_existent_binary_xyz_12345", []),
      (err) =>
        err.message.includes("was not found in PATH") &&
        err.message.includes("https://github.com/googleworkspace/cli"),
    );
  });

  it("should terminate and reject on timeout", async () => {
    await assert.rejects(
      () =>
        runCommand("node", ["-e", "setInterval(() => {}, 1000)"], {
          timeoutMs: 150,
        }),
      (err) => err.message.includes("timed out after 150ms"),
    );
  });
});
