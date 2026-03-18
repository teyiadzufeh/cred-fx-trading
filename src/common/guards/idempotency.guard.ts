import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';

/**
 * IdempotencyGuard
 *
 * Apply to any endpoint that creates a transaction.
 * If the request body contains a `reference` field, the guard checks whether
 * a transaction with that reference already exists. If it does, it short-circuits
 * with a 409 Conflict rather than creating a duplicate.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, IdempotencyGuard)
 *   @Post()
 *   create(@Body() dto: CreateTransactionDto) { ... }
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const reference = request.body?.reference;

    if (!reference) return true; // No reference provided — allow through

    const existing = await this.txRepo.findOne({ where: { reference } });
    if (existing) {
      throw new ConflictException(
        `A transaction with reference "${reference}" already exists`,
      );
    }

    return true;
  }
}
