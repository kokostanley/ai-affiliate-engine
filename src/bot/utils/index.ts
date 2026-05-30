// ============================================
// Utilities for Telegram Bot (Expanded)
// ============================================

export const PLATFORM_INFO: Record<string, { name: string; emoji: string; color: string }> = {
  TIKTOK: { name: 'TikTok', emoji: '🎵', color: '#00f2ea' },
  INSTAGRAM: { name: 'Instagram', emoji: '📸', color: '#e4405f' },
  FACEBOOK: { name: 'Facebook', emoji: '👥', color: '#1877f2' },
  YOUTUBE: { name: 'YouTube', emoji: '🎬', color: '#ff0000' },
  TELEGRAM: { name: 'Telegram', emoji: '✈️', color: '#0088cc' },
  WHATSAPP: { name: 'WhatsApp', emoji: '💬', color: '#25d366' },
  ALL: { name: 'All Platforms', emoji: '🌐', color: '#6b7280' },
};

export const CONTENT_TYPE_INFO: Record<string, { name: string; emoji: string; description: string }> = {
  TIKTOK_HOOK: { name: 'TikTok Hook', emoji: '🎣', description: 'Opening hook' },
  TIKTOK_SCRIPT: { name: 'TikTok Script', emoji: '📝', description: 'Full script' },
  REELS_SCRIPT: { name: 'Reels Script', emoji: '🎞️', description: 'Instagram Reels' },
  SHORTS_SCRIPT: { name: 'Shorts Script', emoji: '▶️', description: 'YouTube Shorts' },
  CAPTION: { name: 'Caption', emoji: '📄', description: 'Social caption' },
  TELEGRAM_PROMO: { name: 'Telegram Promo', emoji: '✈️', description: 'Telegram promo' },
  WHATSAPP_PROMO: { name: 'WhatsApp Promo', emoji: '💬', description: 'WhatsApp promo' },
  HASHTAG_SET: { name: 'Hashtag Set', emoji: '#️⃣', description: 'Hashtags' },
  MIXED_CONTENT: { name: 'Mixed Content', emoji: '🎯', description: 'All types' },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return ' baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return formatDate(date);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c] || c));
}

export function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : text.slice(0, maxLength - 3) + '...';
}

export function formatContentForDisplay(content: {
  hook?: string | null;
  script?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
}): { text: string; parseMode: 'HTML' } {
  const parts: string[] = [];

  if (content.hook) parts.push('🎣 <b>HOOK:</b>\n' + escapeHtml(content.hook));
  if (content.script) parts.push('\n📝 <b>SCRIPT:</b>\n' + escapeHtml(content.script));
  if (content.caption) parts.push('\n📄 <b>Caption:</b>\n' + escapeHtml(content.caption));
  if (content.hashtags) parts.push('\n#️⃣ <b>HASHTAGS:</b>\n' + content.hashtags);
  if (content.cta) parts.push('\n🔗 <b>CTA:</b>\n' + escapeHtml(content.cta));

  return { text: parts.join('\n'), parseMode: 'HTML' };
}

export function getPlatformEmoji(platform: string): string {
  return PLATFORM_INFO[platform]?.emoji || '📱';
}

export function getContentTypeEmoji(contentType: string): string {
  return CONTENT_TYPE_INFO[contentType]?.emoji || '📄';
}