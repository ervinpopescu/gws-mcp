# gws-mcp Agent Context

## Overview
This directory contains `gws-mcp`, a Model Context Protocol (MCP) server wrapping the `gws` (Google Workspace) CLI.

## Key Files
- `index.js`: The main MCP server implementation. It uses `@modelcontextprotocol/sdk` to define tools and `child_process.spawn` to execute `gws` commands.
- `package.json`: Contains the dependencies. Note that `"type": "module"` is required because the MCP SDK is ESM-only.

## How it works
The server exposes two tools:
1. `gws_command`: Translates JSON parameters into `gws` CLI arguments (e.g., `--params`, `--json`, `--page-all`). It parses stdout/stderr and returns it as a text block to the LLM.
2. `gws_schema`: Runs `gws schema <endpoint>` to help the LLM discover available fields and methods dynamically.

## Future Development
If you are an agent modifying this repository:
- Keep the `gws` CLI dependency abstracted behind the MCP tool layer.
- When adding new tools, consider performance (e.g., don't stream massive binary files back as text).
- Be aware that authentication is handled *outside* this script by the `gws` CLI's own OAuth mechanisms or environment variables (`GOOGLE_WORKSPACE_CLI_TOKEN`, etc.). Do not try to implement OAuth flows directly in `index.js`.
