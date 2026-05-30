// ============================================
// AI Content Generator - Full Pack
// Generates: hooks, captions, CTAs, angles
// ============================================

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.koboillm.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';

const openai = new OpenAI({
  apiKey: AI_API_KEY || 'dummy',
  baseURL: AI_BASE_URL,
});

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
 * Generate full content pack with variations
 */
export async function generateContentPack(options: GenerateOptions): Promise<FullContentPack> {
  // If no real API key, return placeholder variations
  if (!AI_API_KEY || AI_API_KEY === 'dummy_key') {
    return generatePlaceholder(options);
  }

  try {
    const prompt = buildPrompt(options);

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Kamu expert content creator affiliate marketing Indonesia. Bahasa gaul, engaging, persuasif. Response JSON valid.`,
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
    if (!content) throw new Error('No content generated');

    const parsed = JSON.parse(content);

    return {
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 20) : [parsed.hook || ''].slice(0, 20),
      captions: Array.isArray(parsed.captions) ? parsed.captions.slice(0, 10) : [parsed.caption || ''].slice(0, 10),
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas.slice(0, 5) : [parsed.cta || ''].slice(0, 5),
      scripts: Array.isArray(parsed.scripts) ? parsed.scripts.slice(0, 3) : [parsed.script || ''].slice(0, 3),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 20) : [],
      angles: Array.isArray(parsed.angles) ? parsed.angles.slice(0, 3) : [parsed.angle || 'Produk berkualitas'].slice(0, 3),
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
 * Build prompt for full generation
 */
function buildPrompt(options: GenerateOptions): string {
  const { productName, productDescription, productPrice, productCategory } = options;

  return `Buatkan konten affiliate marketing lengkap untuk:

PRODUK: ${productName}
${productDescription ? `DESKRIPSI: ${productDescription}` : ''}
HARGA: Rp ${(productPrice || 0).toLocaleString('id-ID')}
${productCategory ? `KATEGORI: ${productCategory}` : ''}

GENERATE DALAM FORMAT JSON:

{
  "hooks": [
    // 20 variasi HOOK TikTok/Reels (1-2 kalimat, pattern berbeda-beda: fakta, pertanyaan, angka, emotion, sebelum/sesudah, dll)
  ],
  "captions": [
    // 10 variasi caption (story-driven, berbeda angle)
  ],
  "ctas": [
    // 5 CTA berbeda (urgency, benefit, social proof, pertanyaan, scarcity)
  ],
  "scripts": [
    // 3 script video berbeda (masukkin di deskripsi produk)
  ],
  "hashtags": [
    // 20 hashtags (mix: high volume, niche, trending)
  ],
  "angles": [
    // 3 marketing angles berbeda
  ],
  "telegramText": "Promo message format (bullet points, emoji, 200-400 karakter)",
  "whatsappText": "Personal message (100-200 karakter)"
}`;
}

/**
 * Generate placeholder variations
 */
function generatePlaceholder(options: GenerateOptions): FullContentPack {
  const { productName, productDescription, productPrice } = options;

  const hooks = [
    `Coba cek ini! ${productName} - trending banget!`,
    `Jangan sampai kehabisan! Stok tinggal dikit!`,
    `Ini yang lagi viral! ${productName}`,
    `Wajib punya! ${productName} quality premium!`,
    `Price gila-gilaan! ${productName} lagi promo!`,
    `Yang lagi rame! ${productName} recommended!`,
    `Quality check! ${productName} - worth every penny!`,
    `Tau gak sih ${productName} ini? Lagi promo besar!`,
    `REKOMENDASI TERBARU! ${productName} - harga bersahabat!`,
    `HOT DEAL! ${productName} diskon gede-gedean!`,
    `Gak percaya quality? Liat review produk ini!`,
    `BORONG sebelum nyesel kehabisan!`,
    `${productName} - produk paling laris minggu ini!`,
    `COBA PRODUK INI! ${productName} beda dari yang lain!`,
    `UDAH NAMBAH BELUM? ${productName} lagi hits!`,
    `JANGAN SAMPAI MISS! ${productName} promo terbatas!`,
    `LEBIH DULU DARI TEMAN! ${productName} worth it!`,
    `INI BARANG YANG HARUS PUNYA! ${productName} TOP!`,
    `SAATNYA UPGRADE! ${productName} - quality checked!`,
    `BUAT YANG LAIN, PUNYA ${productName.toUpperCase()}!`,
  ];

  const captions = [
    `✨ ${productName} ✨\n\n${productDescription || 'Produk pilihan terbaik!'}\n\n💰 Harga: Rp ${(productPrice || 0).toLocaleString('id-ID')}\n\n📍 Klik link di bio untuk order!`,
    `${productName}\n\n${productDescription || 'Kualitas premium, harga bersahabat'}\n\n⭐ Best seller!\n\n📦 Cashback available\n📍 DM untuk order!`,
    `REKOMENDASI BARU!\n\n📦 ${productName}\n\n${productDescription || 'Produk berkualitas'}\n\n💰 Promo terbatas!\n📍 Stok tinggal sedikit!`,
    `JANGAN LUPA!\n\n🏷️ ${productName}\n🏷️ ${productDescription || 'Produk pilihan'}\n\n💰 ${(productPrice || 0).toLocaleString('id-ID')}\n📍 Chat untuk tanya-stok!`,
    `LIHAT INI!\n\n${productName}\n\n${productDescription || 'Quality premium'}\n\n💰 Best price! 📍 Order now!`,
    `${productName}\n\n💡 ${productDescription || 'Produk pilihan'}\n\n📦 ${(productPrice || 0).toLocaleString('id-ID')}\n📍 Ready stock!`,
    `PRODUK RECOMMENDED!\n\n🏷️ ${productName}\n\n✨ ${productDescription || 'Best quality'}\n\n💰 Jangan miss promo ini!\n📍 Chat kami!`,
    `YANG INI BARU RELEASE!\n\n📦 ${productName}\n\n💰 ${(productPrice || 0).toLocaleString('id-ID')}\n${productDescription || ''}\n📍 Order sekarang!`,
    `${productName}\n\nBest seller bulan ini!\n\n💰 Rp ${(productPrice || 0).toLocaleString('id-ID')}\n📦 ${productDescription || 'Premium quality'}\n📍 Stok limited!`,
    `QUALITY CHECK!\n\n🏷️ ${productName}\n\n${productDescription || 'Produk bagus'}\n💰 ${(productPrice || 0).toLocaleString('id-ID')}\n📍 Ready!`,
  ];

  const ctas = [
    'Klik link di bio sebelum kehabisan! 🔥',
    'Chat WA untuk order sekarang! Stok terbatas! ⚡',
    'Jangan tunda, promo bisa selesai kapan aja! ⏰',
    'Add ke keranjang sebelum lupa! 🛒',
    'DM/SMS/WA sekarang untuk info lebih lanjut! 📲',
  ];

  const hashtags = [
    `#${productName.replace(/\s+/g, '')}`,
    '#affiliate',
    '#rekomendasi',
    '#viral',
    '#trending',
    '#shopping',
    '#belanjaonline',
    '#produkbagus',
    '#murahmeriah',
    '#wajibbeli',
    '#diskon',
    '#promo',
    '#onlineshop',
    '#shopeeindonesia',
    '#tiktokmakeup',
    '#viral2024',
    '#reksadana',
    '#fyp',
    '#fyppage',
    '#explore',
  ];

  return {
    hooks,
    captions,
    ctas,
    scripts: [`Script utama untuk ${productName}`],
    hashtags,
    angles: ['Price sensitivity', 'Quality focus', 'Urgency/Scarcity'],
    platform: 'ALL',
    telegramText: `PROMO ${productName.toUpperCase()}!\n\n💰 Rp ${(productPrice || 0).toLocaleString('id-ID')}\n\n📦 ${productDescription || 'Best quality'}\n\n📍 Order sekarang!`,
    whatsappText: `Hai! Lihat produk ini 👇\n\n${productName}\nRp ${(productPrice || 0).toLocaleString('id-ID')}\n\n${productDescription || 'Klik untuk info lengkap'}`,
  };
}

/**
 * Legacy compatibility
 */
export async function generateLegacy(options: GenerateOptions): Promise<any> {
  const pack = await generateContentPack(options);
  return {
    hook: pack.hooks[0] || '',
    script: pack.scripts[0] || '',
    caption: pack.captions[0] || '',
    hashtags: pack.hashtags,
    cta: pack.ctas[0] || '',
    telegramText: pack.telegramText,
    whatsappText: pack.whatsappText,
  };
}

export function isAIConfigured(): boolean {
  return !!AI_API_KEY && AI_API_KEY !== 'dummy_key' && AI_API_KEY !== 'dummy_token';
}
