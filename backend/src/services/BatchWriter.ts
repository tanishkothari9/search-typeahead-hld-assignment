import type { Trie } from '../data/Trie';
import type { DistributedCache } from '../cache/DistributedCache';
import type { MetricsCollector } from '../middleware/metricsMiddleware';
import { bulkUpsert } from '../data/db';

export interface FlushResult {
  uniqueQueries: number;
  totalEvents: number;
  writesAvoided: number;
  durationMs: number;
  tradeOffNote: string;
}

export class BatchWriter {
  private buffer: Map<string, number> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS: number;
  private readonly MAX_BUFFER_SIZE: number;

  constructor(
    private trie: Trie,
    private cache: DistributedCache,
    private metrics: MetricsCollector,
    flushIntervalMs = 5_000,
    maxBufferSize = 100,
  ) {
    this.FLUSH_INTERVAL_MS = flushIntervalMs;
    this.MAX_BUFFER_SIZE = maxBufferSize;
    this.startTimer();
  }

  enqueue(query: string): void {
    const current = this.buffer.get(query) ?? 0;
    this.buffer.set(query, current + 1);
    this.metrics.totalSearchEvents++;

    if (this.buffer.size >= this.MAX_BUFFER_SIZE) {
      void this.flush();
    }
  }

  async flush(): Promise<FlushResult | null> {
    if (this.buffer.size === 0) return null;

    // Snapshot and clear atomically (JS single-threaded, no race)
    const snapshot = new Map(this.buffer);
    this.buffer.clear();

    const totalEvents = [...snapshot.values()].reduce((a, b) => a + b, 0);
    const uniqueQueries = snapshot.size;
    const writesAvoided = totalEvents - uniqueQueries;

    const start = Date.now();

    // Single SQLite transaction for all updates
    bulkUpsert(snapshot);

    const durationMs = Date.now() - start;

    // Update Trie in memory and invalidate affected cache prefixes
    for (const [query, delta] of snapshot.entries()) {
      this.trie.updateCount(query, delta);
      this.invalidatePrefixCache(query);
    }

    // Update metrics
    this.metrics.batchFlushCount++;
    this.metrics.uniqueQueriesFlushed += uniqueQueries;
    this.metrics.totalWritesAvoided += writesAvoided;

    const result: FlushResult = {
      uniqueQueries,
      totalEvents,
      writesAvoided,
      durationMs,
      tradeOffNote:
        'Pending writes in buffer are lost on process crash. Acceptable for analytics; ' +
        'production would journal to a WAL, Redis list, or Kafka topic before acknowledging.',
    };

    console.log(
      `[BATCH] Flushed ${uniqueQueries} unique queries from ${totalEvents} events. ` +
        `Writes avoided: ${writesAvoided}. DB write took ${durationMs}ms.`,
    );

    return result;
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  getBufferSize(): number {
    return this.buffer.size;
  }

  getBufferSnapshot(): Record<string, number> {
    return Object.fromEntries(this.buffer);
  }

  private startTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  private invalidatePrefixCache(query: string): void {
    // Only invalidate the exact query key. Prefix cache entries (e.g. "py" for
    // "python") stay valid until their 60s TTL expires — one additional count
    // on an already-popular query doesn't change the top-10 ranking for its
    // prefixes in any meaningful way for a demo workload.
    this.cache.invalidate(query);
  }
}
