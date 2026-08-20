import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { IRetryPolicy, RETRY_POLICY } from '../../../common/resilience/retry-policy.interface';

@Injectable()
export class AuthTokenService implements OnModuleInit {
  private readonly logger = new Logger(AuthTokenService.name);

  http!: AxiosInstance;
  private token:          string | null = null;
  private tokenExpiresAt: Date   | null = null;
  private readonly refreshMarginMs: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(RETRY_POLICY) private readonly retryPolicy: IRetryPolicy,
  ) {
    const marginMin    = config.get<number>('sistema.jwtRefreshMarginMinutes') ?? 60;
    this.refreshMarginMs = marginMin * 60 * 1000;
  }

  async onModuleInit(): Promise<void> {
    const baseURL = this.config.get<string>('sistema.apiUrl');
    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.http.interceptors.request.use(async (cfg) => {
      await this.ensureToken();
      if (this.token) cfg.headers['Authorization'] = `Bearer ${this.token}`;
      return cfg;
    });

    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err.response?.status === 401 && !err.config?._retried) {
          err.config._retried = true;
          await this.login();
          err.config.headers['Authorization'] = `Bearer ${this.token}`;
          return this.http.request(err.config);
        }
        return Promise.reject(err);
      },
    );

    // P1.2 (auditoría 2026-08): mismo hueco que tenía sistema-api.service.ts
    // — timeout/5xx del backend rompía sin reintento.
    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (!err.config || err.config._retriedTransient) return Promise.reject(err);
        err.config._retriedTransient = true;
        try {
          return await this.retryPolicy.execute(
            () => this.http.request(err.config),
            { label: 'auth-token-service', maxAttempts: 2, baseMs: 500, capMs: 4000 },
          );
        } catch (finalErr) {
          return Promise.reject(finalErr);
        }
      },
    );

    try {
      await this.login();
    } catch (err) {
      this.logger.warn(`No se pudo autenticar con el sistema C# al iniciar: ${(err as Error).message}`);
    }
  }

  getCurrentToken(): string | null {
    return this.token;
  }

  private async login(): Promise<void> {
    const email    = this.config.get<string>('sistema.botEmail');
    const password = this.config.get<string>('sistema.botPassword');
    const baseURL  = this.config.get<string>('sistema.apiUrl');

    const res        = await axios.post(`${baseURL}/api/auth/login`, { Email: email, Password: password });
    const loginData  = res.data.data;
    this.token       = loginData?.Token ?? loginData?.token ?? res.data.token;
    this.tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    this.logger.log(`JWT del bot renovado. Expira: ${this.tokenExpiresAt.toISOString()}`);
  }

  async ensureToken(): Promise<void> {
    if (!this.token || !this.tokenExpiresAt) {
      await this.login();
      return;
    }
    if (this.tokenExpiresAt.getTime() - Date.now() <= this.refreshMarginMs) {
      await this.login();
    }
  }
}
