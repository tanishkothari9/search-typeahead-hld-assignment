import { Router } from 'express';
import type { TrendingService } from '../services/TrendingService';

export function trendingRouter(
  trendingService: TrendingService,
  getCountMap: () => Map<string, number>,
): Router {
  const router = Router();

  router.get('/trending', (_req, res) => {
    const trending = trendingService.getTrending(getCountMap);
    const config = trendingService.getConfig();
    return res.json({ trending, config });
  });

  return router;
}
