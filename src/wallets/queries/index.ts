import { Currency } from '../../common/enums';

export class GetWalletByIdQuery {
  constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {}
}

export class GetUserWalletsQuery {
  constructor(
    public readonly userId: string,
    public readonly currency?: Currency,
  ) {}
}
