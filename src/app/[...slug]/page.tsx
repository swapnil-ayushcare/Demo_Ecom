import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { listCategories } from '@/server/catalogue/service';
import {
  getFeatureNavigation,
  matchFeatureRoute,
  readFeaturePage,
} from '@/server/features/registry';
import styles from './feature-page.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug?: string[] };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const pathname = `/${(params.slug ?? []).join('/')}`;
  const match = matchFeatureRoute(pathname);
  if (!match) {
    return { title: 'Page not found' };
  }
  return {
    title: match.route.title ?? match.feature.title,
    description: match.feature.description || undefined,
  };
}

export default async function FeaturePage({ params }: PageProps) {
  const pathname = `/${(params.slug ?? []).join('/')}`;
  const match = matchFeatureRoute(pathname);

  if (!match) {
    notFound();
  }

  const [categories, shopNavigation] = await Promise.all([
    listCategories(),
    Promise.resolve(getFeatureNavigation('shop')),
  ]);
  const html = readFeaturePage(match.feature, match.route);

  return (
    <AppShell categories={categories} featureNav={shopNavigation}>
      <article className={styles.article}>
        <p className={styles.kicker}>Feature · {match.feature.title}</p>
        <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </AppShell>
  );
}
