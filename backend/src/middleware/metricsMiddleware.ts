import type { Request, Response, NextFunction } from 'express';

export class MetricsCollector {
  private latencies: number[] = [];
  private readonly MAX_WINDOW = 1000;

  dbReads = 0;
  batchFlushCount = 0;
  totalSearchEvents = 0;
  uniqueQueriesFlushed = 0;
  totalWritesAvoided = 0;

  recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > this.MAX_WINDOW) {
      this.latencies.shift();
    }
  }

  getAvg(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  getP95(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.ceil(0.95 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getSnapshot(): object {
    const totalEvents = this.totalSearchEvents;
    const dbWrites = this.uniqueQueriesFlushed;
    const reduction = totalEvents > 0 && dbWrites > 0
      ? `${(((totalEvents - dbWrites) / totalEvents) * 100).toFixed(1)}%`
      : '0%';

    return {
      latency: {
        avgMs: parseFloat(this.getAvg().toFixed(2)),
        p95Ms: parseFloat(this.getP95().toFixed(2)),
        sampleSize: this.latencies.length,
      },
      db: {
        reads: this.dbReads,
        batchFlushCount: this.batchFlushCount,
        totalSearchEvents: this.totalSearchEvents,
        uniqueQueriesFlushed: this.uniqueQueriesFlushed,
        totalWritesAvoided: this.totalWritesAvoided,
        writeReductionPercent: reduction,
      },
    };
  }
}

export function metricsMiddleware(collector: MetricsCollector) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      collector.recordLatency(ms);
    });
    next();
  };
}
