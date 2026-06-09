// ============================================
// MARK TEST DISTRIBUTIONS AS POSTED
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Marking test distributions as POSTED...\n');

  const drafts = await prisma.distributionQueue.findMany({
    where: { status: 'DRAFT' },
    include: { brand: true },
    take: 2,
  });

  for (const draft of drafts) {
    await prisma.distributionQueue.update({
      where: { id: draft.id },
      data: { status: 'POSTED', postedAt: new Date() },
    });
    console.log(`✅ Marked as POSTED: ${draft.id.substring(0, 8)}... for ${draft.brand.name}`);
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());