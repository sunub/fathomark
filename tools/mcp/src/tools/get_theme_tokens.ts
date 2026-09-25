import { z } from "zod";
import type { McpTool } from "./types.js";
import { designSystemData, loadData } from "../data.js";
import { ToolCategory } from "./category.js";

export const getThemeTokens: McpTool<{
  category: z.ZodOptional<
    z.ZodEnum<{
      color: "color";
      space: "space";
      fontSize: "fontSize";
      borderRadius: "borderRadius";
      zIndex: "zIndex";
      size: "size";
      layout: "layout";
    }>
  >;
}> = {
  name: "get_theme_tokens",
  annotations: {
    category: ToolCategory.TOKENS,
    readOnlyHint: true,
  },
  schema: {
    category: z
      .enum([
        "color",
        "space",
        "fontSize",
        "borderRadius",
        "zIndex",
        "size",
        "layout",
      ])
      .optional(),
  },
  handler: async ({ category }) => {
    loadData();
    const tokens = designSystemData.tokens;
    if (category) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tokens[category] || {}, null, 2),
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
    };
  },
};
