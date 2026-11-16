import { NextResponse } from 'next/server';
import { listCategories, listProducts } from '@/server/catalogue/service';
import { formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;

  try {
    const [categories, products] = await Promise.all([
      listCategories(),
      listProducts({ categorySlug: category, search: q }),
    ]);

    return NextResponse.json({
      currency: 'INR',
      categories,
      products: products.map((product) => ({
        ...product,
        priceDisplay: formatINR(product.pricePaise),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'catalogue_unavailable',
        message: error instanceof Error ? error.message : 'The catalogue could not be read.',
      },
      { status: 500 },
    );
  }
}
