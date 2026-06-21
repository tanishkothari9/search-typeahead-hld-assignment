import express from 'express';
import cors from 'cors';
import path from 'path';

import { initDb, getAllQueries, queryCount, bulkInsertInitial } from './data/db';
import { Trie } from './data/Trie';
import { ConsistentHashRing } from './cache/ConsistentHashRing';
import { DistributedCache } from './cache/DistributedCache';
import { MetricsCollector, metricsMiddleware } from './middleware/metricsMiddleware';
import { SuggestionService } from './services/SuggestionService';
import { TrendingService } from './services/TrendingService';
import { BatchWriter } from './services/BatchWriter';

import { suggestRouter } from './routes/suggest';
import { searchRouter } from './routes/search';
import { cacheDebugRouter } from './routes/cacheDebug';
import { trendingRouter } from './routes/trending';
import { metricsRouter } from './routes/metrics';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const DB_PATH = path.join(__dirname, '../data/queries.json');
const FRONTEND_PATH = path.join(__dirname, '../../frontend');
const NODE_IDS = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'];

async function bootstrap(): Promise<void> {
  console.log('\n=== Search Typeahead System ===\n');

  // ── Phase 1: Database ────────────────────────────────────────────────────
  console.log('[1/6] Initializing SQLite database...');
  initDb(DB_PATH);

  const existing = queryCount();
  if (existing < 100_000) {
    console.log(`[1/6] Found ${existing} queries — need 100K. Auto-generating dataset...`);
    await generateInline();
  } else {
    console.log(`[1/6] Found ${existing} queries in database.`);
  }

  // ── Phase 2: Trie ────────────────────────────────────────────────────────
  console.log('[2/6] Loading queries into Trie (in-memory prefix index)...');
  const startTrie = Date.now();
  const rows = getAllQueries();
  const trie = new Trie();
  trie.loadFromDb(rows);
  console.log(`[2/6] Trie loaded in ${Date.now() - startTrie}ms. Queries: ${rows.length}`);

  // Build a quick lookup map for trending (query → count)
  const queryCountMap = new Map<string, number>(rows.map(r => [r.query, r.count]));

  // ── Phase 3: Consistent Hash Ring + Cache ────────────────────────────────
  console.log('[3/6] Building consistent hash ring...');
  const ring = new ConsistentHashRing(150);
  for (const nodeId of NODE_IDS) ring.addNode(nodeId);

  const distribution = ring.getKeyspaceDistribution();
  const distStr = Object.entries(distribution).map(([k, v]) => `${k}: ${v}`).join(' | ');
  console.log(`[3/6] Ring distribution: ${distStr}`);

  const cache = new DistributedCache(ring, 60_000);
  console.log(`[3/6] Distributed cache ready (${NODE_IDS.length} nodes, TTL=60s)`);

  // ── Phase 4: Services ────────────────────────────────────────────────────
  console.log('[4/6] Initializing services...');
  const metricsCollector = new MetricsCollector();
  const trendingService = new TrendingService(60 * 60_000, 10);
  const batchWriter = new BatchWriter(trie, cache, metricsCollector, 5_000, 100);
  const suggestionService = new SuggestionService(cache, trie, metricsCollector);

  // Keep queryCountMap in sync when batch flushes update counts
  const originalUpdateCount = trie.updateCount.bind(trie);
  trie.updateCount = (query: string, delta: number) => {
    originalUpdateCount(query, delta);
    queryCountMap.set(query, (queryCountMap.get(query) ?? 0) + delta);
  };

  // ── Phase 5: Express ─────────────────────────────────────────────────────
  console.log('[5/6] Starting Express server...');
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(metricsMiddleware(metricsCollector));

  // Serve frontend static files
  app.use(express.static(FRONTEND_PATH));

  // API routes
  app.use(suggestRouter(suggestionService));
  app.use(searchRouter(batchWriter, trendingService));
  app.use(cacheDebugRouter(cache, ring));
  app.use(trendingRouter(trendingService, () => queryCountMap));
  app.use(metricsRouter(metricsCollector, cache, batchWriter));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', queries: rows.length, nodes: NODE_IDS.length });
  });

  // ── Phase 6: Listen ──────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    console.log(`[6/6] Server running at http://localhost:${PORT}`);
    console.log('\n=== Ready ===');
    console.log(`  Frontend:   http://localhost:${PORT}`);
    console.log(`  Suggest:    http://localhost:${PORT}/suggest?q=py`);
    console.log(`  Search:     POST http://localhost:${PORT}/search`);
    console.log(`  Trending:   http://localhost:${PORT}/trending`);
    console.log(`  Cache debug:http://localhost:${PORT}/cache/debug?prefix=py`);
    console.log(`  Metrics:    http://localhost:${PORT}/metrics\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[SHUTDOWN] ${signal} received — flushing batch writer...`);
    await batchWriter.stop();
    trendingService.stop();
    server.close(() => {
      console.log('[SHUTDOWN] Done.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function generateInline(): Promise<void> {
  // Inline a minimal dataset generator so startup works without running the script separately.
  // Mirrors the logic in scripts/generateDataset.ts
  const NOUNS = [
    'python', 'javascript', 'typescript', 'react', 'node', 'express', 'mongodb', 'postgres',
    'redis', 'docker', 'kubernetes', 'aws', 'linux', 'git', 'vim', 'nginx', 'apache',
    'iphone', 'samsung', 'laptop', 'monitor', 'headphones', 'keyboard', 'mouse', 'webcam',
    'netflix', 'spotify', 'youtube', 'amazon', 'google', 'twitter', 'facebook', 'instagram',
    'bitcoin', 'ethereum', 'blockchain', 'nft', 'crypto', 'stock', 'forex', 'trading',
    'recipe', 'diet', 'workout', 'yoga', 'meditation', 'running', 'cycling', 'swimming',
    'weather', 'news', 'sport', 'football', 'basketball', 'cricket', 'tennis', 'golf',
    'hotel', 'flight', 'visa', 'passport', 'travel', 'vacation', 'tour', 'beach',
    'movie', 'series', 'anime', 'manga', 'book', 'novel', 'podcast', 'music',
    'calculator', 'converter', 'translator', 'dictionary', 'thesaurus', 'grammar',
    'tutorial', 'course', 'certification', 'exam', 'interview', 'resume', 'salary',
    'covid', 'vaccine', 'symptom', 'medicine', 'hospital', 'doctor', 'dentist',
    'car', 'bike', 'insurance', 'loan', 'mortgage', 'tax', 'rent', 'price',
    'apartment', 'house', 'furniture', 'decoration', 'garden', 'kitchen', 'bathroom',
    'game', 'minecraft', 'fortnite', 'valorant', 'chess', 'puzzle', 'strategy',
    'baby', 'parenting', 'school', 'college', 'university', 'scholarship', 'admission',
    'css', 'html', 'api', 'database', 'algorithm', 'machine learning', 'deep learning',
    'chatgpt', 'openai', 'claude', 'gemini', 'llm', 'prompt', 'ai', 'automation',
    'photoshop', 'figma', 'canva', 'design', 'logo', 'banner', 'template', 'icon',
  ];
  const ADJECTIVES = ['best', 'top', 'free', 'easy', 'fast', 'cheap', 'good', 'new', 'latest', 'popular', 'online', 'local', 'simple', 'advanced', 'beginner', 'professional', 'premium', 'basic'];
  const HOW_TO_VERBS = ['install', 'use', 'setup', 'configure', 'fix', 'debug', 'deploy', 'build', 'create', 'learn', 'start', 'update', 'remove', 'delete', 'download', 'convert', 'connect', 'enable', 'disable', 'reset', 'change', 'add', 'upgrade', 'integrate'];
  const WHAT_IS = ['recursion', 'polymorphism', 'closure', 'promise', 'async await', 'rest api', 'graphql', 'microservices', 'devops', 'agile', 'scrum', 'kanban', 'ci cd', 'ssl', 'https', 'dns', 'cdn', 'load balancer', 'rate limiting', 'oauth', 'jwt', 'cors', 'csrf', 'xss', 'sql injection', 'hashing', 'encryption', 'cap theorem', 'acid', 'eventual consistency', 'sharding', 'replication', 'consensus', 'distributed system', 'caching', 'indexing', 'normalization'];
  const VERSIONS = ['14', '15', '16', '17', '18', '2.0', '3.0', '4.0', '5.0', 'pro', 'plus', 'ultra', 'max', 'lite'];
  const YEARS = ['2022', '2023', '2024', '2025'];
  const SUFFIXES = ['tutorial', 'examples', 'cheatsheet', 'guide', 'tips', 'tricks', 'download', 'alternative', 'review', 'price', 'error', 'not working'];
  const CONTEXTS = ['for beginners', 'interview questions', 'free course', 'online course', 'documentation', 'github', 'npm', 'example'];

  const querySet = new Set<string>();
  const queries: string[] = [];

  function add(q: string): void {
    const normalized = q.toLowerCase().trim();
    if (normalized.length >= 2 && normalized.length <= 60 && !querySet.has(normalized)) {
      querySet.add(normalized);
      queries.push(normalized);
    }
  }

  for (const n of NOUNS) add(n);
  for (const n of NOUNS) { for (const v of VERSIONS) add(`${n} ${v}`); for (const y of YEARS) add(`${n} ${y}`); }
  for (const a of ADJECTIVES) for (const n of NOUNS) add(`${a} ${n}`);
  for (const v of HOW_TO_VERBS) for (const n of NOUNS) add(`how to ${v} ${n}`);
  for (const s of WHAT_IS) { add(`what is ${s}`); add(`what is ${s} in programming`); add(`${s} explained`); }
  const n1 = NOUNS.slice(0, 40), n2 = NOUNS.slice(10, 50);
  for (const a of n1) for (const b of n2) if (a !== b) add(`${a} ${b}`);
  for (const n of NOUNS) { for (const s of SUFFIXES) add(`${n} ${s}`); for (const c of CONTEXTS) add(`${n} ${c}`); }
  for (const v of HOW_TO_VERBS) add(`how to ${v}`);

  const base = queries.slice(0, 200);
  let padIdx = 0;
  while (queries.length < 100_000 && padIdx < 10_000) {
    for (const b of base) { add(`${b} ${padIdx}`); if (queries.length >= 100_000) break; }
    padIdx++;
  }

  const MAX_COUNT = 1_000_000;
  const rows = queries.slice(0, 100_000).map((q, i) => ({
    query: q,
    count: Math.max(1, Math.floor(MAX_COUNT / (i + 1))),
  }));

  console.log(`[1/6] Generated ${rows.length} queries. Inserting into DB...`);
  bulkInsertInitial(rows);
  console.log('[1/6] Dataset ready.');
}

bootstrap().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
