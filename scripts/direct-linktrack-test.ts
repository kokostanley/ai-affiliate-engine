// Direct test of linktrack command handler
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulate Telegram context
const mockCtx = {
  message: {
    text: '/linktrack',
    from: {
      id: 5985049933,
      username: 'cepatdapatpromo',
      first_name: 'Cepas',
      last_name: 'Dapat'
    }
  },
  from: {
    id: 5985049933,
    username: 'cepatdapatpromo',
    first_name: 'Cepas'
  },
  reply: async (text: string, opts?: any) => {
    console.log('\n📤 Bot response to user:');
    console.log('─'.repeat(50));
    console.log(text.substring(0, 1000));
    console.log('─'.repeat(50));
    return { message_id: Date.now() };
  }
};

async function testDirect() {
  console.log('=== Direct Test of /linktrack Handler ===\n');

  try {
    // Import the handler
    const { handleLinkTrackCommand } = await import('../src/bot/commands/linktrack');

    console.log('Calling handleLinkTrackCommand...');
    await handleLinkTrackCommand(mockCtx);
    console.log('\n✅ Handler executed successfully!');

  } catch (error: any) {
    console.error('❌ Handler error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testDirect();