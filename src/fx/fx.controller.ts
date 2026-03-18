import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetRatesDto } from './dto';
import { GetRatesQuery, GetRateForPairQuery } from './queries';
import { Currency } from '../common/enums';
import { IsEnum } from 'class-validator';

class GetRatePairDto {
  @IsEnum(Currency)
  from: Currency;

  @IsEnum(Currency)
  to: Currency;
}

@Controller('fx')
export class FxController {
  constructor(private readonly queryBus: QueryBus) {}

  // GET /api/v1/fx/rates
  // GET /api/v1/fx/rates?base=NGN
  @Get('rates')
  getRates(@Query() query: GetRatesDto) {
    return this.queryBus.execute(new GetRatesQuery(query.base));
  }

  // GET /api/v1/fx/rates/pair?from=NGN&to=USD
  @Get('rates/pair')
  getRatePair(@Query() query: GetRatePairDto) {
    return this.queryBus.execute(
      new GetRateForPairQuery(query.from, query.to),
    );
  }
}