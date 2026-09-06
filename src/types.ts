export interface Env {
  ASSETS?: Fetcher;
  USER_PREFERENCES?: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPEN_PLATFORM_BASE_URL: string;
  OPEN_PLATFORM_API_KEY: string;
  OPEN_PLATFORM_CALLBACK_SECRET: string;
  OPEN_PLATFORM_CALLBACK_URL?: string;
  PUBLIC_WORKER_URL: string;
  DEFAULT_MODEL: string;
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS?: string;
  PUBLIC_TELEGRAM_BOT_USERNAME?: string;
  PUBLIC_TELEGRAM_APP_NAME?: string;
  BOT_ADMIN_TELEGRAM_IDS?: string;
  ADMIN_SYNC_BASE_URL?: string;
  ADMIN_SYNC_SECRET?: string;
  ADMIN_SERVICE?: Fetcher;
}

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = { id: number; type: string };
export type TelegramPhoto = { file_id: string; width: number; height: number; file_size?: number };

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  successful_payment?: {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    telegram_payment_charge_id: string;
    subscription_expiration_date?: number;
    is_recurring?: boolean;
    is_first_recurring?: boolean;
  };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
  pre_checkout_query?: {
    id: string;
    from: TelegramUser;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
};

export type OpenPlatformJob = {
  id: string;
  externalUserId: string;
  status: string;
  progress: number;
  model: string;
  creditCost: number;
  mode?: "text-to-video" | "image-to-video";
  prompt?: string;
  idempotencyKey?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  quality?: string;
  audioEnabled?: boolean;
  providerModel?: string;
  seed?: string | number;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  completedAt?: string;
  callbackAttempts?: number;
  callbackStatus?: number;
  botNotificationStatus?: "pending" | "sent" | "failed";
  coverUrl?: string;
  thumbnailUrl?: string;
  outputUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  creditsRefunded?: boolean;
  sourceContentKind?: "template" | "asset";
  sourceContentId?: string;
  refundedCredits?: number;
};

export type OpenPlatformModel = {
  id: string;
  name: string;
  creditCost: number;
  modes: Array<"text-to-video" | "image-to-video">;
  durations: number[];
  aspectRatios: string[];
  qualities: string[];
  supportsAudio: boolean;
  enabled: boolean;
};

export type OpenPlatformPersona = {
  personaCode: string;
  title?: string;
  primary: boolean;
};

export type OpenPlatformHomeItem = {
  id: string;
  kind: "template" | "asset";
  title: string;
  previewUrl?: string;
  videoUrl?: string;
  canMakeSimilar?: boolean;
};

export type OpenPlatformContent = {
  id: string;
  kind: "template" | "asset";
  title: string;
  description?: string;
  previewUrl?: string;
  videoUrl?: string;
  prompt?: string;
  referenceImageUrl?: string;
  promptDisplay?: string;
  defaultReferenceImageUrl?: string;
  defaultReferenceEnabled: boolean;
  defaultPublicModelId?: string;
  canCreate: boolean;
  requiresImage: boolean;
  requiredImageCount?: number;
  durationSeconds?: number;
  aspectRatio?: string;
};

export type OpenPlatformHome = {
  schemaVersion: number;
  personaCode: string;
  feedSessionId: string;
  rankingVersion: string;
  banners: OpenPlatformHomeItem[];
  categories: Array<{ id: string; title: string; itemCount: number }>;
  sections: Array<{ categoryId: string; title: string; items: OpenPlatformHomeItem[] }>;
};
