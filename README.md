# Glide API MCP Server

A Model Context Protocol server for interacting with the Glide API (v1 & v2).

## Features

- Support for both Glide API v1 and v2
- Secure API key handling through environment variables
- Type-safe TypeScript implementation
- Comprehensive error handling

## Available Tools

- `set_api_version`: Configure API version and authentication
- `get_app`: Get app information
- `get_tables`: List app tables
- `get_table_rows`: Get table data
- `add_table_row`: Add new row
- `update_table_row`: Update existing row

## Secure Setup

### 1. Environment Variables

The server supports secure configuration through environment variables in the MCP settings file. Add your API credentials to the MCP settings file:

```json
{
  "mcpServers": {
    "glide-api": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "GLIDE_API_KEY": "your-api-key-here",
        "GLIDE_API_VERSION": "v2"  // or "v1" for v1 API
      }
    }
  }
}
```

This approach keeps your API key secure by:
- Storing it in a configuration file rather than in code
- Keeping it out of version control
- Making it easy to update without modifying code

### 2. Runtime Configuration

While environment variables are the recommended way to configure the server, you can also set or override the API version and key at runtime using the `set_api_version` tool:

```typescript
use_mcp_tool({
  server_name: "glide-api",
  tool_name: "set_api_version",
  arguments: {
    version: "v2",
    apiKey: "your-api-key"
  }
});
```

Note: The runtime configuration will override any environment variables for the current session.

### 3. Security Best Practices

1. Never commit API keys to version control
2. Use environment variables in the MCP settings file
3. Regularly rotate your API keys
4. Set appropriate file permissions on the settings file

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Usage Examples

1. Get app information:
```typescript
use_mcp_tool({
  server_name: "glide-api",
  tool_name: "get_app",
  arguments: {
    appId: "your-app-id"
  }
});
```

2. Add a row to a table:
```typescript
use_mcp_tool({
  server_name: "glide-api",
  tool_name: "add_table_row",
  arguments: {
    appId: "your-app-id",
    tableId: "your-table-id",
    values: {
      column1: "value1",
      column2: "value2"
    }
  }
});
