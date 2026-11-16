import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

export type FeatureArea = 'shop' | 'admin';

export interface FeatureRouteDefinition {
  path: string;
  title?: string;
  pageFile?: string;
}

export interface FeatureNavigationDefinition {
  label: string;
  href: string;
  area?: FeatureArea;
  order?: number;
}

export interface FeatureManifest {
  slug: string;
  title: string;
  description?: string;
  pageFile?: string;
  routes: FeatureRouteDefinition[];
  navigation?: FeatureNavigationDefinition[];
}

export interface RegisteredFeature {
  slug: string;
  title: string;
  description: string;
  directory: string;
  pageFile: string;
  routes: Array<FeatureRouteDefinition & { pageFile: string }>;
  navigation: Array<FeatureNavigationDefinition & { area: FeatureArea; order: number }>;
}

const registry = new Map<string, RegisteredFeature>();
let discovered = false;

export const FEATURES_DIRECTORY = join(process.cwd(), 'src', 'features');

function normalizeRoutePath(routePath: string): string {
  if (!routePath.startsWith('/')) {
    throw new Error(`Feature route "${routePath}" must begin with /`);
  }
  if (routePath.length > 1 && routePath.endsWith('/')) {
    return routePath.slice(0, -1);
  }
  return routePath;
}

function parseManifest(raw: unknown, directory: string): FeatureManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('feature.json must contain an object');
  }
  const manifest = raw as Partial<FeatureManifest>;
  if (!manifest.slug || typeof manifest.slug !== 'string') {
    throw new Error('feature.json needs a slug');
  }
  if (!manifest.title || typeof manifest.title !== 'string') {
    throw new Error(`Feature ${manifest.slug} needs a title`);
  }
  if (!Array.isArray(manifest.routes) || manifest.routes.length === 0) {
    throw new Error(`Feature ${manifest.slug} needs at least one route`);
  }
  for (const route of manifest.routes) {
    if (!route || typeof route.path !== 'string') {
      throw new Error(`Feature ${manifest.slug} has a route without a path`);
    }
  }
  if (manifest.navigation !== undefined && !Array.isArray(manifest.navigation)) {
    throw new Error(`Feature ${manifest.slug} navigation must be an array`);
  }
  for (const item of manifest.navigation ?? []) {
    if (!item || typeof item.label !== 'string' || typeof item.href !== 'string') {
      throw new Error(`Feature ${manifest.slug} has a navigation entry without label and href`);
    }
    if (item.area !== undefined && item.area !== 'shop' && item.area !== 'admin') {
      throw new Error(`Feature ${manifest.slug} navigation area must be shop or admin`);
    }
  }
  return { ...manifest, directory } as FeatureManifest;
}

/**
 * Register a feature manifest in-process. Discovery calls this automatically
 * for every src/features/<name>/feature.json; capabilities may also call it
 * directly from their own module without editing a shared entry file.
 */
export function registerFeature(manifest: FeatureManifest, directory: string): RegisteredFeature {
  const safe = parseManifest(manifest, directory);
  const defaultPageFile = safe.pageFile ?? 'page.html';

  const feature: RegisteredFeature = {
    slug: safe.slug,
    title: safe.title,
    description: safe.description ?? '',
    directory,
    pageFile: defaultPageFile,
    routes: safe.routes.map((route) => ({
      ...route,
      path: normalizeRoutePath(route.path),
      pageFile: route.pageFile ?? defaultPageFile,
    })),
    navigation: (safe.navigation ?? []).map((item) => ({
      ...item,
      href: normalizeRoutePath(item.href),
      area: item.area ?? 'shop',
      order: item.order ?? 100,
    })),
  };

  registry.set(feature.slug, feature);
  return feature;
}

export function discoverFeatures(root = FEATURES_DIRECTORY): RegisteredFeature[] {
  if (!existsSync(root)) {
    return [...registry.values()];
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = join(root, entry.name);
    const manifestPath = join(directory, 'feature.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as FeatureManifest;
      registerFeature(raw, directory);
    } catch (error) {
      console.warn(
        `Skipping feature directory ${entry.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  discovered = true;
  return [...registry.values()];
}

export function getFeatures(): RegisteredFeature[] {
  if (!discovered) {
    return discoverFeatures();
  }
  return [...registry.values()];
}

export function resetFeatureRegistry(): void {
  registry.clear();
  discovered = false;
}

export function getFeatureNavigation(area: FeatureArea): Array<
  FeatureNavigationDefinition & { area: FeatureArea; order: number }
> {
  return getFeatures()
    .flatMap((feature) => feature.navigation)
    .filter((item) => item.area === area)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export interface MatchedFeatureRoute {
  feature: RegisteredFeature;
  route: FeatureRouteDefinition & { pageFile: string };
}

export function matchFeatureRoute(pathname: string): MatchedFeatureRoute | null {
  const requested = normalizeRoutePath(pathname || '/');
  let best: MatchedFeatureRoute | null = null;

  for (const feature of getFeatures()) {
    for (const route of feature.routes) {
      const matches =
        requested === route.path ||
        (route.path !== '/' && requested.startsWith(`${route.path}/`));
      if (!matches) {
        continue;
      }
      if (!best || route.path.length > best.route.path.length) {
        best = { feature, route };
      }
    }
  }

  return best;
}

export function readFeaturePage(
  feature: RegisteredFeature,
  route: FeatureRouteDefinition & { pageFile: string },
): string {
  const root = resolve(feature.directory);
  const pagePath = resolve(root, route.pageFile);
  const inside = relative(root, pagePath);
  if (inside.startsWith('..') || isAbsolute(inside) || normalize(inside).startsWith('..')) {
    throw new Error(`Feature ${feature.slug} page escapes its directory`);
  }
  if (!existsSync(pagePath)) {
    return `<p>${feature.title} is registered but its page file is missing.</p>`;
  }
  return readFileSync(pagePath, 'utf8');
}
