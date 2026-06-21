# Design Choices

## Trie with pre-computed topK

Each Trie node stores a sorted list of its top-10 suggestions. When a suggestion's count changes, it's updated in-place along the path from root to that word.

The benefit: lookups are O(prefix_length) regardless of dataset size. There's no scanning of descendants at query time. The cost is higher memory and slower inserts, but for a read-heavy typeahead workload that's the right trade-off.

## JSON flat-file as primary store

SQLite was the first choice, but the native addon (`better-sqlite3`) couldn't compile on Node 25. Rather than add complexity, I used a JSON file.

Architecturally this changes nothing — the primary store is only read at startup and written during batch flushes. The Trie handles all reads. For production you'd swap this for Postgres, DynamoDB, or whatever fits.

## Consistent hashing

The cache is split across 5 logical nodes using a consistent hash ring. The key reason: if we add or remove a node, only ~1/N of keys get remapped — not all of them. With a simple modulo approach, adding one node would invalidate every key.

150 virtual nodes per physical node gives roughly uniform distribution (~20% each) without needing actual separate processes. The `/cache/ring` and `/cache/debug` endpoints make this visible.

## Batch writes

Every `POST /search` goes into an in-memory `Map<query, pendingCount>` buffer. The buffer flushes every 5 seconds or when it hits 100 items. On flush, all accumulated counts are written in a single pass.

**The failure trade-off:** anything in the buffer is lost if the process crashes before a flush. For an analytics/typeahead use case this is fine — slightly undercounting a few queries doesn't break anything. In production you'd journal to a WAL or a queue (Redis, Kafka) before acknowledging the client.

## Recency-aware trending

Basic trending is just top queries by total count. The enhanced version uses:

```
score = totalCount + recentCount × 10
```

`recentCount` = searches in the last 1 hour. The multiplier of 10 means recent activity has meaningful weight but doesn't completely override historical popularity. A brand-new query would need 100 searches in an hour to score the same as something with 1000 historical searches.

The window and multiplier are configurable constants — easy to tune.

## Cache TTL + invalidation

Cache entries expire after 60 seconds as a backstop. But they're also invalidated immediately when a batch flush updates a query's count. The invalidation covers every prefix of the updated query (e.g. updating "apple" invalidates "a", "ap", "app", "appl", "apple").

This keeps the cache fresh after batch flushes without waiting for TTL expiry.
