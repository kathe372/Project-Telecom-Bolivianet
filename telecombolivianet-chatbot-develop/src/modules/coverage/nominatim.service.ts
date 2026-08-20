import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import type { ParsedCoords } from './location-parser.util';

const NOMINATIM_URL     = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL_S       = 86400;    // 24h — addresses don't change frequently
const RATE_LIMIT_KEY    = 'nominatim:ratelimit';
const RATE_LIMIT_TTL_MS = 1100;     // slightly above 1 s — enforces ≤1 req/sec per ToS
const BBOX_MAX_DEGREES  = 0.5;      // reject results that span more than ~55 km

interface NominatimResult {
  lat: string;
  lon: string;
  boundingbox?: string[]; // [latMin, latMax, lonMin, lonMax]
}

@Injectable()
export class NominatimService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NominatimService.name);
  private redis: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host:          this.config.get<string>('redis.host'),
      port:          this.config.get<number>('redis.port'),
      password:      this.config.get<string>('redis.password') || undefined,
      db:            this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    this.redis.on('error', (err) => this.logger.error('Nominatim Redis error', err.message));
  }

  onModuleDestroy(): void { this.redis?.disconnect(); }

  async geocode(address: string): Promise<ParsedCoords | null> {
    if (!address?.trim()) return null;

    const query    = `${address.trim()}, Bolivia`;
    const hash     = createHash('sha1').update(query).digest('hex');
    const cacheKey = `nominatim:${hash}`;

    // Check Redis cache first (null result is also cached to avoid repeat calls)
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as ParsedCoords | null;
    }

    // Enforce Nominatim ToS: max 1 request/second (ioredis v5: PX ms NX order)
    const acquired = await this.redis.set(RATE_LIMIT_KEY, '1', 'PX', RATE_LIMIT_TTL_MS, 'NX');
    if (!acquired) {
      this.logger.debug(`Nominatim rate-limit reached — skipping geocode for "${address}"`);
      return null;
    }

    try {
      const res = await axios.get<NominatimResult[]>(NOMINATIM_URL, {
        params:  { q: query, format: 'json', limit: 1 },
        headers: { 'User-Agent': 'TelecomBoliviaNet-Chatbot/1.0 (soporte@bolivianet.bo)' },
        timeout: 5000,
      });

      const results = res.data;
      if (!results?.length) {
        await this.redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify(null));
        return null;
      }

      const top = results[0];

      // Reject overly broad results (e.g. the entire city of "Bolivia")
      if (top.boundingbox) {
        const [latMin, latMax, lngMin, lngMax] = top.boundingbox.map(Number);
        if (
          Math.abs(latMax - latMin) > BBOX_MAX_DEGREES ||
          Math.abs(lngMax - lngMin) > BBOX_MAX_DEGREES
        ) {
          this.logger.debug(`Nominatim bbox too wide for "${address}" — rejected`);
          await this.redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify(null));
          return null;
        }
      }

      const coords: ParsedCoords = { lat: parseFloat(top.lat), lng: parseFloat(top.lon) };
      await this.redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify(coords));
      return coords;

    } catch (err: any) {
      this.logger.warn(`Nominatim geocode error for "${address}": ${err.message}`);
      return null;
    }
  }
}
