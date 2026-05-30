// ============================================
// Environment Variables Configuration
// ============================================

import 'dotenv/config';
import { z } from 'zod';

// Environment schema - no strict validation for local development
const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  DATABASE_DIRECT_URL: z.string().default('file:./dev.db'),
  TELEGRAM_BOT_TOKEN: z.string().default('dummy_token'),
  AI_API_KEY: z.string().default('dummy_key'),
  AI_MODEL: z.string().default('gpt-4o'),
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  JWT_SECRET: z.string().default('this_is_a_test_secret_key_minimum_32_characters_long'),
  LOG_LEVEL: z.string().default('info'),
  LOG_PRETTY: z.string().default('true'),
  DEBUG: z.string().default('false'),
});

// Parse environment (use dummy values if not set)
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch {
  console.warn('Using default environment values for local development');
  env = envSchema.parse({});
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  databaseUrl: env.DATABASE_URL,
  databaseDirectUrl: env.DATABASE_DIRECT_URL,
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramApprovalChatId: process.env.TELEGRAM_APPROVAL_CHAT_ID || '',
  aiApiKey: env.AI_API_KEY,
  aiBaseUrl: env.AI_BASE_URL,
  aiModel: env.AI_MODEL,
  apiPort: parseInt(env.PORT, 10),
  apiHost: '0.0.0.0',
  corsOrigin: '*',
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: '7d',
  rateLimitWindowMs: 900000,
  rateLimitMax: 100,
  logLevel: env.LOG_LEVEL,
  logPretty: env.LOG_PRETTY === 'true',
};

export const isDev = () => config.nodeEnv === 'development';
export const isProd = () => config.nodeEnv === 'production';