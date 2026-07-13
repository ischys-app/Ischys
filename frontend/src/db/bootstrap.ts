/**
 * Runs migrations (via useDbReady), then seeds the catalog and a local settings
 * row exactly once. The app reads the local DB in the pure on-device build, so
 * `ready` gates the UI until this completes.
 */
import { useEffect, useState } from 'react';

import catalog from '../../assets/catalog/catalog.json';
import * as schema from './schema';
import type { Catalog } from './catalog/catalogTypes';
import { seedCatalog } from './catalog/seedCatalog';
import { db, useDbReady } from './client';

/** Ensure the singleton settings row exists (column defaults fill the rest). */
async function ensureLocalSettings(): Promise<void> {
  const existing = await db.select({ id: schema.settings.id }).from(schema.settings).limit(1);
  if (existing.length > 0) return;
  await db.insert(schema.settings).values({ id: 'local', updatedAt: Date.now() });
}

export function useLocalDbBootstrap(): { ready: boolean; error: Error | null } {
  const migrated = useDbReady();
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!migrated.success || seeded) return;
    (async () => {
      try {
        await seedCatalog(catalog as Catalog);
        await ensureLocalSettings();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setSeeded(true);
      }
    })();
  }, [migrated.success, seeded]);

  return { ready: migrated.success && seeded, error: migrated.error ?? error };
}
