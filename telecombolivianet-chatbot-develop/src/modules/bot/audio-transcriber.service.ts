import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { GeminiClientService } from '../ai/gemini-client.service';


import { GEMINI_BASE_URL as GEMINI_BASE } from '../../common/constants/app.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';
const MAX_AUDIO_BYTES = 1_000_000;

@Injectable()
export class AudioTranscriberService {
  private readonly logger = new Logger(AudioTranscriberService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly whatsappApi: WhatsappApiService,
    private readonly geminiClient: GeminiClientService,
  ) {
    this.apiKey = config.get<string>('gemini.apiKey') || '';
    this.model  = config.get<string>('gemini.chatModel') || 'gemini-2.5-flash';
    this.http   = axios.create({ timeout: 30000 });
  }

  async transcribeWhatsappAudio(audioId: string): Promise<string | null> {
    if (!this.geminiClient.isEnabled()) {
      this.logger.warn('Gemini no configurado — transcripción deshabilitada');
      return null;
    }

    try {
      const audioBuffer = await this.whatsappApi.downloadMedia(audioId);

      if (audioBuffer.length > MAX_AUDIO_BYTES) {
        this.logger.warn(`Audio demasiado largo (${audioBuffer.length} bytes) — omitiendo transcripción`);
        return null;
      }

      const transcript = await this.transcribeBuffer(audioBuffer, 'audio/ogg; codecs=opus');
      this.logger.debug(`Audio transcrito: "${transcript?.substring(0, 80)}..."`);
      return transcript;

    } catch (err) {
      this.logger.error(`Error transcribiendo audio ${audioId}: ${String(err)}`);
      return null;
    }
  }

  async transcribeBuffer(audioBuffer: Buffer, mimeType = 'audio/ogg; codecs=opus'): Promise<string | null> {
    if (!this.geminiClient.isEnabled()) return null;

    const base64Audio = audioBuffer.toString('base64');
    const url     = this.geminiClient.buildUrl(GEMINI_BASE, this.model, 'generateContent', this.apiKey);
    const headers = await this.geminiClient.getAuthHeaders();

    geminiTelemetry.record();
    const res = await this.http.post(url, {
      contents: [{
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe exactamente lo que dice esta nota de voz en español. ' +
                  'Si no puedes entenderla, responde solo: [inaudible]. ' +
                  'No añadas explicaciones ni comentarios.',
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
      },
    }, { headers });

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!text || text === '[inaudible]') return null;
    return text;
  }
}
