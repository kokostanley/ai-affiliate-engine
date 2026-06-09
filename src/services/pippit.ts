// ============================================
// PIPPIT PROVIDER SERVICE
// Video generation via Pippit AI
// ============================================

import dotenv from 'dotenv';

dotenv.config();

const PIPPIT_API_KEY = process.env.PIPPIT_API_KEY;
const PIPPIT_API_URL = process.env.PIPPIT_API_URL || 'https://api.pippit.ai/v1';

export interface PippitConfig {
  apiKey: string;
  baseUrl: string;
}

export interface PippitVideoOptions {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  duration?: 30 | 60;
  style?: string;
  seed?: number;
}

export interface PippitGenerationResult {
  success: boolean;
  jobId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Check if Pippit is configured
 */
export function isPippitConfigured(): boolean {
  return !!(PIPPIT_API_KEY && PIPPIT_API_KEY.length > 10);
}

/**
 * Test Pippit API connection
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!isPippitConfigured()) {
    return { success: false, message: 'Pippit not configured. Add PIPPIT_API_KEY to .env' };
  }

  try {
    // Test with account/credits check
    const response = await fetch(`${PIPPIT_API_URL}/account`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PIPPIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { success: true, message: 'Pippit API connected' };
    }

    return { success: false, message: `API returned ${response.status}` };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

/**
 * Generate video via Pippit
 */
export async function generateVideo(options: PippitVideoOptions): Promise<PippitGenerationResult> {
  if (!isPippitConfigured()) {
    return { success: false, error: 'Pippit not configured' };
  }

  try {
    console.log('[Pippit] Generating video...');
    console.log('[Pippit] Prompt:', options.prompt.substring(0, 100) + '...');

    const response = await fetch(`${PIPPIT_API_URL}/video/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PIPPIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: options.prompt,
        aspect_ratio: options.aspectRatio || '9:16',
        duration: options.duration || 30,
        style: options.style || 'default',
        seed: options.seed,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Pippit] API error:', error);
      return { success: false, error: `API error: ${response.status}` };
    }

    const result: any = await response.json();
    console.log('[Pippit] Result:', JSON.stringify(result).substring(0, 200));

    const jobId = result.job_id || result.id;
    const status = result.status || 'queued';

    // If completed immediately, return output
    if (status === 'completed') {
      return {
        success: true,
        jobId,
        status: 'completed',
        outputUrl: result.output_url || result.video_url,
        thumbnailUrl: result.thumbnail_url,
      };
    }

    // Return job ID for polling
    return {
      success: true,
      jobId,
      status: status as any,
    };
  } catch (error: any) {
    console.error('[Pippit] Generation failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check job status
 */
export async function checkJobStatus(jobId: string): Promise<PippitGenerationResult> {
  if (!isPippitConfigured()) {
    return { success: false, error: 'Pippit not configured' };
  }

  try {
    const response = await fetch(`${PIPPIT_API_URL}/video/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PIPPIT_API_KEY}`,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Status check failed: ${response.status}` };
    }

    const result: any = await response.json();

    return {
      success: result.status === 'completed',
      jobId: result.job_id || result.id,
      status: result.status,
      outputUrl: result.output_url || result.video_url,
      thumbnailUrl: result.thumbnail_url,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Poll for job completion (with timeout)
 */
export async function pollForCompletion(
  jobId: string,
  options?: { maxWait?: number; interval?: number }
): Promise<PippitGenerationResult> {
  const maxWait = options?.maxWait || 300000; // 5 minutes default
  const interval = options?.interval || 5000; // 5 seconds default
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await checkJobStatus(jobId);

    if (!status.success) {
      return status;
    }

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      return { success: false, error: 'Job failed' };
    }

    console.log(`[Pippit] Waiting for job ${jobId}... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return { success: false, error: 'Timeout waiting for completion' };
}

/**
 * Generate and wait for completion
 */
export async function generateVideoWithPolling(
  options: PippitVideoOptions
): Promise<PippitGenerationResult> {
  const result = await generateVideo(options);

  if (result.success && result.jobId && result.status !== 'completed') {
    console.log('[Pippit] Polling for completion...');
    return pollForCompletion(result.jobId);
  }

  return result;
}