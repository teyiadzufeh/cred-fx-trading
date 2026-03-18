import { Currency } from '../../common/enums';

export class GetRatesQuery {
  constructor(public readonly base?: Currency) {}
}

export class GetRateForPairQuery {
  constructor(
    public readonly from: Currency,
    public readonly to: Currency,
  ) {}
}