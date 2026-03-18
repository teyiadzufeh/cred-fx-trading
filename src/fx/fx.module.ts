import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Wallet } from '../wallets/wallet.entity';
import { Transaction } from '../transactions/transaction.entity';
import { FxController } from './fx.controller';
import { FxHandlers } from './handlers';
import { FxRateService } from '../common/providers/fx-rate.service';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Wallet, Transaction]),
  ],
  controllers: [FxController],
  providers: [
    ...FxHandlers,
    FxRateService,
  ],
  exports: [FxRateService], // Exported so TransactionModule can use it
})
export class FxModule {}