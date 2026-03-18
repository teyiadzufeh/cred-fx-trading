import { IsEnum, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { Currency } from '../../common/enums';

export class CreateWalletDto {
  @IsEnum(Currency)
  currency: Currency;
}

export class FundWalletDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class DebitWalletDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class GetWalletsQueryDto {
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
