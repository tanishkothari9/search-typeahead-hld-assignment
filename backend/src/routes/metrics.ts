import { Router } from 'express';
import type { MetricsCollector } from '../middleware/metricsMiddleware';
import type { DistributedCache } from '../cache/DistributedCache';
import type { BatchWriter } from '../services/BatchWriter';

export function metricsRouter(
  metricsCollector: MetricsCollector,
  cache: DistributedCache,
  batchWriter: BatchWriter,
): Router {
  const router = Router();

  router.get('/metrics', (_req, res) => {
    const snapshot = metricsCollector.getSnapshot();
    const cacheStats = cache.getStats();
    const bufferSize = batchWriter.getBufferSize();

    return res.json({
      ...snapshot,
      cache: cacheStats,
      batch: {
        pendingBufferSize: bufferSize,
        tradeOffNote:
          'Pending writes in buffer are lost on process crash. ' +
          'For production, journal writes to a WAL, Redis list, or Kafka topic before acknowledging.',
      },
    });
  });

  return router;
}
