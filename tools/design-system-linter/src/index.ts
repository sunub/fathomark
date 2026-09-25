export interface AuditResult {
  suggestions: Record<string, unknown>;
  explanations: string[];
}

export function auditStyles(
  style: Record<string, unknown>,
  tokens: Record<string, Record<string, unknown>>,
): AuditResult {
  const suggestions: Record<string, unknown> = {};
  const explanations: string[] = [];

  function findToken(category: string, value: unknown): string | null {
    const catObj = tokens[category];
    if (!catObj) return null;

    const valStr = String(value).trim().toLowerCase();

    for (const key in catObj) {
      const catVal = String(catObj[key]).trim().toLowerCase();
      if (catVal === valStr) {
        return key;
      }
    }
    return null;
  }

  for (const [prop, val] of Object.entries(style)) {
    if (prop === "color" || prop === "backgroundColor" || prop === "bg") {
      const matchedToken = findToken("color", val);
      if (matchedToken) {
        const targetProp =
          prop === "bg" ? "bg" : prop === "backgroundColor" ? "bg" : "color";
        suggestions[targetProp] = matchedToken;
        explanations.push(
          `Matched style '${prop}: ${val}' to color token '${matchedToken}'`,
        );
      } else {
        suggestions[prop] = val;
        explanations.push(
          `No exact color token match found for '${prop}: ${val}'`,
        );
      }
    } else if (
      [
        "padding",
        "paddingTop",
        "paddingBottom",
        "paddingLeft",
        "paddingRight",
        "margin",
        "marginTop",
        "marginBottom",
        "marginLeft",
        "marginRight",
        "p",
        "px",
        "py",
        "m",
        "mx",
        "my",
        "gap",
      ].includes(prop)
    ) {
      const matchedToken = findToken("space", val);
      if (matchedToken) {
        let targetProp = prop;
        if (prop === "padding") targetProp = "p";
        else if (prop === "margin") targetProp = "m";

        suggestions[targetProp] = matchedToken;
        explanations.push(
          `Matched style '${prop}: ${val}' to space token '${matchedToken}'`,
        );
      } else if (
        val === "auto" &&
        ["margin", "marginLeft", "marginRight", "mx", "my"].includes(prop)
      ) {
        suggestions[prop] = "auto";
        explanations.push(`Kept margin auto value`);
      } else {
        suggestions[prop] = val;
        explanations.push(
          `No exact space token match found for '${prop}: ${val}'`,
        );
      }
    } else {
      suggestions[prop] = val;
    }
  }

  if (
    suggestions.paddingLeft &&
    suggestions.paddingRight &&
    suggestions.paddingLeft === suggestions.paddingRight
  ) {
    suggestions.px = suggestions.paddingLeft;
    delete suggestions.paddingLeft;
    delete suggestions.paddingRight;
  }
  if (
    suggestions.paddingTop &&
    suggestions.paddingBottom &&
    suggestions.paddingTop === suggestions.paddingBottom
  ) {
    suggestions.py = suggestions.paddingTop;
    delete suggestions.paddingTop;
    delete suggestions.paddingBottom;
  }
  if (
    suggestions.marginLeft &&
    suggestions.marginRight &&
    suggestions.marginLeft === suggestions.marginRight
  ) {
    suggestions.mx = suggestions.marginLeft;
    delete suggestions.marginLeft;
    delete suggestions.marginRight;
  }
  if (
    suggestions.marginTop &&
    suggestions.marginBottom &&
    suggestions.marginTop === suggestions.marginBottom
  ) {
    suggestions.my = suggestions.marginTop;
    delete suggestions.marginTop;
    delete suggestions.marginBottom;
  }

  return { suggestions, explanations };
}
