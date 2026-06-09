// Simple test
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  const brands = await prisma.brand.findMany();
  console.log('Brands found:', brands.length);
  for (const brand of brands) {
    console.log(' -', brand.name);
  }
}

test()
  .then(() => {
    console.log('Done');
    prisma.$disconnect();
  })
  .catch(console.error);