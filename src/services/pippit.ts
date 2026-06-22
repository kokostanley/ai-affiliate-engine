// ====================================
// PIPPIT PROVIDER SERVICE
// Video generation via Pippit AI (Nest Agent API)
// ====================================

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PIPPIT_API_KEY = process.env.PIPPIT_API_KEY || process.env.PIPPIT_ACCESS_KEY;
// Correct API endpoint: https://www.pippit.ai/api/biz/v1/skill/
const PIPPIT_API_BASE = 'https://www.pippit.ai';
const PIPPIT_API_PATH = '/api/biz/v1/skill';

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
  threadId?: string;
  runId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  webThreadLink?: string;
}

export interface PippitThreadResult {
  success: boolean;
  threadId?: string;
  runId?: string;
  state?: number;
  completedAt?: string;
  failReason?: string;
  outputUrls?: string[];
  error?: string;
  webThreadLink?: string;
}

/**
 * Check if Pippit is configured
 */
export function isPippitConfigured(): boolean {
  return !!(PIPPIT_API_KEY && PIPPIT_API_KEY.length > 10);
}

/**
 * Test Pippit API connection by submitting a test run
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!isPippitConfigured()) {
    return { success: false, message: 'Pippit not configured. Add PIPPIT_ACCESS_KEY to .env' };
  }

  try {
    // Submit a simple test run
    const result = await submitRun('Ping test - respond with "Pippit connected"');
    if (result.success) {
      return { success: true, message: 'Pippit API connected. Thread: ' + result.threadId };
    }
    return { success: false, message: result.error || 'Connection failed' };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

/**
 * Submit a creative run to Pippit Nest
 */
async function submitRun(
  message: string,
  threadId?: string,
  assetIds?: string[]
): Promise<{ success: boolean; threadId?: string; runId?: string; webThreadLink?: string; error?: string }> {
  try {
    console.log('[Pippit] Submitting run...');
    console.log('[Pippit] Message:', message.substring(0, 100) + '...');

    const body: any = {
      message: message,
      thread_id: threadId || '',
      asset_ids: assetIds || null,
    };

    const response = await fetch(`${PIPPIT_API_BASE}${PIPPIT_API_PATH}/submit_run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PIPPIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Pippit] Submit error:', error);
      return { success: false, error: `API error ${response.status}` };
    }

    const data: any = await response.json();

    if (data.ret != 0) {  // Use != instead of !== to match string "0"
      return { success: false, error: data.errmsg || 'API returned error' };
    }

    const runData = data.data?.run || {};
    const newThreadId = runData.thread_id || threadId;
    const newRunId = runData.run_id;

    console.log('[Pippit] Run submitted successfully');
    console.log('[Pippit] Thread ID:', newThreadId);
    console.log('[Pippit] Run ID:', newRunId);

    return {
      success: true,
      threadId: newThreadId,
      runId: newRunId,
      webThreadLink: data.data?.web_thread_link,
    };
  } catch (error: any) {
    console.error('[Pippit] Submit failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get thread status and results
 */
async function getThread(
  threadId: string,
  runId: string,
  afterSeq?: number
): Promise<PippitThreadResult> {
  try {
    const params = new URLSearchParams({
      thread_id: threadId,
      run_id: runId,
    });
    if (afterSeq !== undefined) {
      params.set('after_seq', afterSeq.toString());
    }

    const response = await fetch(`${PIPPIT_API_BASE}${PIPPIT_API_PATH}/get_thread?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PIPPIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `API error ${response.status}` };
    }

    const data: any = await response.json();

    if (data.ret != 0) {  // Use != instead of !== to match string "0"
      return { success: false, error: data.errmsg || 'API returned error' };
    }

    const runData = data.data?.run || {};
    const state = runData.state;

    // State: 1 = running, 2 = completed, 3 = failed
    if (state === 2) {
      // Completed - extract artifact URLs
      const outputUrls: string[] = [];
      const entryList = runData.entry_list || [];

      for (const entry of entryList) {
        if (entry.artifact?.video_url) {
          outputUrls.push(entry.artifact.video_url);
        }
        if (entry.artifact?.images) {
          for (const img of entry.artifact.images) {
            if (img.url) outputUrls.push(img.url);
          }
        }
      }

      return {
        success: true,
        threadId,
        runId,
        state,
        completedAt: runData.completed_at,
        outputUrls,
        webThreadLink: data.data?.web_thread_link,
      };
    } else if (state === 3) {
      return {
        success: false,
        threadId,
        runId,
        state,
        failReason: runData.fail_reason,
      };
    }

    return {
      success: true,
      threadId,
      runId,
      state,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Download generated results
 */
async function downloadResults(
  urls: string[],
  outputDir: string,
  prefix: string = 'pippit'
): Promise<string[]> {
  const savedPaths: string[] = [];

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.includes('.mp4') ? 'mp4' : 'png';
    const fileName = `${prefix}_${i + 1}.${ext}`;
    const filePath = path.join(outputDir, fileName);

    try {
      console.log(`[Pippit] Downloading: ${url}`);
      const response = await fetch(url);

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        savedPaths.push(filePath);
        console.log(`[Pippit] Saved: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`[Pippit] Download failed: ${error.message}`);
    }
  }

  return savedPaths;
}

/**
 * Generate video via Pippit (high-level function)
 */
export async function generateVideo(options: PippitVideoOptions): Promise<PippitGenerationResult> {
  if (!isPippitConfigured()) {
    return { success: false, error: 'Pippit not configured' };
  }

  try {
    // Build the creative prompt
    const prompt = options.prompt;
    const aspectRatio = options.aspectRatio || '9:16';

    console.log('[Pippit] Starting video generation...');
    console.log('[Pippit] Prompt:', prompt.substring(0, 100) + '...');
    console.log('[Pippit] Aspect Ratio:', aspectRatio);

    // Submit the run
    const submitResult = await submitRun(prompt);

    if (!submitResult.success || !submitResult.threadId || !submitResult.runId) {
      return { success: false, error: submitResult.error };
    }

    console.log('[Pippit] Submitted successfully. Polling for completion...');

    // Poll for completion (max 10 minutes)
    const maxWait = 600000; // 10 minutes
    const interval = 10000; // 10 seconds
    const startTime = Date.now();
    let lastSeq = 0;

    while (Date.now() - startTime < maxWait) {
      const threadResult = await getThread(submitResult.threadId, submitResult.runId, lastSeq);

      if (!threadResult.success) {
        return { success: false, error: threadResult.error };
      }

      if (threadResult.state === 2) {
        // Completed
        const outputUrl = threadResult.outputUrls?.[0];

        console.log('[Pippit] Generation completed!');
        if (outputUrl) {
          console.log('[Pippit] Output URL:', outputUrl);
        }

        return {
          success: true,
          jobId: submitResult.runId,
          threadId: submitResult.threadId,
          runId: submitResult.runId,
          status: 'completed',
          outputUrl,
          thumbnailUrl: threadResult.outputUrls?.[1] || outputUrl,
          webThreadLink: threadResult.webThreadLink,
        };
      } else if (threadResult.state === 3) {
        // Failed
        return {
          success: false,
          status: 'failed',
          error: threadResult.failReason || 'Generation failed',
        };
      }

      // Still running - update lastSeq from response
      console.log(`[Pippit] Still processing... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return { success: false, error: 'Timeout waiting for generation' };
  } catch (error: any) {
    console.error('[Pippit] Generation failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate and wait for completion with polling
 */
export async function generateVideoWithPolling(
  options: PippitVideoOptions
): Promise<PippitGenerationResult> {
  return generateVideo(options);
}

/**
 * Check job status (for external polling)
 */
export async function checkJobStatus(jobId: string, threadId?: string): Promise<PippitGenerationResult> {
  if (!isPippitConfigured()) {
    return { success: false, error: 'Pippit not configured' };
  }

  if (!threadId) {
    return { success: false, error: 'Thread ID required for status check' };
  }

  const result = await getThread(threadId, jobId);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: result.state === 2,
    jobId,
    threadId: result.threadId,
    runId: result.runId,
    status: result.state === 2 ? 'completed' : result.state === 3 ? 'failed' : 'processing',
    outputUrl: result.outputUrls?.[0],
    error: result.failReason,
  };
}

/**
 * Poll for job completion (with timeout)
 */
export async function pollForCompletion(
  threadId: string,
  runId: string,
  options?: { maxWait?: number; interval?: number }
): Promise<PippitGenerationResult> {
  const maxWait = options?.maxWait || 600000;
  const interval = options?.interval || 10000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await checkJobStatus(runId, threadId);

    if (!status.success) {
      return status;
    }

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      return { success: false, error: status.error };
    }

    console.log(`[Pippit] Waiting for job ${runId}... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return { success: false, error: 'Timeout waiting for completion' };
}

/**
 * Download generated results to local directory
 */
export async function downloadVideoResults(
  threadId: string,
  runId: string,
  outputDir?: string
): Promise<{ success: boolean; paths?: string[]; error?: string }> {
  const result = await getThread(threadId, runId);

  if (!result.success || !result.outputUrls || result.outputUrls.length === 0) {
    return { success: false, error: result.failReason || 'No output URLs found' };
  }

  const output = outputDir || process.env.LOCAL_TEMP_DIR || './tmp';
  const paths = await downloadResults(result.outputUrls, output, `pippit_${runId}`);

  return { success: true, paths };
}
