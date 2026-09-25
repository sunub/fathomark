import { z } from "zod";
import type { ToolCategory } from "./category.js";

export interface McpTool<T extends z.ZodRawShape> {
  name: string;
  schema: T;
  description?: string;
  annotations?: {
    category: ToolCategory;
    readOnlyHint?: boolean;
    [key: string]: any;
  };
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<{
    isError?: boolean;
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
}
