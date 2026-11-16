import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailPage } from '@/features/catalogue/product/ProductDetailPage';
import { getProductDetail } from '@/features/catalogue/product/queries';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProductDetail(params.slug);
  if (!product) {
    return { title: 'Product not found' };
  }
  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProductDetail(params.slug);
  if (!product) {
    notFound();
  }

  return <ProductDetailPage product={product} />;
}
