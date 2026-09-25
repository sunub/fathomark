import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const designSystemRoot = path.resolve(__dirname, "../../design-system");
const tokensPath = path.join(designSystemRoot, "dist/mcp-tokens.json");
const componentsPath = path.join(designSystemRoot, "dist/mcp-components.json");

export interface TokenCategoryData {
  [tokenName: string]: string | Record<string, string>;
}

export interface TokensData {
  [category: string]: TokenCategoryData;
}

export interface ComponentPropInfo {
  type: string;
  description: string;
  defaultValue?: string;
}

export interface ComponentInfo {
  name: string;
  description: string;
  importPath: string;
  props: Record<string, ComponentPropInfo>;
}

export interface ComponentsData {
  [componentName: string]: ComponentInfo;
}

let tokensData: TokensData = {};
let componentsData: ComponentsData = {};

export function loadData(): void {
  try {
    if (fs.existsSync(tokensPath)) {
      tokensData = JSON.parse(
        fs.readFileSync(tokensPath, "utf-8"),
      ) as TokensData;
    } else {
      console.error(`Tokens file not found at: ${tokensPath}`);
    }
    if (fs.existsSync(componentsPath)) {
      componentsData = JSON.parse(
        fs.readFileSync(componentsPath, "utf-8"),
      ) as ComponentsData;
    } else {
      console.error(`Components file not found at: ${componentsPath}`);
    }
  } catch (error) {
    console.error("Error loading design system metadata:", error);
  }
}

loadData();

export const designSystemData = {
  get tokens(): TokensData {
    return tokensData;
  },
  get components(): ComponentsData {
    return componentsData;
  },
  get designSystemRoot(): string {
    return designSystemRoot;
  },
};
