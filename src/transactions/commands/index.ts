import { CreateTransactionDto, UpdateTransactionStatusDto } from '../dto';
import { TransactionStatus } from '../../common/enums';

export class CreateTransactionCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateTransactionDto,
  ) {}
}

export class UpdateTransactionStatusCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateTransactionStatusDto,
  ) {}
}

export class ReverseTransactionCommand {
  constructor(
    public readonly id: string,
    public readonly requesterId: string,
  ) {}
}