import { Router } from 'express';
import type { SuggestionService } from '../services/SuggestionService';

export function suggestRouter(suggestionService: SuggestionService): Router {
  const router = Router();

  router.get('/suggest', (req, res) => {
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    const prefix = q.toLowerCase().trim();

    if (!prefix) {
      return res.json({ suggestions: [], prefix: '' });
    }

    const suggestions = suggestionService.getSuggestions(prefix);
    return res.json({ suggestions, prefix, count: suggestions.length });
  });

  return router;
}
