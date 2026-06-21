import { Router } from 'express';
import type { BatchWriter } from '../services/BatchWriter';
import type { TrendingService } from '../services/TrendingService';

export function searchRouter(batchWriter: BatchWriter, trendingService: TrendingService): Router {
  const router = Router();

  router.post('/search', (req, res) => {
    const body = req.body as { query?: unknown };
    const rawQuery = typeof body.query === 'string' ? body.query : '';
    const query = rawQuery.toLowerCase().trim();

    if (!query) {
      return res.status(400).json({ error: 'query field is required and must be a non-empty string' });
    }

    batchWriter.enqueue(query);
    trendingService.recordSearch(query);

    return res.json({ message: 'Searched', query });
  });

  return router;
}
