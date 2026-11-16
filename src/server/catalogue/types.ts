import type { QueryResultRow } from 'pg';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  productCount: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  position: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: {
    id: string;
    slug: string;
    name: string;
  };
  pricePaise: number;
  stockQuantity: number;
  inStock: boolean;
  archived: boolean;
  images: ProductImage[];
}

export interface ProductListOptions {
  categorySlug?: string;
  search?: string;
  includeArchived?: boolean;
}

export interface ProductContentInput {
  id?: string;
  slug: string;
  name: string;
  description?: string;
  categorySlug: string;
  images?: Array<{ url: string; alt?: string }>;
  pricePaise?: number;
  stockQuantity?: number;
}

export interface CategoryRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  product_count: number;
}

export interface ProductRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category_id: string;
  category_slug: string;
  category_name: string;
  price_paise: number;
  stock_quantity: number;
  status: string | null;
  images: ProductImage[] | null;
}
