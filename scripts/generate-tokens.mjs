import { readFile, mkdir, writeFile } from "node:fs/promises";

const tokens = JSON.parse(await readFile("docs/design-system/tokens.json", "utf8"));
const value = (input) => String(input).replace(/\{([^}]+)\}/g, "var(--$1)");
const variables = [];
for (const section of Object.values(tokens)) {
  for (const token of section?.tokens ?? []) variables.push(`  --${token.name}: ${value(token.value)};`);
}
for (const [name, family] of Object.entries(tokens.type.families)) variables.push(`  --font-${name}: ${family};`);
for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    for (const property of ["fontSize", "lineHeight", "fontWeight", "letterSpacing"]) {
      if (style[property] !== undefined) {
        const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        variables.push(`  --${style.name}-${cssProperty}: ${style[property]};`);
      }
    }
  }
}
await mkdir("src/styles", { recursive: true });
await writeFile("src/styles/tokens.css", `/* Generated from docs/design-system/tokens.json. Run pnpm tokens; do not edit. */\n:root {\n${variables.join("\n")}\n}\n`);
console.log(`Generated ${variables.length} unchanged design tokens.`);
