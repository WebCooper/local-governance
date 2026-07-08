/**
 * Single source of truth for the Redis connection every queue/worker in the
 * reporting pipeline uses. Centralised so REDIS_HOST/REDIS_PORT only need to
 * be read from process.env in one place.
 *
 * Returned as a plain object (rather than typed against bullmq's
 * ConnectionOptions) because bullmq and the top-level ioredis dependency can
 * each bundle their own, structurally-incompatible ioredis type defs. Both
 * Queue/Worker (bullmq) and Redis (ioredis) accept this shape at runtime.
 */
export function getRedisConnectionOptions(): { host: string; port: number } {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '', 10) || 6379,
  };
}

/** Names of the three stage queues that make up the reporting pipeline. */
export const REPORT_QUEUES = {
  MODERATION: 'report-moderation',
  IPFS_UPLOAD: 'report-ipfs-upload',
  CHAIN_SUBMIT: 'chain-submit', // shared by report submission, votes, AND cron finalization
} as const;
