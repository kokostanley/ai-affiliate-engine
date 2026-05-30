// Bot Commands
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handleProductsCommand(ctx: any) {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (products.length === 0) {
    ctx.reply('No products yet. Use /add [link]');
    return;
  }

  let msg = 'Products (' + products.length + ')\n\n';
  for (const p of products) {
    msg = msg + p.name + '\n';
    msg = msg + 'Price: ' + p.price + ' | ID: ' + p.id.substring(0, 8) + '\n\n';
  }
  ctx.reply(msg);
}

export async function handleStatsCommand(ctx: any) {
  const total = await prisma.product.count();
  const active = await prisma.product.count({ where: { status: 'ACTIVE' } });
  ctx.reply('Stats\n\nTotal: ' + total + '\nActive: ' + active);
}

export async function handleApproveCommand(ctx: any, id: string) {
  ctx.reply('Approve: ' + id);
}

export async function handleRejectCommand(ctx: any, id: string, reason?: string) {
  ctx.reply('Reject: ' + id);
}

export async function handlePauseCommand(ctx: any, id: string) {
  ctx.reply('Pause: ' + id);
}

export async function handleDeleteCommand(ctx: any, id: string) {
  ctx.reply('Delete: ' + id);
}

export async function handleViewCommand(ctx: any, id: string) {
  const p = await prisma.product.findUnique({ where: { id: id } });
  if (p) {
    ctx.reply('Product: ' + p.name + '\nPrice: ' + p.price + '\nStatus: ' + p.status);
  } else {
    ctx.reply('Not found');
  }
}

export { prisma };