import pg from 'pg'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import type { AppConfig } from './config.js'

export function createPool(config: AppConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(config.databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  })
}

export async function inTransaction<T>(
  pool: pg.Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function firstRow<Row extends QueryResultRow>(result: QueryResult<Row>): Row | null {
  return result.rows[0] ?? null
}
