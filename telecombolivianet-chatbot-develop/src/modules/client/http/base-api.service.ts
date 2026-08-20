import { Injectable, Logger } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class BaseApiService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly auth: AuthTokenService) {}

  protected get http() {
    return this.auth.http;
  }

  protected async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.http.get<{ data: T }>(path, { params });
    return res.data.data;
  }

  protected async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.http.post<{ data: T }>(path, body);
    return res.data.data;
  }

  protected async patch<T = void>(path: string, body?: unknown): Promise<T> {
    const res = await this.http.patch<{ data: T }>(path, body);
    return res.data.data;
  }
}
