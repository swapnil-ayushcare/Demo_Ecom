import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getEnv } from './env';

// Money is stored as bigint paise. It is safe to read as a JS number: the
// product can never hold an amount above Number.MAX_SAFE_INTEGER.
types.setTypeParser(20, (value: string) => Number(value));

const pools = new Map<string, Pool>();

export function openDatabase(connectionString?: string): Pool {
  const url = connectionString ?? getEnv().DATABASE_URL;
  let pool = pools.get(url);

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'demo-ecom',
    });
    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error', error);
    });
    pools.set(url, pool);
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return openDatabase().query<T>(text, params);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await openDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabases(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((pool) => pool.end()));
}
