import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Transaction } from './transaction.entity';
import { Wallet } from '../wallets/wallet.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionHandlers } from './handlers';
import { FxRateService } from '../common/providers/fx-rate.service';
import { IdempotencyGuard } from '../common/guards/idempotency.guard';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Transaction, Wallet]),
  ],
  controllers: [TransactionsController],
  providers: [
    ...TransactionHandlers,
    FxRateService,
    IdempotencyGuard, // Register so it can be injected into the controller
  ],
  exports: [TypeOrmModule, FxRateService],
})
export class TransactionModule {}
