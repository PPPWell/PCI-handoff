import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import { parse } from "yaml";
import { validateCatalog } from "./validate";
import type { Catalog } from "./types";


export function loadCatalog(mode: "preview" | "published" = process.env.CONTENT_MODE === "published" ? "published" : "preview"): Catalog {
  const read = (folder: "cities" | "places" | "offers" | "guides") => readdirSync(join(process.cwd(), "content", folder)).filter((name) => name.endsWith(".yaml")).sort().map((name) => {
    try { return parse(readFileSync(join(process.cwd(), "content", folder, name), "utf8")); }
    catch (error) { throw new Error(`${folder}/${name}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  const catalog = { cities: read("cities"), places: read("places"), offers: read("offers"), guides: read("guides"), taxonomy: parse(readFileSync(join(process.cwd(), "content", "taxonomy.yaml"), "utf8")) };
  validateCatalog(catalog, mode);
  return catalog;
}
export const getCatalog = cache(() => loadCatalog());
