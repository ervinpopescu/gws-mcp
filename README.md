# Google Workspace MCP Server (`gws-mcp`)

[![CI](https://github.com/ervinpopescu/gws-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ervinpopescu/gws-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@ervinpopescu/gws-mcp.svg)](https://www.npmjs.com/package/@ervinpopescu/gws-mcp)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A lightweight, robust [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server wrapping the [Google Workspace CLI (`gws`)](https://github.com/googleworkspace/cli). It gives LLMs and AI agents (Claude Desktop, Cursor, Pi, VS Code, Goose) dynamic access to all Google Workspace APIs (Drive, Gmail, Docs, Sheets, Calendar, Admin, and more).

---

## Features

- ⚡ **Zero Context Bloat:** Dynamic API discovery via Discovery Documents avoids registering dozens of static tools in LLM context.
- 🔒 **Security & Isolation:** Strict argument validation prevents flag/command injection.
- ⏱️ **Process Safety:** Built-in process execution timeouts, signal escalation (`SIGTERM`/`SIGKILL`), multi-byte UTF-8 stream decoding, and memory buffer bounds.
- 🛡️ **Safety & Dry-Runs:** Full support for `--dry-run`, Google Cloud Model Armor `--sanitize`, and rate-limit `--page-delay-ms`.
- 🔑 **Preflight Auth Inspection:** Built-in `gws_auth_status` tool to check active OAuth tokens, identity, and granted scopes.

---

## Prerequisites

1. **Node.js**: v18.0.0 or higher.
2. **`gws` CLI**: The official Google Workspace CLI installed and authenticated.
   - Install `gws`: [https://github.com/googleworkspace/cli](https://github.com/googleworkspace/cli)
   - Authenticate: `gws auth login` or configure service account credentials.

---

## Quickstart (npx)

Run without cloning:

```bash
npx -y @ervinpopescu/gws-mcp
```

Or install globally:

```bash
npm install -g @ervinpopescu/gws-mcp
gws-mcp
```

---

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@ervinpopescu/gws-mcp"],
      "env": {
        "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@ervinpopescu/gws-mcp"]
    }
  }
}
```

### Pi Coding Agent (`~/.pi/config.json`)

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@ervinpopescu/gws-mcp"]
    }
  }
}
```

### VS Code (Cline / Roo Code)

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@ervinpopescu/gws-mcp"]
    }
  }
}
```

### Goose (`~/.config/goose/config.yaml`)

```yaml
extensions:
  google-workspace:
    name: Google Workspace
    cmd: npx
    args:
      - -y
      - "@ervinpopescu/gws-mcp"
    enabled: true
```

---

## Available Tools

### 1. `gws_command`

Executes an arbitrary command against Google Workspace APIs.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `service` *(required)* | `string` | Google Workspace service (e.g. `"drive"`, `"sheets"`, `"gmail"`, `"calendar"`, `"docs"`). |
| `resource` *(required)* | `string` | Target resource (e.g. `"files"`, `"spreadsheets"`, `"users"`, `"events"`). |
| `method` *(required)* | `string` | API method (e.g. `"list"`, `"get"`, `"create"`, `"update"`, `"delete"`). |
| `subResource` | `string` | Optional sub-resource (e.g. `"messages"` or `"+send"`). |
| `params` | `object` / `string` | Query parameters object or JSON string. |
| `body` | `object` / `string` | Request body object or JSON string (for POST/PATCH/PUT). |
| `pageAll` | `boolean` | Set to `true` to auto-paginate all pages (`--page-all`). |
| `pageLimit` | `number` | Maximum number of pages to fetch with `pageAll`. |
| `pageDelayMs` | `number` | Delay in milliseconds between page fetches. |
| `apiVersion` | `string` | API version override (e.g. `"v2"`, `"v3"`). |
| `dryRun` | `boolean` | Preview the HTTP request without executing mutating changes. |
| `sanitize` | `boolean` | Scan inputs with Google Cloud Model Armor. |
| `upload` | `string` | Local file path to upload. |
| `download` | `string` | Local destination path to download file content. |

### 2. `gws_schema`

Queries the API schema for a specific endpoint to inspect parameter specifications and response structures.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `endpoint` *(required)* | `string` | Endpoint name (e.g. `"drive.files.list"`, `"gmail.users.messages.send"`). |
| `resolveRefs` | `boolean` | Inline `$ref` JSON schema references. |

### 3. `gws_auth_status`

Inspects active authentication status, user email, token validity, and granted OAuth scopes.

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GWS_TIMEOUT_MS` | `60000` (60s) | Child process timeout before sending `SIGTERM` / `SIGKILL`. |
| `GWS_MAX_BUFFER_SIZE` | `10485760` (10MB) | Maximum stdout/stderr buffer allocation before truncation. |

---

## Troubleshooting

### `gws CLI executable was not found in PATH`

GUI applications on macOS (Claude Desktop, Cursor) do not inherit shell profile `$PATH` definitions (`.zshrc`/`.bashrc`). Pass the explicit `PATH` containing `gws` in your `env` configuration:

```json
"env": {
  "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
}
```

---

## Development & Testing

```bash
# Clone the repository
git clone https://github.com/ervinpopescu/gws-mcp.git
cd gws-mcp

# Install dependencies
npm install

# Run automated tests
npm test
```

---

## License

[GNU General Public License v3.0](LICENSE) © 2026 Ervin Popescu
