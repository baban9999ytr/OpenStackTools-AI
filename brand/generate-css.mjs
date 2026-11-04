import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(root, "tokens.json"), "utf8"));
const variable = (name, value) => `  --ost-${name}: ${value};`;
const kebab = (value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const theme = (values) => Object.entries(values).map(([key, value]) => variable(kebab(key), value)).join("\n");
const css = `/* Generated from brand/tokens.json v${tokens.version}. Do not edit directly. */\n:root {\n${variable("font-sans", tokens.font.sans)}\n${variable("font-mono", tokens.font.mono)}\n${Object.entries(tokens.radius).map(([key, value]) => variable(`radius-${key}`, value)).join("\n")}\n${Object.entries(tokens.space).map(([key, value]) => variable(`space-${key}`, value)).join("\n")}\n${theme(tokens.theme.light)}\n  color-scheme: light;\n}\n:root[data-theme="dark"] {\n${theme(tokens.theme.dark)}\n  color-scheme: dark;\n}\n`;
const output = resolve(root, "../apps/web/src/brand.css");
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== css) throw new Error("Generated brand CSS is out of date");
} else writeFileSync(output, css);
