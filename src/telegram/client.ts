/** Minimal Telegram Bot API client over fetch; no SDK needed for sending messages. */
export type TelegramClient = {
  sendMessage(chatId: string, html: string): Promise<void>;
  sendLocation(chatId: string, lat: number, lon: number): Promise<void>;
};

export function createTelegramClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  async function call(method: string, body: Record<string, unknown>, attempt = 1): Promise<void> {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return;

    const payload = (await response.json().catch(() => ({}))) as {
      description?: string;
      parameters?: { retry_after?: number };
    };
    const retryAfter = payload.parameters?.retry_after;
    if (response.status === 429 && retryAfter && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return call(method, body, attempt + 1);
    }
    // Never include the token (it is part of the URL) in the error.
    throw new Error(`Telegram ${method} failed: ${response.status} ${payload.description ?? ""}`);
  }

  return {
    sendMessage: (chatId, html) =>
      call("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: false, prefer_large_media: true },
      }),
    sendLocation: (chatId, lat, lon) =>
      call("sendLocation", { chat_id: chatId, latitude: lat, longitude: lon }),
  };
}
