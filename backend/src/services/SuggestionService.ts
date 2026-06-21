import type { Trie, Suggestion } from '../data/Trie';
import type { DistributedCache } from '../cache/DistributedCache';
import type { MetricsCollector } from '../middleware/metricsMiddleware';

export class SuggestionService {
  constructor(
    private cache: DistributedCache,
    private trie: Trie,
    private metrics: MetricsCollector,
  ) {}

  getSuggestions(rawPrefix: string): Suggestion[] {
    const prefix = rawPrefix.toLowerCase().trim();
    if (!prefix) return [];

    // Cache-first: check distributed cache
    const cached = this.cache.get(prefix);
    if (cached !== null) return cached;

    // Cache miss: query Trie (O(prefix.length))
    this.metrics.dbReads++;
    const suggestions = this.trie.search(prefix);

    // Write result back to the owning cache node
    this.cache.set(prefix, suggestions);

    return suggestions;
  }
}
