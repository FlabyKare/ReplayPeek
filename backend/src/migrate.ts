import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadConfig } from './config.js'
import { createPool, inTransaction } from './db.js'

export async function migrate(): Promise<void> {
  const config = loadConfig()
  const pool = createPool(config)
  const migrationDirectory = resolve(process.cwd(), 'migrations')
  try {
    const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort()

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    for (const file of files) {
      const alreadyApplied = await pool.query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [file],
      )
      if (alreadyApplied.rowCount) continue
      const sql = await readFile(resolve(migrationDirectory, file), 'utf8')
      await inTransaction(pool, async (client) => {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      })
      console.info(`Applied migration ${file}`)
    }
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
