import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { IWhatsappMessenger, TemplateComponent } from './whatsapp-messenger.interface';


const RETRYABLE = (err: any): boolean => {
  const status = err.response?.status;
  return !status || status === 429 || status >= 500;
};

@Injectable()
export class WhatsappApiService implements IWhatsappMessenger {
  private readonly logger = new Logger(WhatsappApiService.name);
  private http: AxiosInstance;
  private readonly phoneNumberId: string;

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BASE_MS = 500;

  constructor(private readonly config: ConfigService) {
    this.phoneNumberId = config.get<string>('meta.phoneNumberId');
    const apiVersion = config.get<string>('meta.apiVersion');
    const apiUrl = config.get<string>('meta.apiUrl');
    const token = config.get<string>('meta.accessToken');

    this.http = axios.create({
      baseURL: `${apiUrl}/${apiVersion}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!RETRYABLE(err) || attempt === this.MAX_RETRIES) break;
        const delay = this.RETRY_BASE_MS * Math.pow(2, attempt - 1);
        this.logger.warn(JSON.stringify({
          event:   'whatsapp_retry',
          label,
          attempt,
          delayMs: delay,
          error:   err.message,
        }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  async sendText(to: string, text: string): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      });
      return res.data?.messages?.[0]?.id;
    }, `sendText:${to}`);
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: imageUrl, ...(caption && { caption }) },
      });
      return res.data?.messages?.[0]?.id;
    }, `sendImage:${to}`);
  }

  async sendList(
    to: string,
    body: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: body },
          action: { button: buttonLabel, sections },
        },
      });
      return res.data?.messages?.[0]?.id;
    }, `sendList:${to}`);
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      });
      return res.data?.messages?.[0]?.id;
    }, `sendButtons:${to}`);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
  ): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name:     templateName,
          language: { code: languageCode },
          ...(components?.length && { components }),
        },
      });
      return res.data?.messages?.[0]?.id;
    }, `sendTemplate:${to}:${templateName}`);
  }

  async markAsRead(messageId: string, typing = false): Promise<void> {
    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch {
    }
    // MEJORA-1B: el typing va en un request SEPARADO — si la cuenta/versión
    // no lo soporta, el rechazo jamás afecta al acuse de lectura.
    if (typing) {
      try {
        await this.http.post(`/${this.phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: { type: 'text' },
        });
      } catch {
      }
    }
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const mediaRes = await this.http.get(`/${mediaId}`);
    const mediaUrl = mediaRes.data.url;

    const downloadRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${this.config.get('meta.accessToken')}` },
      responseType: 'arraybuffer',
    });
    return Buffer.from(downloadRes.data);
  }
}
