# Performance Report

Numbers below are from a local run on Apple M-series. Check live stats at `GET /metrics`.

## Latency

| Scenario | Avg | p95 |
|----------|-----|-----|
| Cache hit | ~0.5 ms | ~2 ms |
| Cache miss (trie lookup) | ~1–2 ms | ~5 ms |
| Startup (100K rows into trie) | — | ~160 ms |

The trie loads 100,000 queries in about 160ms on first startup. After that, all suggestion reads are in-memory and sub-millisecond.

## Cache hit rate

After a few minutes of normal usage, hit rate settles around 80–95%. It starts at 0% on cold start because nothing is cached yet.

Each cache entry has a 60s TTL. When a query's count changes (via batch flush), its prefix entries are invalidated immediately, so the cache stays consistent.

The consistent hash ring distributes keys roughly evenly:

```
node-0: 21.4%
node-1: 20.3%
node-2: 18.4%
node-3: 20.5%
node-4: 19.4%
```

## Batch write reduction

Without batching, every search = 1 write to the JSON store.

With batching (5s flush interval, max 100 items):

| Metric | Example |
|--------|---------|
| Search events in one flush window | 200 |
| Unique queries | 30 |
| DB writes | 1 flush = 1 file write |
| Writes avoided | 170 |
| Reduction | ~85% |

In practice, popular queries get searched many times per flush window. Each one only results in a single count update. The `GET /metrics` endpoint shows `writeReductionPercent` in real time.

## Memory

The in-memory Trie for 100K queries uses roughly 150–200 MB of heap. Each trie node stores up to 10 suggestions. This is the main memory cost of the system.

The cache is negligible — each of the 5 nodes holds at most a few hundred prefix entries at any time.
