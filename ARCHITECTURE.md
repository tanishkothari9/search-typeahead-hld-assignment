# Architecture

## Overview

```
Browser
  │
  ▼
Express (port 3000)
  │
  ├── GET /suggest?q=<prefix>
  │     └── DistributedCache (5 nodes, consistent hashing)
  │               │ miss
  │               └── Trie (in-memory, O(prefix_len))
  │                         └── top-10 per node, pre-computed
  │
  ├── POST /search
  │     ├── BatchWriter (in-memory buffer)
  │     └── TrendingService (timestamp log)
  │
  └── [every 5s or 100 items]
        BatchWriter flush
          ├── JSON file (primary store)
          ├── Trie.updateCount
          └── Cache.invalidate (all prefixes of updated query)
```

## Components

**Trie** (`src/data/Trie.ts`)  
In-memory prefix tree. Each node stores a sorted `topK[10]` list. On lookup, we walk to the prefix node and return its topK — no descendant traversal needed. O(prefix_len) per query.

**JSON Store** (`src/data/db.ts`)  
Flat-file database (`data/queries.json`). Read once at startup into the Trie. Only written during batch flushes. Acts as the durable source of truth.

**ConsistentHashRing** (`src/cache/ConsistentHashRing.ts`)  
SHA1-based ring with 5 physical nodes × 150 virtual nodes = 750 ring entries. Uses binary search to find the responsible node for any key. Achieves ~20% keyspace per node.

**DistributedCache** (`src/cache/DistributedCache.ts`)  
5 in-memory `Map` objects, one per ring node. TTL = 60s. On a cache miss, the result is written back to the owning node. On a query count update, all prefix entries for that query are invalidated.

**BatchWriter** (`src/services/BatchWriter.ts`)  
Accumulates search events in a `Map<query, count>` buffer. Flushes every 5 seconds or when buffer hits 100 entries. Flush = one write to JSON store + Trie update + cache invalidation.

**TrendingService** (`src/services/TrendingService.ts`)  
Stores a list of timestamps per query. On `/trending`, it counts events within the last 1 hour and computes a recency-aware score.

**SuggestionService** (`src/services/SuggestionService.ts`)  
Single entry point for read path: check cache → on miss, query Trie → write result to cache.

## Startup sequence

1. Load JSON store → get all (query, count) pairs
2. Insert all rows into Trie (sorted descending so topK fills correctly)
3. Build consistent hash ring, create 5 cache nodes
4. Start BatchWriter flush interval
5. Serve frontend + API routes
