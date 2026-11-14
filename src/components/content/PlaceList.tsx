"use client";

import {priceBandLabel} from "@/lib/coupons/offer";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { Catalog, MainCategory, Place, RouteRegistry } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { contentCopy } from "@/lib/catalog/copy";
import { filterPlaces, placeFiltersFromSearch } from "@/lib/catalog/filters";
import { pathFor } from "@/lib/catalog/routes";
import { PlaceCard } from "./ContentShared";
import {filterCategoryHref, setPlaceFilter, clearPlaceFilters} from "@/lib/catalog/filter-navigation";

/** Below this many places the list is read at a glance: no type chips and no filter panel unless a filter is already set. */
const filterThreshold = 6;
function subscribe(listener: () => void) { window.addEventListener("popstate", listener); window.addEventListener("pci:filters", listener); return () => { window.removeEventListener("popstate", listener); window.removeEventListener("pci:filters", listener); }; }
const snapshot = () => window.location.search;
const serverSnapshot = () => "";
export function PlaceList({ places, locale, registry, catalog, category, cityId, subcategory }: { places: Place[]; locale: Locale; registry: RouteRegistry; catalog: Catalog; category: MainCategory; cityId: string; subcategory?: string }) {
  const query = useSyncExternalStore(subscribe, snapshot, serverSnapshot), search = new URLSearchParams(query), c = contentCopy[locale];
  const city = catalog.cities.find((city) => city.id === cityId)!;
  const tags = [...new Map([...catalog.taxonomy.sceneTags, ...catalog.taxonomy.typeTags].map(tag => [tag.id, tag])).values()];
  const filters = placeFiltersFromSearch(search, {subcategory, areas:city.areas.map(area => area.id), prices:places.map(place => place.facts.priceBand), tags:tags.map(tag => tag.id)});
  const visible = filterPlaces(places, filters);
  const [open, setOpen] = useState(false);
  const active = [filters.area, filters.price, filters.tag, filters.offer].filter(Boolean).length;
  const controls = places.length >= filterThreshold || active > 0 || Boolean(subcategory);
  return <>
    {controls && <div className="list-controls">
    <nav className="filter-chips" aria-label={c.subcategory}>
      <Link href={filterCategoryHref(pathFor(registry, `category:${cityId}:${category}`, locale)!, query)} aria-current={!subcategory ? "page" : undefined}>{c.all}</Link>
      {catalog.taxonomy.subcategories[category].map((term) => { const href = pathFor(registry, `subcategory:${cityId}:${category}:${term.id}`, locale); return href ? <Link key={term.id} href={filterCategoryHref(href, query)} aria-current={subcategory === term.id ? "page" : undefined}>{term.names[locale]}</Link> : null; })}
    </nav>
    <div className="filters-toolbar">
      <button type="button" className="filters-toggle button button--secondary" aria-expanded={open} aria-controls="place-filters" onClick={() => setOpen(!open)}>{c.filters}{active > 0 ? ` · ${active}` : ""}</button>
      <div className="results-heading"><p role="status" aria-live="polite">{visible.length} {c.results}</p>{active > 0 && <button className="text-link" onClick={clearPlaceFilters} type="button">{c.reset}</button>}</div>
    </div>
    <div className="filters" id="place-filters" data-open={open || undefined}>
      <label>{c.area}<select value={filters.area ?? ""} onChange={(event) => setPlaceFilter("area", event.target.value)}><option value="">{c.all}</option>{city.areas.map((area) => <option key={area.id} value={area.id}>{area.translations[locale].name}</option>)}</select></label>
      <label>{c.price}<select value={filters.price ?? ""} onChange={(event) => setPlaceFilter("price", event.target.value)}><option value="">{c.all}</option>{[...new Set(places.map((place) => place.facts.priceBand))].filter((price) => price !== "unknown").map((price) => <option key={price} value={price}>{price.includes("[") ? c.priceUnknown : priceBandLabel(price,locale)}</option>)}</select></label>
      <label>{c.scene}<select value={filters.tag ?? ""} onChange={(event) => setPlaceFilter("tag", event.target.value)}><option value="">{c.all}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.names[locale]}</option>)}</select></label>
      {category === "eat" && <label className="checkbox-row"><input type="checkbox" checked={!!filters.offer} onChange={(event) => setPlaceFilter("offer", event.target.checked ? "1" : "")} />{c.offerOnly}</label>}
    </div>
    </div>}
    {/* The cards are h3: an h2 over the list keeps the outline h1 > h2 > h3 for screen readers and search engines. */}
    {visible.length > 0 && <h2 className="sr-only">{visible.length} {c.results}</h2>}
    {visible.length ? <div className="place-grid">{visible.map((place) => <PlaceCard key={place.id} place={place} locale={locale} registry={registry} catalog={catalog} offer={catalog.offers.find((offer) => offer.placeId === place.id)} />)}</div>
      : <div className="empty-state"><h2>{c.empty}</h2><p>{c.emptyHint}</p><button type="button" className="button button--secondary" onClick={clearPlaceFilters}>{c.reset}</button>{subcategory && <Link className="text-link" href={filterCategoryHref(pathFor(registry, `category:${cityId}:${category}`, locale)!, query)}>{c.allPlaces}</Link>}</div>}
  </>;
}
