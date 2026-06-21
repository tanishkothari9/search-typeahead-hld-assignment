import { createHash } from 'crypto';

interface RingNode {
  position: number;
  nodeId: string;
}

export interface RingDebugInfo {
  nodeId: string;
  virtualPosition: number;
  ringSize: number;
}

export class ConsistentHashRing {
  private ring: RingNode[] = [];
  private nodeIds: Set<string> = new Set();
  private readonly VIRTUAL_NODES: number;

  constructor(virtualNodes = 150) {
    this.VIRTUAL_NODES = virtualNodes;
  }

  addNode(nodeId: string): void {
    if (this.nodeIds.has(nodeId)) return;
    this.nodeIds.add(nodeId);

    for (let i = 0; i < this.VIRTUAL_NODES; i++) {
      const position = this.hash(`${nodeId}-vn-${i}`);
      this.ring.push({ position, nodeId });
    }

    this.ring.sort((a, b) => a.position - b.position);
  }

  removeNode(nodeId: string): void {
    this.nodeIds.delete(nodeId);
    this.ring = this.ring.filter(n => n.nodeId !== nodeId);
  }

  getNode(key: string): string {
    if (this.ring.length === 0) throw new Error('Ring is empty. Add nodes first.');
    const pos = this.hash(key);
    const idx = this.binarySearch(pos);
    return this.ring[idx].nodeId;
  }

  getDebugInfo(key: string): RingDebugInfo {
    if (this.ring.length === 0) throw new Error('Ring is empty.');
    const pos = this.hash(key);
    const idx = this.binarySearch(pos);
    return {
      nodeId: this.ring[idx].nodeId,
      virtualPosition: this.ring[idx].position,
      ringSize: this.ring.length,
    };
  }

  getNodeList(): string[] {
    return [...this.nodeIds];
  }

  getKeyspaceDistribution(): Record<string, string> {
    const MAX_UINT32 = 4294967295;
    const segments: Record<string, number> = {};
    for (const id of this.nodeIds) segments[id] = 0;

    for (let i = 0; i < this.ring.length; i++) {
      const start = i === 0 ? 0 : this.ring[i - 1].position;
      const end = this.ring[i].position;
      segments[this.ring[i].nodeId] += end - start;
    }
    // wrap-around segment (last node covers to MAX_UINT32)
    const last = this.ring[this.ring.length - 1];
    segments[last.nodeId] += MAX_UINT32 - last.position;

    const result: Record<string, string> = {};
    for (const [id, size] of Object.entries(segments)) {
      result[id] = `${((size / MAX_UINT32) * 100).toFixed(1)}%`;
    }
    return result;
  }

  private hash(input: string): number {
    const buf = createHash('sha1').update(input).digest();
    // Read first 4 bytes as unsigned 32-bit big-endian integer
    return ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
  }

  private binarySearch(target: number): number {
    let lo = 0;
    let hi = this.ring.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].position < target) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // Wrap around: if lo === ring.length, wrap to index 0
    return lo % this.ring.length;
  }
}
