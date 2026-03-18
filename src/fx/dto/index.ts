import { IsEnum, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { Currency } from '../../common/enums';

export class ConvertCurrencyDto {
  @IsEnum(Currency)
  fromCurrency: Currency;

  @IsEnum(Currency)
  toCurrency: Currency;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export enum TradeDirection {
  BUY = 'buy',   // NGN → foreign currency
  SELL = 'sell', // foreign currency → NGN
}

/**
 * TradeCurrencyDto
 *
 * Models a market-style trade: the user explicitly buys or sells
 * a foreign currency against NGN.
 *
 * BUY:  spend NGN to acquire the target foreign currency
 *       fromCurrency = NGN, toCurrency = foreignCurrency
 *
 * SELL: sell a foreign currency to receive NGN
 *       fromCurrency = foreignCurrency, toCurrency = NGN
 *
 * NGN ↔ foreign is enforced in the handler — passing NGN as both
 * sides or two foreign currencies will be rejected.
 */
export class TradeCurrencyDto {
  @IsEnum(TradeDirection)
  direction: TradeDirection;

  @IsEnum(Currency)
  currency: Currency; // The foreign currency being bought or sold

  @IsNumber()
  @IsPositive()
  amount: number; // Amount of NGN to spend (BUY) or foreign currency to sell (SELL)
}


export class GetRatesDto {
  @IsOptional()
  @IsEnum(Currency)
  base?: Currency;
}