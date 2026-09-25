import { z } from "zod";
import type { McpTool } from "./types.js";
import { designSystemData, loadData } from "../data.js";
import { ToolCategory } from "./category.js";
import { auditStyles } from "@internal/design-system-linter";

export const suggestSprinklesMatch: McpTool<{
  style: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}> = {
  name: "suggest_sprinkles_match",
  annotations: {
    category: ToolCategory.STYLING,
    readOnlyHint: true,
  },
  schema: {
    style: z.record(z.string(), z.unknown()),
  },
  handler: async ({ style }) => {
    loadData();
    const tokens = designSystemData.tokens;
    
    const { suggestions, explanations } = auditStyles(style, tokens);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions, explanations }, null, 2),
        },
      ],
    };
  },
};
