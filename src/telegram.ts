import type { Env } from "./types";

type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

export class TelegramClient {
  constructor(private readonly env: Env) {}

  async sendMessage(chatId: number, text: string, buttons?: InlineButton[][]) {
    return this.call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: buttons ? { inline_keyboard: buttons } : undefined });
  }

  async sendVideo(chatId: number, video: string, caption: string, buttons?: InlineButton[][]) {
    return this.call("sendVideo", { chat_id: chatId, video, caption, parse_mode: "HTML", reply_markup: buttons ? { inline_keyboard: buttons } : undefined });
  }

  async sendPhoto(chatId: number, photo: string, caption: string) {
    return this.call("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML" });
  }

  async answerCallback(id: string, text = "") {
    return this.call("answerCallbackQuery", { callback_query_id: id, text });
  }

  async answerPreCheckout(id: string, ok: boolean, errorMessage = "") {
    return this.call("answerPreCheckoutQuery", { pre_checkout_query_id: id, ok, error_message: ok ? undefined : errorMessage });
  }

  async createInvoice(input: { title: string; description: string; payload: string; stars: number; subscriptionPeriodSeconds?: number }) {
    const result = await this.call<string>("createInvoiceLink", {
      title: input.title,
      description: input.description,
      payload: input.payload,
      currency: "XTR",
      prices: [{ label: input.title, amount: input.stars }],
      subscription_period: input.subscriptionPeriodSeconds,
    });
    return result;
  }

  async editUserStarSubscription(userId: number, telegramPaymentChargeId: string, isCanceled: boolean) {
    return this.call("editUserStarSubscription", {
      user_id: userId,
      telegram_payment_charge_id: telegramPaymentChargeId,
      is_canceled: isCanceled,
    });
  }

  async resetChatMenuButton(chatId: number) {
    return this.call("setChatMenuButton", {
      chat_id: chatId,
      menu_button: { type: "default" },
    });
  }

  async getFile(fileId: string) {
    return this.call<{ file_path: string }>("getFile", { file_id: fileId });
  }

  async downloadFile(path: string) {
    const response = await fetch(`https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${path}`);
    if (!response.ok || !response.body) throw new Error(`Telegram file download failed: ${response.status}`);
    return response;
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { ok: boolean; result: T; description?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram ${method} failed`);
    return payload.result;
  }
}

export function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
