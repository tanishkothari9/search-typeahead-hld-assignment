import type { Suggestion } from '../data/Trie';

export interface TrendingEntry extends Suggestion {
  recentCount: number;
  score: number;
  formula: string;
}

export class TrendingService {
  // query → array of search timestamps (ms)
  private recentEvents: Map<string, number[]> = new Map();
  private readonly WINDOW_MS: number;
  private readonly RECENCY_MULTIPLIER: number;
  private readonly TOP_N = 10;
  private readonly MAX_EVENTS_PER_QUERY = 10_000;

  // Cleanup timer: prune old events every 5 minutes
  private cleanupTimer: NodeJS.Timeout;

  constructor(windowMs = 60 * 60 * 1_000, recencyMultiplier = 10) {
    this.WINDOW_MS = windowMs;
    this.RECENCY_MULTIPLIER = recencyMultiplier;

    this.cleanupTimer = setInterval(() => this.pruneAll(), 5 * 60_000);
    this.cleanupTimer.unref(); // Don't block process exit
  }

  recordSearch(query: string): void {
    const events = this.recentEvents.get(query) ?? [];
    events.push(Date.now());

    // Amortized prune: if list grows large, trim from front
    if (events.length > this.MAX_EVENTS_PER_QUERY) {
      events.splice(0, Math.floor(this.MAX_EVENTS_PER_QUERY / 2));
    }

    this.recentEvents.set(query, events);
  }

  getTrending(getAllCounts: () => Map<string, number>): TrendingEntry[] {
    const now = Date.now();
    const cutoff = now - this.WINDOW_MS;
    const allCounts = getAllCounts();

    const scored: TrendingEntry[] = [];

    for (const [query, timestamps] of this.recentEvents.entries()) {
      const recentCount = timestamps.filter(ts => ts >= cutoff).length;
      if (recentCount === 0) continue;

      const totalCount = allCounts.get(query) ?? 0;
      const score = totalCount + recentCount * this.RECENCY_MULTIPLIER;

      scored.push({
        query,
        count: totalCount,
        recentCount,
        score,
        formula: `${totalCount} + ${recentCount} × ${this.RECENCY_MULTIPLIER}`,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.TOP_N);
  }

  getRecentCount(query: string): number {
    const cutoff = Date.now() - this.WINDOW_MS;
    return (this.recentEvents.get(query) ?? []).filter(ts => ts >= cutoff).length;
  }

  getConfig(): object {
    return {
      windowMs: this.WINDOW_MS,
      windowHours: this.WINDOW_MS / 3_600_000,
      recencyMultiplier: this.RECENCY_MULTIPLIER,
      scoringFormula: 'score = totalCount + recentCount * recencyMultiplier',
    };
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  private pruneAll(): void {
    const cutoff = Date.now() - this.WINDOW_MS;
    for (const [query, events] of this.recentEvents.entries()) {
      const filtered = events.filter(ts => ts >= cutoff);
      if (filtered.length === 0) {
        this.recentEvents.delete(query);
      } else {
        this.recentEvents.set(query, filtered);
      }
    }
  }
}
