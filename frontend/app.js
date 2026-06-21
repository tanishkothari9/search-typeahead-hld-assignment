/* SearchHLD — Maximalist Frontend */

const API = '';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const searchInput   = document.getElementById('searchInput');
const searchBox     = document.getElementById('searchBox');
const dropdown      = document.getElementById('dropdown');
const sugList       = document.getElementById('suggestionList');
const dropFooter    = document.getElementById('dropdownFooter');
const spinner       = document.getElementById('spinner');
const clearBtn      = document.getElementById('clearBtn');
const resultBanner  = document.getElementById('resultBanner');
const trendingChips = document.getElementById('trendingChips');
const trendWindow   = document.getElementById('trendWindow');
const debugInput    = document.getElementById('debugInput');
const debugBtn      = document.getElementById('debugBtn');
const debugOutput   = document.getElementById('debugOutput');
const refreshBtn    = document.getElementById('refreshMetrics');
const ringLegend    = document.getElementById('ringLegend');
const ringNodes     = document.getElementById('ringNodes');
const sbLatency     = document.getElementById('sbLatency');

// Metric elements
const metEls = {
  avg:       { val: document.getElementById('metAvg'),       bar: document.getElementById('barAvg') },
  p95:       { val: document.getElementById('metP95'),       bar: document.getElementById('barP95') },
  hitRate:   { val: document.getElementById('metHitRate'),   bar: document.getElementById('barHitRate') },
  hits:      { val: document.getElementById('metHits'),      bar: document.getElementById('barHits') },
  misses:    { val: document.getElementById('metMisses'),    bar: document.getElementById('barMisses') },
  dbReads:   { val: document.getElementById('metDbReads'),   bar: document.getElementById('barDbReads') },
  events:    { val: document.getElementById('metEvents'),    bar: document.getElementById('barEvents') },
  avoided:   { val: document.getElementById('metAvoided'),   bar: document.getElementById('barAvoided') },
  reduction: { val: document.getElementById('metReduction'), bar: document.getElementById('barReduction') },
};

let selectedIdx = -1;
let suggestions  = [];
let requestId    = 0;
let maxSugCount  = 1;  // for normalizing popularity bars

// ── Utilities ─────────────────────────────────────────────────────────────────

function debounce(fn, delay) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

function highlight(text, prefix) {
  if (!prefix) return esc(text);
  const lo = text.toLowerCase(), pfx = prefix.toLowerCase();
  const i = lo.indexOf(pfx);
  if (i === -1) return esc(text);
  return esc(text.slice(0,i)) + '<em>' + esc(text.slice(i, i + pfx.length)) + '</em>' + esc(text.slice(i + pfx.length));
}

function fmt(n) {
  if (typeof n !== 'number') return n;
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M';
  if (n >= 1_000)     return (n/1_000).toFixed(1)+'K';
  return n.toString();
}

function pad2(n) { return String(n).padStart(2, '0'); }

// ── Suggestions ───────────────────────────────────────────────────────────────

async function fetchSuggestions(prefix) {
  const myId = ++requestId;
  if (!prefix.trim()) { closeDropdown(); return; }
  spinner.classList.add('active');

  try {
    const res = await fetch(`${API}/suggest?q=${encodeURIComponent(prefix)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (myId !== requestId) return;
    suggestions = data.suggestions ?? [];
    maxSugCount = suggestions[0]?.count || 1;
    renderDropdown(prefix);
  } catch {
    if (myId !== requestId) return;
    showDropdownError('Server unavailable.');
  } finally {
    if (myId === requestId) spinner.classList.remove('active');
  }
}

const debouncedFetch = debounce(fetchSuggestions, 300);

function renderDropdown(prefix) {
  sugList.innerHTML = '';
  selectedIdx = -1;

  if (!suggestions.length) {
    dropFooter.textContent = `No results for "${prefix}"`;
    dropdown.classList.add('open');
    return;
  }

  suggestions.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.setAttribute('role', 'option');
    li.dataset.idx = i;
    const pct = Math.round((s.count / maxSugCount) * 100);
    li.innerHTML = `
      <span class="sug-rank">${pad2(i+1)}</span>
      <span class="sug-query">${highlight(s.query, prefix)}</span>
      <div class="sug-bar"><div class="sug-bar-fill" style="width:${pct}%"></div></div>
      <span class="sug-count">${fmt(s.count)}</span>
    `;
    li.addEventListener('mousedown', e => { e.preventDefault(); selectSuggestion(i); });
    sugList.appendChild(li);
  });

  dropFooter.textContent = `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`;
  dropdown.classList.add('open');
}

function showDropdownError(msg) {
  sugList.innerHTML = `<li class="suggestion-item"><span class="sug-rank">!</span><span class="sug-query" style="color:var(--orange)">${esc(msg)}</span></li>`;
  dropFooter.textContent = '';
  dropdown.classList.add('open');
}

function closeDropdown() {
  dropdown.classList.remove('open');
  selectedIdx = -1;
  suggestions = [];
}

function highlightItem(idx) {
  sugList.querySelectorAll('.suggestion-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    if (i === idx) el.scrollIntoView({ block: 'nearest' });
  });
}

function selectSuggestion(idx) {
  const s = suggestions[idx];
  if (!s) return;
  searchInput.value = s.query;
  closeDropdown();
  submitSearch(s.query);
}

// ── Search submit ─────────────────────────────────────────────────────────────

async function submitSearch(query) {
  if (!query.trim()) return;
  resultBanner.className = 'result-banner';

  try {
    const res = await fetch(`${API}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    resultBanner.textContent = `✓ ${data.message ?? 'Searched'} — "${query}"`;
    resultBanner.className = 'result-banner success';
    setTimeout(fetchTrending, 600);
    setTimeout(fetchMetrics, 800);
  } catch {
    resultBanner.textContent = `✗ Search failed — is the server running?`;
    resultBanner.className = 'result-banner error';
  }
}

// ── Trending ──────────────────────────────────────────────────────────────────

async function fetchTrending() {
  try {
    const res = await fetch(`${API}/trending`);
    const data = await res.json();
    renderTrending(data);
  } catch {
    trendingChips.innerHTML = '<span class="empty-msg">Could not load trending data.</span>';
  }
}

function renderTrending(data) {
  const list = data.trending ?? [];
  const cfg  = data.config ?? {};

  if (cfg.windowHours) {
    trendWindow.textContent = `last ${cfg.windowHours}h · ×${cfg.recencyMultiplier} recency boost`;
  }

  if (!list.length) {
    trendingChips.innerHTML = '<span class="empty-msg">NO TRENDING YET. SUBMIT SOME SEARCHES ABOVE.</span>';
    return;
  }

  trendingChips.innerHTML = list.map((t, i) => `
    <button class="trend-chip" data-query="${esc(t.query)}" title="${esc(t.formula)}">
      <span class="trend-rank">#${i+1}</span>
      ${esc(t.query)}
      <span class="trend-score">${fmt(t.score)}</span>
    </button>
  `).join('');

  trendingChips.querySelectorAll('.trend-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      searchInput.value = chip.dataset.query;
      clearBtn.classList.add('visible');
      closeDropdown();
      submitSearch(chip.dataset.query);
      chip.style.transform = 'scale(0.92)';
      setTimeout(() => (chip.style.transform = ''), 200);
    });
  });
}

// ── Metrics ───────────────────────────────────────────────────────────────────

let prevMetrics = {};

async function fetchMetrics() {
  try {
    const res = await fetch(`${API}/metrics`);
    const data = await res.json();
    const lat = data.latency ?? {};
    const cache = data.cache ?? {};
    const db = data.db ?? {};

    const hits   = cache.hits   ?? 0;
    const misses = cache.misses ?? 0;
    const total  = hits + misses || 1;
    const events = db.totalSearchEvents ?? 0;
    const avoided = db.totalWritesAvoided ?? 0;
    const maxCount = Math.max(events, avoided, hits, misses, db.reads ?? 0, 1);

    const updates = [
      { key: 'avg',       raw: lat.avgMs,          display: (lat.avgMs ?? '—') + ' ms',          pct: Math.min(100, ((lat.avgMs??0)/50)*100) },
      { key: 'p95',       raw: lat.p95Ms,           display: (lat.p95Ms ?? '—') + ' ms',          pct: Math.min(100, ((lat.p95Ms??0)/100)*100) },
      { key: 'hitRate',   raw: cache.hitRate,        display: cache.hitRate ?? '—',                pct: parseFloat(cache.hitRate ?? '0') || 0 },
      { key: 'hits',      raw: hits,                 display: fmt(hits),                            pct: (hits/maxCount)*100 },
      { key: 'misses',    raw: misses,               display: fmt(misses),                          pct: (misses/maxCount)*100 },
      { key: 'dbReads',   raw: db.reads,             display: fmt(db.reads ?? 0),                  pct: ((db.reads??0)/maxCount)*100 },
      { key: 'events',    raw: events,               display: fmt(events),                          pct: (events/maxCount)*100 },
      { key: 'avoided',   raw: avoided,              display: fmt(avoided),                         pct: (avoided/maxCount)*100 },
      { key: 'reduction', raw: db.writeReductionPercent, display: db.writeReductionPercent ?? '—', pct: parseFloat(db.writeReductionPercent ?? '0') || 0 },
    ];

    for (const u of updates) {
      const el = metEls[u.key];
      if (el) {
        el.val.textContent = u.display;
        el.bar.style.width = `${Math.max(0, Math.min(100, u.pct))}%`;
      }
    }

    // Update status bar p95
    if (lat.p95Ms != null) sbLatency.textContent = `${lat.p95Ms} ms p95`;

    prevMetrics = data;
  } catch { /* silent */ }
}

// ── Ring ──────────────────────────────────────────────────────────────────────

async function fetchRing() {
  try {
    const res = await fetch(`${API}/cache/ring`);
    const data = await res.json();
    renderRing(data);
  } catch {
    ringLegend.innerHTML = '<span class="empty-msg">Could not load ring data.</span>';
  }
}

function renderRing(data) {
  const dist  = data.keyspaceDistribution ?? {};
  const nodes = Object.keys(dist);
  if (!nodes.length) return;

  ringLegend.innerHTML = nodes.map((nodeId) => {
    const pct    = dist[nodeId] ?? '0%';
    const pctNum = parseFloat(pct);
    return `
      <div class="ring-legend-item">
        <div class="ring-legend-dot"></div>
        <span class="ring-legend-label">${nodeId}</span>
        <div class="ring-legend-bar">
          <div class="ring-legend-bar-fill" style="width:${Math.min(100, pctNum * 4)}%"></div>
        </div>
        <span class="ring-legend-pct">${pct}</span>
      </div>
    `;
  }).join('');
}

// ── Cache debug ───────────────────────────────────────────────────────────────

async function fetchCacheDebug(prefix) {
  if (!prefix.trim()) {
    debugOutput.innerHTML = '<span class="debug-comment">// Enter a prefix above.</span>';
    return;
  }
  debugOutput.textContent = '// Routing through consistent hash ring…';
  try {
    const res = await fetch(`${API}/cache/debug?prefix=${encodeURIComponent(prefix)}`);
    const data = await res.json();

    const hitColor  = data.hit ? '#a3ff12' : '#ff6b35';
    const hitLabel  = data.hit ? '✓ HIT' : '✗ MISS';
    const formatted = JSON.stringify(data, null, 2)
      .replace(/"([^"]+)":/g, '<span style="color:#9d5aff">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span style="color:#5de0ff">"$1"</span>')
      .replace(/: (true|false)/g, ': <span style="color:#ffb800">$1</span>')
      .replace(/: (\d+)/g, ': <span style="color:#ff4db8">$1</span>');

    debugOutput.innerHTML = `<span style="color:${hitColor}">// ${hitLabel} — prefix="${esc(prefix)}" → ${esc(data.ownerNode ?? '?')}</span>\n${formatted}`;
  } catch {
    debugOutput.innerHTML = '<span style="color:var(--orange)">// Error — is the server running?</span>';
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  const v = searchInput.value;
  clearBtn.classList.toggle('visible', v.length > 0);
  debouncedFetch(v);
});

searchInput.addEventListener('keydown', e => {
  const items = sugList.querySelectorAll('.suggestion-item');
  const open  = dropdown.classList.contains('open');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!open) return;
    selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
    highlightItem(selectedIdx);
    if (suggestions[selectedIdx]) searchInput.value = suggestions[selectedIdx].query;

  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open) return;
    selectedIdx = Math.max(selectedIdx - 1, -1);
    highlightItem(selectedIdx);
    if (selectedIdx >= 0 && suggestions[selectedIdx]) searchInput.value = suggestions[selectedIdx].query;

  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (open && selectedIdx >= 0) {
      selectSuggestion(selectedIdx);
    } else {
      const q = searchInput.value.trim();
      if (q) { closeDropdown(); submitSearch(q); }
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
});

document.addEventListener('mousedown', e => {
  if (!searchBox.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.classList.remove('visible');
  closeDropdown();
  searchInput.focus();
});

debugBtn.addEventListener('click', () => fetchCacheDebug(debugInput.value));
debugInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchCacheDebug(debugInput.value); });
refreshBtn.addEventListener('click', fetchMetrics);

// ── Init ──────────────────────────────────────────────────────────────────────

fetchTrending();
fetchMetrics();
fetchRing();

setInterval(fetchTrending, 30_000);
setInterval(fetchMetrics, 10_000);
setInterval(fetchRing, 60_000);

searchInput.focus();
