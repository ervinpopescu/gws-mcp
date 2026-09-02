# Google Workspace MCP Server (`gws-mcp`)

A Model Context Protocol (MCP) server that wraps the [Google Workspace CLI (`gws`)](https://github.com/googleworkspace/cli) to provide LLMs and AI agents with direct access to Google Workspace APIs (Drive, Docs, Sheets, Gmail, Calendar, etc.).

## Prerequisites

1. Node.js (v18+)
2. The `gws` CLI installed and authenticated on your system.
   - The MCP server runs `gws` commands under the hood, so it inherits whatever OAuth credentials or environment variables you have configured for `gws`.

## Installation

```bash
git clone https://github.com/ervinpopescu/gws-mcp.git
cd gws-mcp
npm install
```

## Configuration (MCP Clients)

To use this server in an MCP client like Claude Desktop, Cursor, or Pi, add it to your configuration file (e.g., `claude_desktop_config.json` or `mcp.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": [
        "/path/to/gws-mcp/index.js"
      ]
    }
  }
}
```

## Available Tools

### `gws_command`
Executes an arbitrary command against Google Workspace APIs.
* **Parameters:**
  * `service` (string): Google Workspace service (e.g., `"drive"`, `"sheets"`, `"gmail"`).
  * `resource` (string): The resource (e.g., `"files"`).
  * `subResource` (string, optional): A sub-resource (e.g., `"messages"` for `"gmail users messages"`).
  * `method` (string): The method to call (e.g., `"list"`, `"get"`, `"create"`).
  * `params` (object, optional): Query parameters.
  * `body` (object, optional): Request body (for POST/PATCH/PUT).
  * `pageAll` (boolean, optional): Set to `true` to fetch all pages (`--page-all`).
  * `pageLimit` (number, optional): Max pages to fetch with `pageAll`.

### `gws_schema`
Queries the API schema for a specific endpoint to help the LLM understand required parameters and response formats.
* **Parameters:**
  * `endpoint` (string): The endpoint to get the schema for (e.g., `"drive.files.list"`).
  * `resolveRefs` (boolean, optional): Whether to resolve JSON schema references.
