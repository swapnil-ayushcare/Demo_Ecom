import { NextResponse } from 'next/server';
import { getFeatureNavigation, getFeatures } from '@/server/features/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const features = getFeatures();
  return NextResponse.json({
    features: features.map((feature) => ({
      slug: feature.slug,
      title: feature.title,
      description: feature.description,
      routes: feature.routes.map((route) => ({ path: route.path, title: route.title ?? feature.title })),
      navigation: feature.navigation,
    })),
    navigation: {
      shop: getFeatureNavigation('shop'),
      admin: getFeatureNavigation('admin'),
    },
  });
}
