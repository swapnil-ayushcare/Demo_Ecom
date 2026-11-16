import type { Metadata } from 'next';
import { HomePage } from '@/features/catalogue/home/HomePage';
import { loadHomeCatalogue } from '@/features/catalogue/home/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Everyday things, honestly priced',
  description:
    'Browse the aisles of a small Indian shop: active products, honest rupee tags and stock that comes from the shelf.',
};

export default async function HomeRoute() {
  const catalogue = await loadHomeCatalogue();
  return <HomePage {...catalogue} />;
}
