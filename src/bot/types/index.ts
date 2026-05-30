// ============================================
// Telegram Bot Types (String-based for SQLite)
// ============================================

export type BotState =
  | 'START'
  | 'MAIN_MENU'
  | 'ADD_PRODUCT'
  | 'GENERATE_CONTENT'
  | 'SELECT_PRODUCT'
  | 'SELECT_PLATFORM'
  | 'SELECT_CONTENT_TYPE'
  | 'AWAITING_APPROVAL'
  | 'APPROVAL_RESULT';

export interface BotSessionData {
  state: BotState;
  selectedProductId?: string;
  selectedPlatform?: string;
  selectedContentType?: string;
  lastGeneratedContent?: GeneratedContent;
  tempData?: Record<string, unknown>;
}

export interface GeneratedContent {
  hook?: string;
  script?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  telegramText?: string;
  whatsappText?: string;
}

export interface GenerateContentRequest {
  productId: string;
  platform: string;
  contentType: string;
  tone?: string;
  language?: string;
}

export interface BotCommand {
  name: string;
  description: string;
  handler: (ctx: BotContext) => Promise<void>;
}

export type ApprovalAction = 'approve' | 'reject' | 'regenerate' | 'edit';

export interface ApprovalCallbackData {
  contentId: string;
  action: ApprovalAction;
}

export interface PlatformInfo {
  name: string;
  emoji: string;
  color: string;
}

export interface ContentTypeInfo {
  name: string;
  emoji: string;
  description: string;
}

export interface BotUser {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin: boolean;
  isApproved: boolean;
}

export interface FormattedMessage {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: ReplyMarkup;
}

export interface InlineButton {
  text: string;
  callbackData?: string;
  url?: string;
}

export interface ReplyMarkup {
  inlineKeyboard: InlineButton[][];
}

export interface PaginationInfo {
  page: number;
  totalPages: number;
  totalItems: number;
}

// Bot context type (simplified)
export interface BotContext {
  from?: { id: number; username?: string; first_name?: string; last_name?: string };
  message?: { text: string };
  match?: RegExpMatchArray;
  reply: (text: string, extra?: any) => Promise<any>;
  editMessageText: (text: string, extra?: any) => Promise<any>;
  answerCbQuery: (text?: string, extra?: any) => Promise<any>;
  session?: any;
  dbUser?: any;
  isAdmin?: boolean;
  telegram?: any;
  botInfo?: any;
}