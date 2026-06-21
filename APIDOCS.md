# API Docs

Base URL: `http://localhost:3000`

---

### GET `/suggest?q=<prefix>`

Returns up to 10 prefix-matching suggestions sorted by count.

**Query params**
- `q` — the prefix string (case-insensitive)

**Response**
```json
{
  "suggestions": [
    { "query": "python tutorial", "count": 1000000 },
    { "query": "python install",  "count": 500000 }
  ],
  "prefix": "pyt",
  "count": 2
}
```

Returns empty array for empty input or no matches. Debounced at 300ms on the frontend.

---

### POST `/search`

Submits a search query. Increments its count (via batch buffer) and records it for trending.

**Request body**
```json
{ "query": "python" }
```

**Response**
```json
{ "message": "Searched", "query": "python" }
```

---

### GET `/trending`

Returns the top 10 trending queries ranked by recency-aware score.

**Response**
```json
{
  "trending": [
    {
      "query": "python",
      "count": 1000000,
      "recentCount": 12,
      "score": 1000120,
      "formula": "1000000 + 12 × 10"
    }
  ],
  "config": {
    "windowHours": 1,
    "recencyMultiplier": 10,
    "scoringFormula": "score = totalCount + recentCount * recencyMultiplier"
  }
}
```

---

### GET `/cache/debug?prefix=<prefix>`

Shows which cache node owns the given prefix key and whether it's currently cached.

**Response**
```json
{
  "prefix": "py",
  "ownerNode": "node-3",
  "virtualPosition": 2427514550,
  "hit": true,
  "ttlRemainingMs": 52341,
  "data": [...]
}
```

---

### GET `/cache/ring`

Returns the consistent hash ring distribution across all nodes.

**Response**
```json
{
  "nodes": ["node-0", "node-1", "node-2", "node-3", "node-4"],
  "keyspaceDistribution": {
    "node-0": "21.4%",
    "node-1": "20.3%",
    "node-2": "18.4%",
    "node-3": "20.5%",
    "node-4": "19.4%"
  },
  "cacheStats": {
    "hits": 42,
    "misses": 8,
    "hitRate": "84.0%",
    "nodeKeyCounts": { "node-0": 3, "node-1": 5, ... }
  }
}
```

---

### GET `/metrics`

Live system metrics for latency, cache, and batch write performance.

**Response**
```json
{
  "latency": { "avgMs": 1.03, "p95Ms": 3.16, "sampleSize": 87 },
  "db": {
    "reads": 12,
    "batchFlushCount": 4,
    "totalSearchEvents": 200,
    "uniqueQueriesFlushed": 30,
    "totalWritesAvoided": 170,
    "writeReductionPercent": "85.0%"
  },
  "cache": {
    "hits": 75,
    "misses": 12,
    "hitRate": "86.2%"
  }
}
```

---

### GET `/health`

```json
{ "status": "ok", "queries": 100000, "nodes": 5 }
```
