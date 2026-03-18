import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency } from '../enums';

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: Date;
}

/**
 * FxRateService
 *
 * Fetches live FX rates from exchangerate-api.com and caches them in-memory
 * for 5 minutes to avoid hammering the API on every transaction.
 *
 * Set EXCHANGE_RATE_API_KEY in your .env.
 * Free key at: https://www.exchangerate-api.com (1,500 requests/month)
 *
 * All rates are stored relative to USD as the base currency.
 * Cross-rate formula: rate(A → B) = rates[B] / rates[A]
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly BASE_CURRENCY = 'USD';
  private cache: RateCache | null = null;

  constructor(private readonly configService: ConfigService) {}

  async getRate(from: Currency, to: Currency): Promise<number> {
    if (from === to) return 1;

    const rates = await this.getRates();
    const fromRate = rates[from];
    const toRate = rates[to];

    if (!fromRate || !toRate) {
      throw new InternalServerErrorException(
        `Exchange rate unavailable for ${from} → ${to}`,
      );
    }

    const rate = toRate / fromRate;
    return Number.parseFloat(rate.toFixed(6));
  }

  /**
   * Returns all supported rates relative to USD.
   * Used by GET /fx/rates.
   */
  async getRates(): Promise<Record<string, number>> {
    if (this.isCacheValid()) {
      return this.cache.rates;
    }
    return this.fetchAndCache();
  }

  /**
   * Returns all rates rebased to a specific currency.
   * e.g. getRatesForBase(NGN) → { USD: 0.000633, GBP: 0.0005, EUR: 0.000582 }
   */
  async getRatesForBase(base: Currency): Promise<Record<string, number>> {
    const rates = await this.getRates();
    const baseRate = rates[base];

    if (!baseRate) {
      throw new InternalServerErrorException(`No rate found for base currency ${base}`);
    }

    const rebased: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(rates)) {
      rebased[currency] = Number.parseFloat((rate / baseRate).toFixed(6));
    }

    return rebased;
  }

  async refresh(): Promise<void> {
    this.cache = null;
    await this.fetchAndCache();
  }

  getCacheInfo(): { cachedAt: Date | null; ageSeconds: number | null; isValid: boolean } {
    if (!this.cache) return { cachedAt: null, ageSeconds: null, isValid: false };
    const ageSeconds = Math.floor((Date.now() - this.cache.fetchedAt.getTime()) / 1000);
    return { cachedAt: this.cache.fetchedAt, ageSeconds, isValid: this.isCacheValid() };
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cache.fetchedAt.getTime() < this.CACHE_TTL_MS;
  }

  private async fetchAndCache(): Promise<Record<string, number>> {
    const apiKey = this.configService.get<string>('EXCHANGE_RATE_API_KEY');

    if (!apiKey) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not set — using mock rates');
      return this.useMockRates();
    }

    try {
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${this.BASE_CURRENCY}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data = await response.json();

      if (data.result !== 'success') {
        throw new Error(`API error: ${data['error-type']}`);
      }

      // Filter to only currencies the app supports
      const supported = Object.values(Currency) as string[];
      const filtered: Record<string, number> = {};
      for (const currency of supported) {
        if (data.conversion_rates[currency] !== undefined) {
          filtered[currency] = data.conversion_rates[currency];
        }
      }

      this.cache = { rates: filtered, fetchedAt: new Date() };
      this.logger.log(`FX rates refreshed — next refresh in 5 minutes`);
      return filtered;
    } catch (err) {
      this.logger.error('Failed to fetch FX rates', err.message);

      // Return stale cache rather than crashing if fetch fails
      if (this.cache) {
        this.logger.warn('Serving stale cached rates due to API fetch failure');
        return this.cache.rates;
      }

      return this.useMockRates();
    }
  }

  private useMockRates(): Record<string, number> {
    const mock: Record<string, number> = {
      [Currency.USD]: 1,
      [Currency.NGN]: 1580,
      [Currency.GBP]: 0.79,
      [Currency.EUR]: 0.92,
    };
    this.cache = { rates: mock, fetchedAt: new Date() };
    return mock;
  }
}