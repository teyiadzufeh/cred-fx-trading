import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Wallet } from './wallet.entity';
import { WalletsController } from './wallets.controller';
import { WalletHandlers } from './handlers';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Wallet]),
    FxModule, // Provides ConvertCurrencyHandler and FxRateService
  ],
  controllers: [WalletsController],
  providers: [...WalletHandlers],
  exports: [TypeOrmModule],
})
export class WalletModule {}