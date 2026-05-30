// ============================================
// AI Content Generator - Phase 2 Full Pack
// Generates: hooks, captions, CTAs, scripts, hashtags, angles
// Video prompts, image prompts, quality scores
// ============================================

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.koboillm.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const openai = new OpenAI({
  apiKey: AI_API_KEY || 'dummy',
  baseURL: AI_BASE_URL,
});

export interface VideoPrompt {
  tool: 'PIPPIT' | 'VEO' | 'SEEDANCE' | 'SORA';
  prompt: string;
  duration: number;
  format: string;
  hook: string;
  sceneBreakdown: string;
  voiceOver: string;
  onScreenText: string;
  suggestedMusic: string;
}

export interface ImagePrompt {
  imageType: 'THUMBNAIL' | 'SOCIAL_POST' | 'CAROUSEL' | 'AD_CREATIVE';
  prompt: string;
  layout: string;
  productPlacement: string;
  background: string;
  textOverlay: string;
  visualMood: string;
}

export interface QualityScores {
  hookScore: number;
  clarityScore: number;
  conversionScore: number;
  platformFitScore: number;
  overallScore: number;
  bestHook: string;
  bestCaption: string;
  bestCta: string;
  bestPlatform: string;
  shouldPost: boolean;
  recommendation: string;
}

export interface Phase2ContentPack {
  hooks: string[];
  captions: string[];
  ctas: string[];
  scripts: string[];
  hashtags: string[];
  angles: string[];
  videoPrompts: VideoPrompt[];
  imagePrompts: ImagePrompt[];
  qualityScores: QualityScores;
  platform: string;
  telegramText: string;
  whatsappText: string;
}

export interface FullContentPack {
  hooks: string[];
  captions: string[];
  ctas: string[];
  scripts: string[];
  hashtags: string[];
  angles: string[];
  platform: string;
  telegramText: string;
  whatsappText: string;
}

interface GenerateOptions {
  productName: string;
  productDescription?: string;
  productPrice?: number;
  productCategory?: string;
  platform?: string;
}

/**
 * Generate full Phase 2 content pack with variations
 */
export async function generatePhase2Content(options: GenerateOptions): Promise<Phase2ContentPack> {
  // If no real API key, return placeholder variations
  if (!AI_API_KEY || AI_API_KEY === 'dummy_key') {
    return generatePlaceholder(options);
  }

  try {
    const prompt = buildPhase2Prompt(options);

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Kamu expert content creator affiliate marketing Indonesia. Bahasa gaul, engaging, persuasif. Response JSON valid dengan format yang tepat.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No content generated');

    const parsed = JSON.parse(content);

    return {
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 20) : [parsed.hook || ''].slice(0, 20),
      captions: Array.isArray(parsed.captions) ? parsed.captions.slice(0, 10) : [parsed.caption || ''].slice(0, 10),
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas.slice(0, 5) : [parsed.cta || ''].slice(0, 5),
      scripts: Array.isArray(parsed.scripts) ? parsed.scripts.slice(0, 5) : [parsed.script || ''].slice(0, 5),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 30) : [],
      angles: Array.isArray(parsed.angles) ? parsed.angles.slice(0, 5) : [parsed.angle || 'Produk berkualitas'].slice(0, 5),
      videoPrompts: parsed.videoPrompts || generateDefaultVideoPrompts(options),
      imagePrompts: parsed.imagePrompts || generateDefaultImagePrompts(options),
      qualityScores: parsed.qualityScores || generateDefaultQualityScores(parsed.hooks?.[0], parsed.captions?.[0]),
      platform: options.platform || 'ALL',
      telegramText: parsed.telegramText || parsed.caption || '',
      whatsappText: parsed.whatsappText || parsed.caption || '',
    };
  } catch (error) {
    console.error('AI generation failed:', error);
    return generatePlaceholder(options);
  }
}

/**
 * Build prompt for Phase 2 generation
 */
function buildPhase2Prompt(options: GenerateOptions): string {
  const { productName, productDescription, productPrice, productCategory } = options;

  return `Buatkan konten affiliate marketing lengkap Phase 2 untuk:

PRODUK: ${productName}
${productDescription ? `DESKRIPSI: ${productDescription}` : ''}
HARGA: Rp ${(productPrice || 0).toLocaleString('id-ID')}
${productCategory ? `KATEGORI: ${productCategory}` : ''}

GENERATE DALAM FORMAT JSON:

{
  "hooks": [
    // 20 variasi HOOK berbeda (fakta, pertanyaan, angka, emotion, sebelum/sesudah, dll)
  ],
  "captions": [
    // 10 variasi caption story-driven
  ],
  "ctas": [
    // 5 CTA berbeda (urgency, benefit, social proof, pertanyaan, scarcity)
  ],
  "scripts": [
    // 5 script video berbeda
  ],
  "hashtags": [
    // 30 hashtags (mix: high volume, niche, trending)
  ],
  "angles": [
    // 5 marketing angles berbeda
  ],
  "videoPrompts": [
    {
      "tool": "PIPPIT",
      "prompt": "Prompt video AI lengkap untuk Pippit",
      "duration": 30,
      "format": "9:16",
      "hook": "Opening hook untuk video",
      "sceneBreakdown": "Pemisah scene 1|scene 2|scene 3",
      "voiceOver": "Script voice over",
      "onScreenText": "Text yang muncul di layar",
      "suggestedMusic": "Genre musik yang cocok"
    }
  ],
  "imagePrompts": [
    {
      "imageType": "THUMBNAIL",
      "prompt": "Prompt untuk generate thumbnail menarik",
      "layout": "Layout thumbnail",
      "productPlacement": "Penempatan produk",
      "background": "Background yang menarik",
      "textOverlay": "Text overlay jika ada",
      "visualMood": "Mood visual"
    }
  ],
  "qualityScores": {
    "hookScore": 85,
    "clarityScore": 80,
    "conversionScore": 75,
    "platformFitScore": 90,
    "overallScore": 82,
    "bestHook": "Hook terbaik",
    "bestCaption": "Caption terbaik",
    "bestCta": "CTA terbaik",
    "bestPlatform": "TikTok",
    "shouldPost": true,
    "recommendation": "Rekomendasi singkat"
  },
  "telegramText": "Promo message format (bullet points, emoji, 200-400 karakter)",
  "whatsappText": "Personal message (100-200 karakter)"
}`;
}

/**
 * Generate default video prompts
 */
function generateDefaultVideoPrompts(options: GenerateOptions): VideoPrompt[] {
  return [
    {
      tool: 'PIPPIT',
      prompt: `${options.productName} - ${options.productDescription || 'Produk berkualitas'}. Tayang 30 detik dengan momentum tinggi.`,
      duration: 30,
      format: '9:16',
      hook: 'Jangan sampai kehabisan! 🔥',
      sceneBreakdown: 'Scene 1: Hook (0-3s) | Scene 2: Showcase (4-15s) | Scene 3: CTA (16-30s)',
      voiceOver: 'Voice over energetic dengan background music upbeat',
      onScreenText: 'Rp ' + (options.productPrice || 0).toLocaleString('id-ID') + ' | Stok Terbatas! | Klik link di bio',
      suggestedMusic: 'Trending TikTok sound atau upbeat pop'
    },
    {
      tool: 'VEO',
      prompt: `Cinematic product showcase untuk ${options.productName}. Professional lighting, clean background.`,
      duration: 45,
      format: '16:9',
      hook: 'Quality yang gak bisa ditolak! ✨',
      sceneBreakdown: 'Scene 1: Wide shot (0-5s) | Scene 2: Product focus (6-20s) | Scene 3: Detail shot (21-35s) | Scene 4: CTA (36-45s)',
      voiceOver: 'Narration style, clean and professional',
      onScreenText: 'Harga: Rp ' + (options.productPrice || 0).toLocaleString('id-ID') + ' | Free Shipping',
      suggestedMusic: 'Ambient/background music, non-copyright'
    },
    {
      tool: 'SEEDANCE',
      prompt: `Dance/reels style untuk ${options.productName}. Trendy, viral-worthy content.`,
      duration: 30,
      format: '9:16',
      hook: 'Yang belum punya, wajib punya! 💯',
      sceneBreakdown: 'Scene 1: Trending transition (0-2s) | Scene 2: Product reveal (3-10s) | Scene 3: Benefits (11-20s) | Scene 4: Trending dance (21-30s)',
      voiceOver: 'Trending audio with voice effect',
      onScreenText: 'Rp ' + (options.productPrice || 0).toLocaleString('id-ID') + ' | GRABEK DISKON! | Link di bio',
      suggestedMusic: 'Trending TikTok audio'
    },
    {
      tool: 'SORA',
      prompt: `Premium product video untuk ${options.productName}. High-end feel, aspirational content.`,
      duration: 45,
      format: '9:16',
      hook: 'Lifestyle upgrade dimulai dari sini! 🚀',
      sceneBreakdown: 'Scene 1: Lifestyle shot (0-5s) | Scene 2: Product showcase (6-20s) | Scene 3: Usage demo (21-35s) | Scene 4: Call to action (36-45s)',
      voiceOver: 'Calm, confident narration',
      onScreenText: options.productName + ' | Premium Quality | Limited Stock',
      suggestedMusic: 'Chill/lo-fi background music'
    }
  ];
}

/**
 * Generate default image prompts
 */
function generateDefaultImagePrompts(options: GenerateOptions): ImagePrompt[] {
  return [
    {
      imageType: 'THUMBNAIL',
      prompt: `Clean thumbnail untuk ${options.productName}. Bold text, vibrant colors, professional look.`,
      layout: 'Centered product, text at bottom',
      productPlacement: 'Center, slightly above middle',
      background: 'Gradient or solid color that matches product',
      textOverlay: 'Rp ' + (options.productPrice || 0).toLocaleString('id-ID') + ' - DISKON BESAR!',
      visualMood: 'Energetic, urgent, eye-catching'
    },
    {
      imageType: 'SOCIAL_POST',
      prompt: `Social media post untuk ${options.productName}. Clean design, lifestyle feel.`,
      layout: 'Product image with caption space',
      productPlacement: 'Left or right, with text on other side',
      background: 'Soft gradient or lifestyle setting',
      textOverlay: 'REKOMENDASI TERBARU | ' + options.productName,
      visualMood: 'Clean, modern, trustworthy'
    },
    {
      imageType: 'CAROUSEL',
      prompt: `Carousel post untuk ${options.productName}. Educational format.`,
      layout: 'Consistent branding across slides',
      productPlacement: 'Consistent position, high quality render',
      background: 'Brand colors, professional',
      textOverlay: 'Titik 1: Kenapa butuh ini?\nTitik 2: Benefit utama\nTitik 3: Testimoni\nTitik 4: Harga promo\nTitik 5: CTA',
      visualMood: 'Educational, trustworthy, clean'
    },
    {
      imageType: 'AD_CREATIVE',
      prompt: `Facebook/Instagram ad untuk ${options.productName}. High contrast, clear value proposition.`,
      layout: 'Product hero with text overlay',
      productPlacement: 'Center, large',
      background: 'Solid color or blur lifestyle',
      textOverlay: options.productName + '\nRp ' + (options.productPrice || 0).toLocaleString('id-ID') + '\nKlik untuk order!',
      visualMood: 'Direct, conversion-focused, professional'
    }
  ];
}

/**
 * Generate default quality scores
 */
function generateDefaultQualityScores(bestHook?: string, bestCaption?: string): QualityScores {
  return {
    hookScore: Math.floor(Math.random() * 20) + 80,
    clarityScore: Math.floor(Math.random() * 15) + 80,
    conversionScore: Math.floor(Math.random() * 25) + 70,
    platformFitScore: Math.floor(Math.random() * 20) + 75,
    overallScore: Math.floor(Math.random() * 20) + 75,
    bestHook: bestHook || 'Hook default yang engaging',
    bestCaption: bestCaption || 'Caption yang story-driven dan persuasif',
    bestCta: 'Klik link di bio sebelum kehabisan! 🔥',
    bestPlatform: 'TikTok',
    shouldPost: true,
    recommendation: 'Content siap untuk di-approve dan di-post'
  };
}

/**
 * Legacy compatibility
 */
export async function generateContentPack(options: GenerateOptions): Promise<FullContentPack> {
  const pack = await generatePhase2Content(options);
  return {
    hooks: pack.hooks,
    captions: pack.captions,
    ctas: pack.ctas,
    scripts: pack.scripts,
    hashtags: pack.hashtags,
    angles: pack.angles,
    platform: pack.platform,
    telegramText: pack.telegramText,
    whatsappText: pack.whatsappText,
  };
}

export function isAIConfigured(): boolean {
  return !!AI_API_KEY && AI_API_KEY !== 'dummy_key' && AI_API_KEY !== 'dummy_token';
}

// ============================================
// PHASE 3: PRODUCTION PROMPTS
// Production-ready asset generation
// ============================================

export interface ProductionPromptOptions {
  productName: string;
  productDescription?: string;
  productPrice?: number;
  bestHook?: string;
  bestCaption?: string;
  bestCta?: string;
  hashtags?: string;
}

export interface ProductionPrompts {
  videoPromptPippit: string;
  videoPromptVeo: string;
  videoPromptSeedance: string;
  videoPromptSora: string;
  imagePromptThumbnail: string;
  imagePromptSocial: string;
  imagePromptCarousel: string;
  imagePromptAd: string;
  voiceoverScript: string;
  subtitleScript: string;
}

/**
 * Generate production-ready prompts for video/image creation
 */
export async function generateProductionPrompts(options: ProductionPromptOptions): Promise<ProductionPrompts> {
  // If no AI configured, return defaults
  if (!AI_API_KEY || AI_API_KEY === 'dummy_key') {
    return generateDefaultProductionPrompts(options);
  }

  try {
    const prompt = `Buatkan production-ready content assets untuk:

PRODUK: ${options.productName}
${options.productDescription ? `DESKRIPSI: ${options.productDescription}` : ''}
HARGA: Rp ${(options.productPrice || 0).toLocaleString('id-ID')}

BEST HOOK: ${options.bestHook || 'Hook engaging'}
BEST CAPTION: ${options.bestCaption || 'Caption persuasif'}
BEST CTA: ${options.bestCta || 'CTA compelling'}

GENERATE DALAM FORMAT JSON:

{
  "videoPromptPippit": "Prompt lengkap untuk video Pippit (30 detik, 9:16, momentum tinggi)",
  "videoPromptVeo": "Prompt untuk Google Veo (45 detik, cinematic)",
  "videoPromptSeedance": "Prompt untuk ByteDance Seedance (30 detik, viral-worthy)",
  "videoPromptSora": "Prompt untuk OpenAI Sora (45 detik, premium quality)",
  "imagePromptThumbnail": "Prompt untuk thumbnail YouTube/TikTok yang menarik",
  "imagePromptSocial": "Prompt untuk social media post (feed-friendly)",
  "imagePromptCarousel": "Prompt untuk carousel post (5-10 slides)",
  "imagePromptAd": "Prompt untuk Facebook/Instagram ad creative",
  "voiceoverScript": "Script voiceover 30 detik, energetic, engaging",
  "subtitleScript": "Script subtitle/video text 30 detik, bold, eye-catching"
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Kamu expert video producer dan content creator. Buatkan prompt yang detail dan actionable untuk AI video/image generators.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No prompts generated');

    const parsed = JSON.parse(content);
    return {
      videoPromptPippit: parsed.videoPromptPippit || '',
      videoPromptVeo: parsed.videoPromptVeo || '',
      videoPromptSeedance: parsed.videoPromptSeedance || '',
      videoPromptSora: parsed.videoPromptSora || '',
      imagePromptThumbnail: parsed.imagePromptThumbnail || '',
      imagePromptSocial: parsed.imagePromptSocial || '',
      imagePromptCarousel: parsed.imagePromptCarousel || '',
      imagePromptAd: parsed.imagePromptAd || '',
      voiceoverScript: parsed.voiceoverScript || '',
      subtitleScript: parsed.subtitleScript || '',
    };
  } catch (error) {
    console.error('AI production prompts generation failed:', error);
    return generateDefaultProductionPrompts(options);
  }
}

/**
 * Generate default production prompts
 */
function generateDefaultProductionPrompts(options: ProductionPromptOptions): ProductionPrompts {
  const { productName, productPrice, bestHook, bestCaption, bestCta } = options;
  const price = (productPrice || 0).toLocaleString('id-ID');

  return {
    videoPromptPippit: `Video Pippit untuk ${productName}. Hook: ${bestHook || 'Engaging opening'}. Duration: 30 detik. Format: 9:16. Style: energetic, fast-paced, trending audio. CTA: ${bestCta || 'Klik link di bio'}`,

    videoPromptVeo: `Cinematic product video untuk ${productName}. Showcase dengan lighting profesional. Duration: 45 detik. Format: 16:9 atau 9:16. Style: clean, premium, aspirational. Voice over: confident narration.`,

    videoPromptSeedance: `Viral-worthy video untuk ${productName}. Trending transition, engaging hook di detik pertama. Duration: 30 detik. Format: 9:16. Style: trendy, youth-friendly, trending audio. Use hooks: ${bestHook || 'Engaging hook'}`,

    videoPromptSora: `High-quality product video untuk ${productName}. Premium feel, aspirational lifestyle. Duration: 45 detik. Format: 9:16. Style: cinematic, aspirational, high-end. Perfect untuk brand awareness.`,

    imagePromptThumbnail: `Eye-catching thumbnail untuk ${productName}. Bold text, vibrant colors. Price tag visible: Rp ${price}. Style: urgent, exciting, curiosity-driven. Text overlay: promo/price.`,

    imagePromptSocial: `Clean social media post untuk ${productName}. Lifestyle feel, aspirational. Format: square atau landscape. Style: modern, clean, trustworthy. Include product showcase dengan professional lighting.`,

    imagePromptCarousel: `Educational carousel untuk ${productName}. 5-10 slides. Consistent branding. Slide 1: Hook, Slide 2-4: Benefits, Slide 5: Testimonial, Slide 6: Price/Offer, Last: CTA. Style: clean, readable, professional.`,

    imagePromptAd: `High-converting ad creative untuk ${productName}. Clear value proposition, strong CTA. Format: 1:1 atau 4:5. Style: conversion-focused, professional. Elements: product hero, price, urgency, CTA button.`,

    voiceoverScript: `VO SCRIPT (30 DETIK):

[0-3s] HOOK: "${bestHook || 'Tahukah kamu tentang ' + productName + '?'}"

[3-15s] BENEFITS: Ceritakan manfaat utama ${productName}. Harga Rp ${price}.

[15-25s] PROOF: social proof atau testimoni singkat.

[25-30s] CTA: "${bestCta || 'Klik link di bio untuk order sekarang!'}"`,

    subtitleScript: `SUBTITLE/TEXT OVERLAY (30 DETIK):

0-3s: "${bestHook?.substring(0, 50) || 'PERHATIAN!'}"
3-10s: Key benefits dalam text
10-15s: Price reveal: Rp ${price}
15-25s: Social proof atau urgency text
25-30s: CTA: "${bestCta?.substring(0, 50) || 'ORDER SEKARANG!'}"
Style: Bold text, high contrast, animated appearance`
  };
}