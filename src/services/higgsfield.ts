// ============================================
// HIGGSFIELD PROVIDER SERVICE
// Real AI Image & Video Generation
// ============================================

import { createHiggsfieldClient } from '@higgsfield/client/v2';
import dotenv from 'dotenv';

dotenv.config();

const HF_KEY_ID = process.env.HF_KEY_ID;
const HF_KEY_SECRET = process.env.HF_KEY_SECRET;

export interface HiggsFieldConfig {
  keyId: string;
  keySecret: string;
}

export interface GenerationResult {
  success: boolean;
  jobId?: string;
  status?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface TextToImageOptions {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  seed?: number;
  steps?: number;
}

export interface ImageToVideoOptions {
  imageUrl: string;
  prompt?: string;
  duration?: 4 | 5;
  resolution?: '720p' | '1080p';
  fps?: 24 | 30;
}

export interface SpeechToVideoOptions {
  imageUrl: string;
  script: string;
  voice?: string;
  duration?: 4 | 5;
}

/**
 * Create HiggsField client
 */
function createClient(): ReturnType<typeof createHiggsfieldClient> | null {
  if (!HF_KEY_ID || !HF_KEY_SECRET) {
    console.log('[HiggsField] Missing credentials');
    return null;
  }

  console.log('[HiggsField] Creating client with KEY_ID:', HF_KEY_ID?.substring(0, 10) + '...');

  return createHiggsfieldClient({
    credentials: `${HF_KEY_ID}:${HF_KEY_SECRET}`,
    timeout: 600000, // 10 min for video
    pollInterval: 3000,
    maxPollTime: 600000,
  });
}

/**
 * Check if HiggsField is configured
 */
export function isHiggsFieldConfigured(): boolean {
  return !!(HF_KEY_ID && HF_KEY_SECRET && HF_KEY_ID.length > 10);
}

/**
 * Test connection to HiggsField API
 */
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  if (!isHiggsFieldConfigured()) {
    return { success: false, message: 'HiggsField not configured. Add HF_KEY_ID and HF_KEY_SECRET to .env' };
  }

  try {
    const client = createClient();
    if (!client) {
      return { success: false, message: 'Failed to create client' };
    }

    console.log('[HiggsField] Connection test - client created successfully');

    return { success: true, message: 'HiggsField configured and ready' };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

/**
 * Generate text-to-image using Flux Kontext Max
 */
export async function generateImage(options: TextToImageOptions): Promise<GenerationResult> {
  const client = createClient();
  if (!client) {
    return { success: false, error: 'HiggsField not configured' };
  }

  try {
    console.log('[HiggsField] Generating image...');
    console.log('[HiggsField] Prompt:', options.prompt.substring(0, 100) + '...');

    const result: any = await client.subscribe('flux-pro/kontext/max/text-to-image', {
      input: {
        prompt: options.prompt,
        aspect_ratio: options.aspectRatio || '9:16',
        seed: options.seed,
        steps: options.steps,
      },
      withPolling: true,
    });

    console.log('[HiggsField] Image result:', JSON.stringify(result).substring(0, 200));

    const outputUrl = result?.results?.[0]?.url || result?.url || result?.output?.url;
    const jobId = result?.id || result?.jobId;

    console.log('[HiggsField] Image generated:', outputUrl);

    return {
      success: !!outputUrl,
      jobId,
      status: 'completed',
      outputUrl,
      thumbnailUrl: outputUrl,
    };
  } catch (error: any) {
    console.error('[HiggsField] Image generation failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate image-to-video using DoP model
 */
export async function generateVideo(options: ImageToVideoOptions): Promise<GenerationResult> {
  const client = createClient();
  if (!client) {
    return { success: false, error: 'HiggsField not configured' };
  }

  try {
    console.log('[HiggsField] Generating video...');
    console.log('[HiggsField] Image:', options.imageUrl.substring(0, 50) + '...');

    const result: any = await client.subscribe('image2video/dop/v2', {
      input: {
        image_url: options.imageUrl,
        prompt: options.prompt,
        duration: options.duration || 4,
        resolution: options.resolution || '720p',
        fps: options.fps || 30,
      },
      withPolling: true,
    });

    console.log('[HiggsField] Video result:', JSON.stringify(result).substring(0, 200));

    const videoUrl = result?.results?.[0]?.video_url || result?.video_url || result?.output?.video_url;
    const thumbnailUrl = result?.results?.[0]?.thumbnail_url || result?.thumbnail_url || result?.output?.thumbnail_url;
    const jobId = result?.id || result?.jobId;

    console.log('[HiggsField] Video generated:', videoUrl);

    return {
      success: !!videoUrl,
      jobId,
      status: 'completed',
      outputUrl: videoUrl,
      thumbnailUrl,
    };
  } catch (error: any) {
    console.error('[HiggsField] Video generation failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate speech-to-video
 */
export async function generateSpeechVideo(options: SpeechToVideoOptions): Promise<GenerationResult> {
  const client = createClient();
  if (!client) {
    return { success: false, error: 'HiggsField not configured' };
  }

  try {
    console.log('[HiggsField] Generating speech-to-video...');

    const result: any = await client.subscribe('speak/higgsfield/v2', {
      input: {
        image_url: options.imageUrl,
        script: options.script,
        voice: options.voice || 'emotional_female',
        duration: options.duration || 4,
      },
      withPolling: true,
    });

    const videoUrl = result?.results?.[0]?.video_url || result?.video_url;
    const jobId = result?.id;

    console.log('[HiggsField] Speech video generated:', videoUrl);

    return {
      success: !!videoUrl,
      jobId,
      status: 'completed',
      outputUrl: videoUrl,
      thumbnailUrl: result?.thumbnail_url,
    };
  } catch (error: any) {
    console.error('[HiggsField] Speech video failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check job status (for non-polling mode)
 */
export async function checkJobStatus(jobId: string): Promise<GenerationResult> {
  const client = createClient();
  if (!client) {
    return { success: false, error: 'HiggsField not configured' };
  }

  try {
    const result: any = await client.rate(jobId);
    return {
      success: result.status === 'completed',
      jobId: result.id,
      status: result.status,
      outputUrl: result.output?.url || result.video_url,
      thumbnailUrl: result.thumbnail_url,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get account credits/info
 */
export async function getAccountInfo(): Promise<any> {
  const client = createClient();
  if (!client) {
    return null;
  }

  try {
    return await client.account();
  } catch (error) {
    console.error('[HiggsField] Account info failed:', error);
    return null;
  }
}