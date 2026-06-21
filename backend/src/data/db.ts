/**
 * Primary Data Store: JSON flat-file database.
 *
 * Design rationale: zero native-compilation dependencies while demonstrating
 * the key design principle — the in-memory Trie serves reads (O(prefix_len)),
 * while this persistent store is the durable source of truth written to via
 * the batch-writer. On startup, all records are loaded from disk into the
 * Trie. At runtime, disk is only written during batch flushes.
 */

import fs from 'fs';
import path from 'path';

export interface QueryRecord {
  query: string;
  count: number;
  updatedAt: string;
}

type DataFile = { queries: Record<string, QueryRecord> };

let dbPath: string;
let data: DataFile = { queries: {} };

export function initDb(filePath?: string): void {
  dbPath = filePath ?? path.join(__dirname, '../../data/queries.json');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      data = JSON.parse(raw) as DataFile;
    } catch {
      data = { queries: {} };
    }
  } else {
    data = { queries: {} };
    _persist();
  }
}

export function getAllQueries(): { query: string; count: number }[] {
  return Object.values(data.queries)
    .map(r => ({ query: r.query, count: r.count }))
    .sort((a, b) => b.count - a.count);
}

export function queryCount(): number {
  return Object.keys(data.queries).length;
}

export function bulkUpsert(updates: Map<string, number>): void {
  const now = new Date().toISOString();
  for (const [query, delta] of updates.entries()) {
    const existing = data.queries[query];
    data.queries[query] = {
      query,
      count: (existing?.count ?? 0) + delta,
      updatedAt: now,
    };
  }
  _persist();
}

export function bulkInsertInitial(rows: { query: string; count: number }[]): void {
  const now = new Date().toISOString();
  let i = 0;
  for (const row of rows) {
    if (!data.queries[row.query]) {
      data.queries[row.query] = { query: row.query, count: row.count, updatedAt: now };
    }
    i++;
    if (i % 10_000 === 0) {
      process.stdout.write(`\r  Inserted ${i} / ${rows.length} rows...`);
    }
  }
  process.stdout.write('\n');
  _persist();
}

function _persist(): void {
  fs.writeFileSync(dbPath, JSON.stringify(data), 'utf-8');
}
