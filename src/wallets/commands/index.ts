import { Currency } from '../../common/enums';

export class CreateWalletCommand {
  constructor(
    public readonly userId: string,
    public readonly currency: Currency,
  ) {}
}

export class FundWalletCommand {
  constructor(
    public readonly walletId: string,
    public readonly userId: string,
    public readonly amount: number,
  ) {}
}

export class DebitWalletCommand {
  constructor(
    public readonly walletId: string,
    public readonly userId: string,
    public readonly amount: number,
  ) {}
}
