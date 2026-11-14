import type { Place, PlaceFilters } from "./types";
export function filterPlaces(places: Place[], filters: PlaceFilters): Place[] {
  return places.filter(({ facts }) =>
    (!filters.subcategory || facts.subcategory === filters.subcategory)
    && (!filters.area || facts.areaId === filters.area)
    && (!filters.price || facts.priceBand === filters.price)
    && (!filters.tag || facts.sceneTags.includes(filters.tag) || facts.typeTags.includes(filters.tag))
    && (!filters.offer || facts.partnership === "exclusive"));
}

/** Ignore retired/bookmarked options rather than applying invisible constraints. */
export function placeFiltersFromSearch(search:URLSearchParams,options:{subcategory?:string;areas:readonly string[];prices:readonly string[];tags:readonly string[]}):PlaceFilters {
  const selected=(key:string,allowed:readonly string[])=>{const value=search.get(key);return value&&allowed.includes(value)?value:undefined;};
  return {subcategory:options.subcategory,area:selected('area',options.areas),price:selected('price',options.prices),tag:selected('tag',options.tags),offer:search.get('offer')==='1'};
}
