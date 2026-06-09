// Render Execution Audit
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🎬 RENDER EXECUTION AUDIT\n');
  console.log('═'.repeat(70));

  const jobs = await prisma.renderJob.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      productionPackage: {
        include: { product: true }
      }
    }
  });

  console.log('\nTotal Render Jobs:', jobs.length);

  const byStatus = {
    queued: jobs.filter(j => j.status === 'queued'),
    processing: jobs.filter(j => j.status === 'processing'),
    completed: jobs.filter(j => j.status === 'completed'),
    failed: jobs.filter(j => j.status === 'failed'),
  };

  console.log('\n📊 STATUS BREAKDOWN');
  console.log('├ Queued:    ', byStatus.queued.length);
  console.log('├ Processing:', byStatus.processing.length);
  console.log('├ Completed: ', byStatus.completed.length);
  console.log('└ Failed:    ', byStatus.failed.length);

  console.log('\n═'.repeat(70));
  console.log('\n📋 DETAILED JOB LIST\n');

  for (const job of jobs) {
    console.log('──────────────────────────────────────────────────────────────────');
    console.log('🆔 ID:', job.id.substring(0, 12) + '...');
    console.log('   Tool:', job.tool);
    console.log('   Type:', job.jobType);
    console.log('   Status:', job.status);
    console.log('   Product:', job.productionPackage?.product?.name || 'N/A');

    if (job.startedAt) console.log('   Started:', new Date(job.startedAt).toLocaleString('id-ID'));
    if (job.completedAt) {
      console.log('   Completed:', new Date(job.completedAt).toLocaleString('id-ID'));
      const duration = (job.completedAt.getTime() - new Date(job.startedAt!).getTime()) / 1000;
      console.log('   Duration:', duration.toFixed(1), 'seconds');
    }

    console.log('   Output URL:', job.outputUrl ? 'Yes (' + job.outputUrl.substring(0, 40) + '...)' : 'None');
    console.log('   Error:', job.errorMessage || 'None');
    console.log('   Retry:', job.retryCount);
  }

  // By provider
  console.log('\n═'.repeat(70));
  console.log('\n📊 BY PROVIDER');

  const byTool: any = {};
  for (const job of jobs) {
    if (!byTool[job.tool]) byTool[job.tool] = { total: 0, completed: 0, failed: 0, pending: 0 };
    byTool[job.tool].total++;
    if (job.status === 'completed') byTool[job.tool].completed++;
    else if (job.status === 'failed') byTool[job.tool].failed++;
    else byTool[job.tool].pending++;
  }

  for (const [tool, stats] of Object.entries(byTool)) {
    console.log('\n🎯', tool, ':', stats.total, 'total');
    console.log('   Completed:', stats.completed, '| Failed:', stats.failed, '| Pending:', stats.pending);
  }

  await prisma.$disconnect();
  console.log('\n✅ AUDIT COMPLETE\n');
}

main().catch(console.error);