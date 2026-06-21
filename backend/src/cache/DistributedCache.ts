import { ConsistentHashRing } from './ConsistentHashRing';
import type { Suggestion } from '../data/Trie';

interface CacheEntry {
  data: Suggestion[];
  expiresAt: number;
}

export interface CacheDebugInfo {
  prefix: string;
  ownerNode: string;
  virtualPosition: number;
  hit: boolean;
  data?: Suggestion[];
  ttlRemainingMs?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: string;
  nodeKeyCounts: Record<string, number>;
}

export class DistributedCache {
  private nodes: Map<string, Map<string, CacheEntry>> = new Map();
  private ring: ConsistentHashRing;
  private readonly TTL_MS: number;
  private hits = 0;
  private misses = 0;

  constructor(ring: ConsistentHashRing, ttlMs = 60_000) {
    this.ring = ring;
    this.TTL_MS = ttlMs;

    for (const nodeId of ring.getNodeList()) {
      this.nodes.set(nodeId, new Map());
    }
  }

  get(prefix: string): Suggestion[] | null {
    const nodeId = this.ring.getNode(prefix);
    const nodeMap = this.nodes.get(nodeId)!;
    const entry = nodeMap.get(prefix);

    if (!entry) {
      this.misses++;
      console.log(`[CACHE] prefix="${prefix}" → ${nodeId} MISS`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      nodeMap.delete(prefix);
      this.misses++;
      console.log(`[CACHE] prefix="${prefix}" → ${nodeId} EXPIRED`);
      return null;
    }

    this.hits++;
    console.log(`[CACHE] prefix="${prefix}" → ${nodeId} HIT`);
    return entry.data;
  }

  set(prefix: string, data: Suggestion[]): void {
    const nodeId = this.ring.getNode(prefix);
    const nodeMap = this.nodes.get(nodeId)!;
    nodeMap.set(prefix, { data, expiresAt: Date.now() + this.TTL_MS });
  }

  invalidate(prefix: string): void {
    const nodeId = this.ring.getNode(prefix);
    const nodeMap = this.nodes.get(nodeId)!;
    if (nodeMap.has(prefix)) {
      nodeMap.delete(prefix);
      console.log(`[CACHE] invalidated prefix="${prefix}" on ${nodeId}`);
    }
  }

  getDebugInfo(prefix: string): CacheDebugInfo {
    const { nodeId, virtualPosition } = this.ring.getDebugInfo(prefix);
    const nodeMap = this.nodes.get(nodeId)!;
    const entry = nodeMap.get(prefix);
    const now = Date.now();

    if (!entry || now > entry.expiresAt) {
      if (entry) nodeMap.delete(prefix);
      return { prefix, ownerNode: nodeId, virtualPosition, hit: false };
    }

    return {
      prefix,
      ownerNode: nodeId,
      virtualPosition,
      hit: true,
      data: entry.data,
      ttlRemainingMs: entry.expiresAt - now,
    };
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const nodeKeyCounts: Record<string, number> = {};
    for (const [nodeId, nodeMap] of this.nodes.entries()) {
      // Count only non-expired entries
      let count = 0;
      const now = Date.now();
      for (const entry of nodeMap.values()) {
        if (entry.expiresAt > now) count++;
      }
      nodeKeyCounts[nodeId] = count;
    }
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? '0%' : `${((this.hits / total) * 100).toFixed(1)}%`,
      nodeKeyCounts,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
