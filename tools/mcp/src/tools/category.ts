export enum ToolCategory {
  TOKENS = "tokens",
  COMPONENTS = "components",
  STYLING = "styling",
  SYSTEM = "system",
}

export const labels = {
  [ToolCategory.TOKENS]: "Design Tokens",
  [ToolCategory.COMPONENTS]: "Component Catalog",
  [ToolCategory.STYLING]: "Styling & Sprinkles Helpers",
  [ToolCategory.SYSTEM]: "MCP System Administration",
};
