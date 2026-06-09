// Distribution Queue Detailed Status
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.distributionQueue.findMany({
    include: { brand: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n📨 DISTRIBUTION QUEUE - DETAILED STATUS\n');
  console.log('═'.repeat(80));

  for (const item of items) {
    console.log('\n🆔 ID:', item.id);
    console.log('   Brand:', item.brand?.name || 'N/A');
    console.log('   Platform:', item.platform);
    console.log('   Status:', item.status);
    console.log('   Content Type:', item.contentType);
    console.log('   ─────────────────────────────────');
    console.log('   📦 Production Pkg ID:', item.productId || 'N/A');
    console.log('   🎬 Asset ID:', item.assetFileId || 'N/A');
    console.log('   🔗 Social Account ID:', item.socialAccountId || 'N/A');
    console.log('   🔑 Zernio Config ID:', item.zernioConfigId || 'N/A');
    console.log('   ─────────────────────────────────');
    console.log('   📅 Scheduled:', item.scheduledAt ? new Date(item.scheduledAt).toLocaleString('id-ID') : 'Not scheduled');
    console.log('   ✅ Posted:', item.postedAt ? new Date(item.postedAt).toLocaleString('id-ID') : 'Not posted');
    console.log('   🌐 Post URL:', item.postUrl || 'No URL yet');
    console.log('   ─────────────────────────────────');
    console.log('   📊 Stats: Views:', item.views, '| Likes:', item.likes, '| Comments:', item.comments);
    console.log('   💰 Revenue:', item.revenue.toFixed(2), '| Commission:', item.commission.toFixed(2));
    console.log('   ─────────────────────────────────');
    console.log('   Provider:', item.provider);
    console.log('   Error:', item.errorMessage || 'None');
    console.log('═'.repeat(80));
  }

  const byStatus = {
    DRAFT: items.filter(i => i.status === 'DRAFT').length,
    READY: items.filter(i => i.status === 'READY').length,
    QUEUED: items.filter(i => i.status === 'QUEUED').length,
    POSTING: items.filter(i => i.status === 'POSTING').length,
    POSTED: items.filter(i => i.status === 'POSTED').length,
    FAILED: items.filter(i => i.status === 'FAILED').length,
  };

  console.log('\n📊 SUMMARY\n');
  console.log('  DRAFT:    ', byStatus.DRAFT);
  console.log('  READY:    ', byStatus.READY);
  console.log('  QUEUED:   ', byStatus.QUEUED);
  console.log('  POSTING:  ', byStatus.POSTING);
  console.log('  POSTED:   ', byStatus.POSTED);
  console.log('  FAILED:   ', byStatus.FAILED);
  console.log('  TOTAL:    ', items.length);

  console.log('\n🔑 With Zernio Config:', items.filter(i => i.zernioConfigId).length);

  const renderJobs = await prisma.renderJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  console.log('\n🎬 RENDER JOBS (' + renderJobs.length + ')\n');
  for (const job of renderJobs) {
    console.log('  ' + job.tool + ' | ' + job.status + ' | Output: ' + (job.outputUrl ? 'Yes' : 'No'));
  }

  const assets = await prisma.assetFile.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  console.log('\n📁 ASSET FILES (' + assets.length + ')\n');
  for (const asset of assets) {
    console.log('  ' + asset.fileType + ' | ' + asset.provider + ' | Upload: ' + asset.uploadStatus);
  }

  await prisma.$disconnect();
}

main().catch(console.error);