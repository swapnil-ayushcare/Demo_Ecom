import { formatINR, toPaise } from '@/lib/money';
import type { Category } from '@/server/catalogue/types';

export interface SearchFilters {
  q: string;
  /** Empty string means every category. */
  category: string;
  minPaise: number | null;
  maxPaise: number | null;
  inStock: boolean;
}

export interface SearchFilterErrors {
  category?: string;
  min?: string;
  max?: string;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface ParsedSearch {
  filters: SearchFilters;
  errors: SearchFilterErrors;
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function parseRupeeAmount(
  raw: string,
  field: 'min' | 'max',
  errors: SearchFilterErrors,
): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    errors[field] = 'Enter a whole rupee amount, without a minus sign.';
    return null;
  }

  const paise = toPaise(Number(trimmed));
  if (!Number.isSafeInteger(paise)) {
    errors[field] = 'That rupee amount is too large for the shop.';
    return null;
  }
  return paise;
}

/**
 * Read the URL into a filter set without trusting any of it. Malformed numbers
 * become field-level messages instead of a crash or a database error.
 */
export function parseSearchFilters(params: SearchParamsRecord): ParsedSearch {
  const errors: SearchFilterErrors = {};
  const q = first(params.q).trim().slice(0, 200);
  const category = first(params.category).trim();
  const minPaise = parseRupeeAmount(first(params.min), 'min', errors);
  const maxPaise = parseRupeeAmount(first(params.max), 'max', errors);
  const inStockValue = first(params.inStock).trim().toLowerCase();
  const inStock = inStockValue === '1' || inStockValue === 'true' || inStockValue === 'on';

  if (minPaise !== null && maxPaise !== null && minPaise > maxPaise) {
    errors.max = 'The maximum price must be at least the minimum price.';
  }

  return {
    filters: { q, category, minPaise, maxPaise, inStock },
    errors,
  };
}

/** Render paise as a plain rupee value for a number input. */
export function rupeeInputValue(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The one place a search URL is assembled, so every link reproduces the same
 * result set with the same parameter order.
 */
export function searchHref(filters: Partial<SearchFilters>): string {
  const params = new URLSearchParams();
  const q = (filters.q ?? '').trim();
  if (q) {
    params.set('q', q);
  }
  if (filters.category) {
    params.set('category', filters.category);
  }
  if (filters.minPaise !== null && filters.minPaise !== undefined) {
    params.set('min', rupeeInputValue(filters.minPaise));
  }
  if (filters.maxPaise !== null && filters.maxPaise !== undefined) {
    params.set('max', rupeeInputValue(filters.maxPaise));
  }
  if (filters.inStock) {
    params.set('inStock', '1');
  }
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

export interface ActiveFilter {
  key: 'category' | 'min' | 'max' | 'inStock';
  label: string;
  href: string;
}

/**
 * The filters the shopper can see and remove, each link keeping every other
 * filter and the search phrase intact.
 */
export function activeFilters(
  filters: SearchFilters,
  categories: Category[],
): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  if (filters.category) {
    const match = categories.find((category) => category.slug === filters.category);
    active.push({
      key: 'category',
      label: `Category · ${match?.name ?? filters.category}`,
      href: searchHref({ ...filters, category: '' }),
    });
  }

  if (filters.minPaise !== null) {
    active.push({
      key: 'min',
      label: `From ${formatINR(filters.minPaise)}`,
      href: searchHref({ ...filters, minPaise: null }),
    });
  }

  if (filters.maxPaise !== null) {
    active.push({
      key: 'max',
      label: `Up to ${formatINR(filters.maxPaise)}`,
      href: searchHref({ ...filters, maxPaise: null }),
    });
  }

  if (filters.inStock) {
    active.push({
      key: 'inStock',
      label: 'In stock only',
      href: searchHref({ ...filters, inStock: false }),
    });
  }

  return active;
}

/** Clear every narrowing filter but keep the phrase. */
export function clearFiltersHref(filters: SearchFilters): string {
  return searchHref({ q: filters.q });
}
