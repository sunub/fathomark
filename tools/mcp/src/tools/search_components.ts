import { z } from "zod";
import type { McpTool } from "./types.js";
import { designSystemData, loadData } from "../data.js";
import { ToolCategory } from "./category.js";

interface SearchResult {
  name: string;
  description: string;
  importPath: string;
}

export const searchComponents: McpTool<{
  query: z.ZodOptional<z.ZodString>;
}> = {
  name: "search_components",
  annotations: {
    category: ToolCategory.COMPONENTS,
    readOnlyHint: true,
  },
  schema: {
    query: z.string().optional(),
  },
  handler: async ({ query }) => {
    loadData();
    const components = designSystemData.components;
    const results: SearchResult[] = [];
    const q = query ? query.toLowerCase() : "";

    for (const name in components) {
      const comp = components[name];
      const matchesQuery =
        !q ||
        name.toLowerCase().includes(q) ||
        (comp.description && comp.description.toLowerCase().includes(q));

      if (matchesQuery) {
        results.push({
          name: comp.name,
          description: comp.description,
          importPath: comp.importPath,
        });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
};
