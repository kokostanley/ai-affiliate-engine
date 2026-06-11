// ============================================
// UNIFIED WORKER ENTRY POINT
// Starts all background workers together
// ============================================

import { renderWorker } from './render-worker';
import { distributionWorker } from './distribution-worker';
import { scheduler } from './scheduler';
import 'dotenv/config';

console.log('═══════════════════════════════════════════════════');
console.log('   AI AFFILIATE ENGINE - BACKGROUND WORKERS');
console.log('═══════════════════════════════════════════════════\n');

// Start all workers
console.log('Starting workers...\n');

// 1. Render Pipeline Worker
// Processes video/image generation jobs (Pippit, Higgsfield)
console.log('📹 Render Pipeline Worker');
renderWorker.start();

// 2. Distribution Pipeline Worker
// Auto-posts content to Zernio/social media
console.log('\n🚀 Distribution Pipeline Worker');
distributionWorker.start();

// 3. Scheduler Worker (legacy - for old ScheduledPost system)
// Can be enabled if needed: scheduler.start();
console.log('\n⏰ Scheduler Worker (optional - disabled by default)');
console.log('   To enable: scheduler.start() in this file\n');

// Stats logging every 30 seconds
setInterval(() => {
  console.log('\n📊 Worker Stats:');
  console.log('   Distribution:', distributionWorker.getStats());
}, 30000);

// Graceful shutdown
const shutdown = () => {
  console.log('\n\n🛑 Shutting down workers...\n');

  renderWorker.stop();
  distributionWorker.stop();

  console.log('✅ All workers stopped');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('═══════════════════════════════════════════════════');
console.log('   All workers running! Press Ctrl+C to stop.');
console.log('═══════════════════════════════════════════════════\n');