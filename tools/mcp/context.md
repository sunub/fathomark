# Design System MCP Context

## 1. Role and Purpose
- This package implements a Model Context Protocol (MCP) server for the `design-system` package. It provides AI agents with read access, search utilities, and styling suggestions based on the compiled tokens and React components.
- The MCP server uses `@modelcontextprotocol/sdk` and dynamically loads metadata (`mcp-tokens.json`, `mcp-components.json`) from the design system's `dist/` directory.

## 2. Core Sub-domains
- [src/tools](file:///Users/sunub/workspace/for-digital-divide/packages/mcp/src/tools): Contains individual tool implementations for the MCP server.
  - `get_theme_tokens`: Retrieve theme tokens (colors, spacing, sizes, etc.).
  - `search_components`: Search for components in the design system.
  - `get_component_detail`: Retrieve details for a specific component.
  - `suggest_sprinkles_match`: Suggest Vanilla-Extract Sprinkles mappings for CSS styles.
  - `refresh_mcp_data`: Trigger a rebuild and reload of MCP design system metadata.

## 3. Shared Assets & Helpers

### Data Management (src/data.ts)
- `loadData() => void`: Dynamically loads theme tokens and components metadata JSON files from the design system's `dist/` folder.
- `designSystemData`: An object with getters for `tokens`, `components`, and the `designSystemRoot` path.

### External Dependencies
- `@internal/design-system-linter`: Provides the core business logic (`auditStyles`) for mapping CSS properties to design system Sprinkles/tokens. This package is shared with external static analysis tools (e.g., Stylelint).

### Types & Interfaces

**From `src/data.ts`:**
- `interface TokenCategoryData`: Mapping of token names to their values or records.
- `interface TokensData`: Mapping of categories to token data.
- `interface ComponentPropInfo`: Info about a component property (type, description, default).
- `interface ComponentInfo`: Metadata for a specific React component.
- `interface ComponentsData`: Mapping of component names to component info.

**From `src/tools/types.ts`:**
- `interface McpTool<T extends z.ZodRawShape>`: Structure for registering a tool on the MCP server.

## 4. Directory Structure (Max Depth 3)
```
packages/mcp/
├── package.json
├── tsconfig.json
└── src/
    ├── data.ts
    ├── index.ts
    ├── server.ts
    └── tools/
        ├── category.ts
        ├── get_component_detail.ts
        ├── get_theme_tokens.ts
        ├── index.ts
        ├── refresh_mcp_data.ts
        ├── search_components.ts
        ├── suggest_sprinkles_match.ts
        └── types.ts
```
