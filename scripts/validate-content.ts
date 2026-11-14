import {checkPublicCopy} from './check-public-copy';
import { loadCatalog } from "../src/lib/catalog/load";
import { getCatalogRoutes } from "../src/lib/catalog/routes";
import { locales } from "../src/lib/i18n";
import { getInfoContent } from "../src/lib/info/load";
for (const locale of locales) getInfoContent(locale);
const catalog = loadCatalog();
getCatalogRoutes(catalog);
console.log(`Validated ${catalog.cities.length} cities, ${catalog.places.length} places, ${catalog.offers.length} offers and ${catalog.guides.length} guides (${process.env.CONTENT_MODE ?? "preview"} mode).`);

const copy=checkPublicCopy();console.log(`Checked public copy in ${copy.contentFiles} content files, ${copy.sourceFiles} source files and ${copy.offlineFiles} offline modules.`);
