import { Router } from 'express';
import type { DistributedCache } from '../cache/DistributedCache';
import type { ConsistentHashRing } from '../cache/ConsistentHashRing';

export function cacheDebugRouter(cache: DistributedCache, ring: ConsistentHashRing): Router {
  const router = Router();

  router.get('/cache/debug', (req, res) => {
    const p = typeof req.query['prefix'] === 'string' ? req.query['prefix'] : '';
    const prefix = p.toLowerCase().trim();

    if (!prefix) {
      return res.status(400).json({ error: 'prefix query param is required' });
    }

    const info = cache.getDebugInfo(prefix);
    return res.json(info);
  });

  router.get('/cache/ring', (_req, res) => {
    const distribution = ring.getKeyspaceDistribution();
    const stats = cache.getStats();
    return res.json({
      nodes: ring.getNodeList(),
      keyspaceDistribution: distribution,
      cacheStats: stats,
    });
  });

  return router;
}
