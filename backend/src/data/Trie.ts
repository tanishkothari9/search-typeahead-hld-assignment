export interface Suggestion {
  query: string;
  count: number;
}

class TrieNode {
  children: Map<string, TrieNode> = new Map();
  topK: Suggestion[] = [];
}

export class Trie {
  private root: TrieNode = new TrieNode();
  private readonly K = 10;
  private totalNodes = 0;

  insert(query: string, count: number): void {
    const suggestion: Suggestion = { query, count };
    let node = this.root;
    this.updateTopK(node, suggestion);

    for (const char of query) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
        this.totalNodes++;
      }
      node = node.children.get(char)!;
      this.updateTopK(node, suggestion);
    }
  }

  search(prefix: string): Suggestion[] {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }
    return [...node.topK];
  }

  updateCount(query: string, delta: number): void {
    let node = this.root;
    this.incrementInTopK(node, query, delta);

    for (const char of query) {
      if (!node.children.has(char)) {
        // Query didn't exist before; do a fresh insert with the delta as count
        this.insert(query, delta);
        return;
      }
      node = node.children.get(char)!;
      this.incrementInTopK(node, query, delta);
    }
  }

  loadFromDb(rows: { query: string; count: number }[]): void {
    // Sort descending by count so higher-count items get priority in topK
    const sorted = [...rows].sort((a, b) => b.count - a.count);
    for (const row of sorted) {
      this.insert(row.query, row.count);
    }
  }

  getStats(): { totalNodes: number; loadedQueries: number } {
    return { totalNodes: this.totalNodes, loadedQueries: this.root.topK.length };
  }

  private updateTopK(node: TrieNode, suggestion: Suggestion): void {
    const existing = node.topK.findIndex(s => s.query === suggestion.query);

    if (existing !== -1) {
      node.topK[existing] = suggestion;
    } else if (node.topK.length < this.K) {
      node.topK.push(suggestion);
    } else if (suggestion.count > (node.topK[this.K - 1]?.count ?? 0)) {
      node.topK[this.K - 1] = suggestion;
    } else {
      return;
    }

    // Keep sorted descending by count
    node.topK.sort((a, b) => b.count - a.count);
  }

  private incrementInTopK(node: TrieNode, query: string, delta: number): void {
    const existing = node.topK.findIndex(s => s.query === query);
    if (existing !== -1) {
      node.topK[existing] = { query, count: node.topK[existing].count + delta };
      node.topK.sort((a, b) => b.count - a.count);
    }
    // If not in topK, will be picked up on next cache invalidation + trie search
  }
}
