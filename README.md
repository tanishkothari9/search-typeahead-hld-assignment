# Search Typeahead — HLD101 Assignment

## Setup

```bash
cd backend
npm install
npm run dev
```

Server starts at `http://localhost:3000`. The dataset is auto-generated on first run (~15 seconds). After that, startup is fast.

To regenerate the dataset manually:
```bash
npm run generate
```

## Project structure

```
search-typehead-hld-assignment/
├── backend/
│   ├── src/
│   │   ├── cache/         # ConsistentHashRing, DistributedCache
│   │   ├── data/          # Trie, db (JSON store)
│   │   ├── services/      # SuggestionService, BatchWriter, TrendingService
│   │   ├── routes/        # Express route handlers
│   │   ├── middleware/     # Metrics collector
│   │   └── index.ts
│   ├── scripts/
│   │   └── generateDataset.ts
│   └── data/              # queries.json (auto-created)
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## Dataset

**Source:** Synthetically generated — 100,000 queries built from technology terms, "how to X", "what is X", adjective+noun, and suffix patterns (tutorial, cheatsheet, review, etc.).

**Count distribution:** Zipf — `count[rank] = 1,000,000 / rank`. Most popular query has 1M, rank-1000 has 1K, rank-10000 has 100.

**Loading:** On first startup, `generateDataset.ts` builds and inserts all rows automatically. The data is stored in `backend/data/queries.json`.

## Other docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and component breakdown
- [APIDOCS.md](APIDOCS.md) — API reference
- [DESIGNCHOICES.md](DESIGNCHOICES.md) — why things were built the way they were
- [PERFORMANCEREPORT.md](PERFORMANCEREPORT.md) — latency, cache hit rate, write reduction
