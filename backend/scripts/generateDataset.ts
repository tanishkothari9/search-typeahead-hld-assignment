/**
 * Generates 100,000 synthetic search queries with Zipf-distributed counts.
 * Writes directly to SQLite via bulkInsertInitial.
 *
 * Run: npx tsx scripts/generateDataset.ts
 */

import path from 'path';
import { initDb, queryCount, bulkInsertInitial } from '../src/data/db';

const DB_PATH = path.join(__dirname, '../data/queries.json');

// --- Word lists for building realistic-looking queries ---
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

const ADJECTIVES = [
  'best', 'top', 'free', 'easy', 'fast', 'cheap', 'good', 'new', 'latest', 'popular',
  'online', 'local', 'simple', 'advanced', 'beginner', 'professional', 'premium', 'basic',
];

const HOW_TO_VERBS = [
  'install', 'use', 'setup', 'configure', 'fix', 'debug', 'deploy', 'build', 'create',
  'learn', 'start', 'update', 'remove', 'delete', 'download', 'convert', 'connect',
  'enable', 'disable', 'reset', 'change', 'add', 'remove', 'upgrade', 'integrate',
];

const WHAT_IS_SUBJECTS = [
  'recursion', 'polymorphism', 'closure', 'promise', 'async await', 'rest api',
  'graphql', 'microservices', 'devops', 'agile', 'scrum', 'kanban', 'ci cd',
  'ssl', 'https', 'dns', 'cdn', 'load balancer', 'rate limiting', 'oauth',
  'jwt', 'cors', 'csrf', 'xss', 'sql injection', 'hashing', 'encryption',
  'cap theorem', 'acid', 'eventual consistency', 'sharding', 'replication',
  'consensus', 'distributed system', 'caching', 'indexing', 'normalization',
];

const VERSIONS = ['14', '15', '16', '17', '18', '2.0', '3.0', '4.0', '5.0', 'pro', 'plus', 'ultra', 'max', 'lite'];
const YEARS = ['2022', '2023', '2024', '2025'];

function buildQueries(): { query: string; count: number }[] {
  const querySet = new Set<string>();
  const queries: string[] = [];

  function add(q: string): void {
    const normalized = q.toLowerCase().trim();
    if (normalized.length >= 2 && normalized.length <= 60 && !querySet.has(normalized)) {
      querySet.add(normalized);
      queries.push(normalized);
    }
  }

  // 1. Single nouns
  for (const noun of NOUNS) add(noun);

  // 2. Noun + version/year
  for (const noun of NOUNS) {
    for (const v of VERSIONS) add(`${noun} ${v}`);
    for (const y of YEARS) add(`${noun} ${y}`);
  }

  // 3. Adjective + noun
  for (const adj of ADJECTIVES) {
    for (const noun of NOUNS) add(`${adj} ${noun}`);
  }

  // 4. How to X noun
  for (const verb of HOW_TO_VERBS) {
    for (const noun of NOUNS) add(`how to ${verb} ${noun}`);
  }

  // 5. What is X
  for (const subj of WHAT_IS_SUBJECTS) {
    add(`what is ${subj}`);
    add(`what is ${subj} in programming`);
    add(`${subj} explained`);
    add(`${subj} vs`);
  }

  // 6. Noun + noun combos (first 40 nouns × first 40 nouns)
  const n1 = NOUNS.slice(0, 40);
  const n2 = NOUNS.slice(10, 50);
  for (const a of n1) {
    for (const b of n2) {
      if (a !== b) add(`${a} ${b}`);
    }
  }

  // 7. "X tutorial", "X examples", "X cheatsheet", "X vs Y"
  const suffixes = ['tutorial', 'examples', 'cheatsheet', 'guide', 'tips', 'tricks', 'download', 'alternative', 'review', 'price', 'error', 'not working'];
  for (const noun of NOUNS) {
    for (const s of suffixes) add(`${noun} ${s}`);
  }

  // 8. "how to X" standalone
  for (const verb of HOW_TO_VERBS) {
    add(`how to ${verb}`);
  }

  // 9. Noun + "for beginners / interview / free"
  const contexts = ['for beginners', 'interview questions', 'free course', 'online course', 'documentation', 'github', 'npm', 'example'];
  for (const noun of NOUNS) {
    for (const ctx of contexts) add(`${noun} ${ctx}`);
  }

  // 10. Pad to 100K with number variations if needed
  const base = queries.slice(0, 200);
  let padIdx = 0;
  while (queries.length < 100000 && padIdx < 10000) {
    for (const b of base) {
      add(`${b} ${padIdx}`);
      if (queries.length >= 100000) break;
    }
    padIdx++;
  }

  // Assign Zipf-distributed counts: count[rank] = floor(MAX_COUNT / rank)
  const MAX_COUNT = 1_000_000;
  return queries.slice(0, 100000).map((q, i) => ({
    query: q,
    count: Math.max(1, Math.floor(MAX_COUNT / (i + 1))),
  }));
}

async function main(): Promise<void> {
  console.log('Initializing database...');
  initDb(DB_PATH);

  const existing = queryCount();
  if (existing >= 100000) {
    console.log(`Dataset already exists with ${existing} queries. Skipping generation.`);
    return;
  }

  console.log('Generating 100,000 synthetic queries...');
  const rows = buildQueries();
  console.log(`Generated ${rows.length} unique queries. Top 5:`);
  rows.slice(0, 5).forEach(r => console.log(`  "${r.query}" → ${r.count.toLocaleString()}`));

  console.log('\nInserting into SQLite...');
  bulkInsertInitial(rows);

  console.log(`\nDataset generation complete. ${rows.length} queries loaded.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
