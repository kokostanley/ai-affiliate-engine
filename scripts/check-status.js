// Workflow Status Check Script
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 AI AFFILIATE ENGINE - WORKFLOW STATUS');
  console.log('========================================\n');

  try {
    const [products, contents, pending, approved, rejected, packages, brands, accounts, queue] = await Promise.all([
      prisma.product.count(),
      prisma.content.count(),
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.content.count({ where: { approvalStatus: 'APPROVED' } }),
      prisma.content.count({ where: { approvalStatus: 'REJECTED' } }),
      prisma.productionPackage.count(),
      prisma.brand.count(),
      prisma.socialAccount.count(),
      prisma.distributionQueue.count(),
    ]);

    console.log('📦 PRODUCTS: ' + products + ' total');
    console.log('📝 CONTENT: ' + contents + ' total | Pending: ' + pending + ' | Approved: ' + approved + ' | Rejected: ' + rejected);
    console.log('🎬 PRODUCTION: ' + packages + ' packages');
    console.log('🏢 BRANDS: ' + brands);
    console.log('📱 ACCOUNTS: ' + accounts);
    console.log('📨 QUEUE: ' + queue);
    console.log('\n========================================\n');

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();