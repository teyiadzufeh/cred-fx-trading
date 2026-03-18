import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsObject,
} from 'class-validator';
import {
  TransactionAction,
  TransactionStatus,
  TransactionType,
  Currency,
} from '../../common/enums';

export class CreateTransactionDto {
  @IsEnum(TransactionAction)
  action: TransactionAction;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsNumber()
  @IsPositive()
  rateUsed: number;

  @IsEnum(Currency)
  sourceCurrency: Currency;

  @IsOptional()
  @IsEnum(Currency)
  destinationCurrency?: Currency;

  @IsString()
  walletId: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateTransactionStatusDto {
  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class GetTransactionsQueryDto {
  @IsOptional()
  @IsEnum(TransactionAction)
  action?: TransactionAction;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsString()
  walletId?: string;

  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;
}
