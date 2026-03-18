import { GetTransactionsQueryDto } from '../dto';

export class GetTransactionByIdQuery {
  constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {}
}

export class GetTransactionByReferenceQuery {
  constructor(public readonly reference: string) {}
}

export class GetUserTransactionsQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: GetTransactionsQueryDto,
  ) {}
}

export class GetAllTransactionsQuery {
  constructor(
    public readonly filters: GetTransactionsQueryDto,
  ) {}
}
