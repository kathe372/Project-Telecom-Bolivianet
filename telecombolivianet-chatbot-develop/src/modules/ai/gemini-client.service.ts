import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { geminiTelemetry } from './gemini-telemetry';


@Injectable()
export class GeminiClientService implements OnModuleInit {
  private readonly logger = new Logger(GeminiClientService.name);
  private auth: GoogleAuth | null = null;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private projectId: string | null = null;
  private location = 'global';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.location = this.config.get<string>('gemini.location') || 'global';
    const credJson = this.config.get<string>('gemini.serviceAccountJson');
    if (!credJson) {
      this.logger.warn('GOOGLE_SERVICE_ACCOUNT_JSON no configurado — usando API key (AI Studio billing)');
      return;
    }
    try {
      const credentials = JSON.parse(credJson);
      this.projectId = credentials.project_id || null;
      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      this.logger.log(
        `GeminiClientService: Vertex AI habilitado — proyecto: ${this.projectId}, región: ${this.location}`,
      );
    } catch (err) {
      this.logger.error(
        `GeminiClientService: error parseando JSON de cuenta de servicio: ${(err as Error).message}`,
      );
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.auth) return null;
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }
    try {
      const client = await this.auth.getClient() as OAuth2Client;
      const tokenResponse = await client.getAccessToken();
      this.cachedToken = tokenResponse.token;
      this.tokenExpiresAt = Date.now() + 3_600_000;
      return this.cachedToken;
    } catch (err: any) {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      throw err;
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  }

  /** El endpoint GLOBAL no lleva la región como prefijo del host (a
   *  diferencia de uno regional, ej. "us-central1-aiplatform..."). */
  private aiplatformHost(): string {
    return this.location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${this.location}-aiplatform.googleapis.com`;
  }

  buildUrl(base: string, model: string, method: string, apiKey: string): string {
    if (this.auth && this.projectId) {
      return (
        `https://${this.aiplatformHost()}/v1` +
        `/projects/${this.projectId}/locations/${this.location}` +
        `/publishers/google/models/${model}:${method}`
      );
    }
    return `${base}/${model}:${method}?key=${apiKey}`;
  }

  async embedText(text: string, model: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
    geminiTelemetry.record();
    if (this.auth && this.projectId) {
      const url =
        `https://${this.aiplatformHost()}/v1` +
        `/projects/${this.projectId}/locations/${this.location}` +
        `/publishers/google/models/${model}:predict`;
      const headers = await this.getAuthHeaders();
      const res = await axios.post(
        url,
        { instances: [{ content: text, task_type: taskType }] },
        { headers, timeout: 30_000 },
      );
      return res.data?.predictions?.[0]?.embeddings?.values as number[];
    }
    const apiKey = this.config.get<string>('gemini.apiKey');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
    const res = await axios.post(
      url,
      { model: `models/${model}`, content: { parts: [{ text }] } },
      { timeout: 30_000 },
    );
    return res.data?.embedding?.values as number[];
  }

  isUsingOAuth(): boolean {
    return this.auth !== null;
  }

  isEnabled(): boolean {
    return this.auth !== null || !!this.config.get<string>('gemini.apiKey');
  }
}
