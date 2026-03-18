import {
  CommandHandler,
  ICommandHandler,
  QueryHandler,
  IQueryHandler,
} from '@nestjs/cqrs';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Wallet } from '../../wallets/wallet.entity';
import { Transaction } from '../../transactions/transaction.entity';
import { FxRateService } from '../../common/providers/fx-rate.service';
import { ConvertCurrencyCommand } from '../commands';
import { GetRatesQuery, GetRateForPairQuery } from '../queries';
import {
  Currency,
  TransactionAction,
  TransactionType,
  TransactionStatus,
} from '../../common/enums';

// ─── ConvertCurrencyHandler ───────────────────────────────────────────────────

@CommandHandler(ConvertCurrencyCommand)
export class ConvertCurrencyHandler
  implements ICommandHandler<ConvertCurrencyCommand>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fxRateService: FxRateService,
  ) {}

  async execute({
    userId,
    fromCurrency,
    toCurrency,
    amount,
  }: ConvertCurrencyCommand) {
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('Source and destination currencies must be different');
    }

    // NGN must be on one side of every conversion
    if (fromCurrency !== Currency.NGN && toCurrency !== Currency.NGN) {
      throw new BadRequestException(
        'Conversions must involve Naira (NGN). ' +
        'To convert between two foreign currencies, first convert to NGN then to the target currency',
      );
    }

    // Lock in the rate BEFORE opening the DB transaction
    // so the user gets the rate they were quoted, not one that may shift mid-write
    const rate = await this.fxRateService.getRate(fromCurrency, toCurrency);
    const convertedAmount = parseFloat((amount * rate).toFixed(4));

    // Shared reference links the debit and credit transactions together
    const conversionReference = `CONV-${randomBytes(8).toString('hex').toUpperCase()}`;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ── Source wallet (debit) ──────────────────────────────────────────────
      const sourceWallet = await queryRunner.manager
        .getRepository(Wallet)
        .createQueryBuilder('wallet')
        .where('wallet.user_id = :userId AND wallet.currency = :currency', {
          userId,
          currency: fromCurrency,
        })
        .setLock('pessimistic_write_or_fail')
        .getOne();

      if (!sourceWallet) {
        throw new NotFoundException(
          `You don't have a ${fromCurrency} wallet`,
        );
      }

      if (!sourceWallet.isActive) {
        throw new BadRequestException(`Your ${fromCurrency} wallet is inactive`);
      }

      if (sourceWallet.balance < amount) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance. ` +
          `Available: ${sourceWallet.balance}, Required: ${amount}`,
        );
      }

      // ── Destination wallet (credit) — auto-create if it doesn't exist ──────
      let destinationWallet = await queryRunner.manager
        .getRepository(Wallet)
        .createQueryBuilder('wallet')
        .where('wallet.user_id = :userId AND wallet.currency = :currency', {
          userId,
          currency: toCurrency,
        })
        .setLock('pessimistic_write_or_fail')
        .getOne();

      if (!destinationWallet) {
        destinationWallet = queryRunner.manager.create(Wallet, {
          userId,
          currency: toCurrency,
          balance: 0,
          isActive: true,
        });
        await queryRunner.manager.save(Wallet, destinationWallet);
      }

      if (!destinationWallet.isActive) {
        throw new BadRequestException(`Your ${toCurrency} wallet is inactive`);
      }

      // ── Apply balance changes ──────────────────────────────────────────────
      sourceWallet.balance = parseFloat((sourceWallet.balance - amount).toFixed(4));
      destinationWallet.balance = parseFloat(
        (destinationWallet.balance + convertedAmount).toFixed(4),
      );

      await queryRunner.manager.save(Wallet, sourceWallet);
      await queryRunner.manager.save(Wallet, destinationWallet);

      // ── Debit transaction record ───────────────────────────────────────────
      const debitTx = queryRunner.manager.create(Transaction, {
        userId,
        walletId: sourceWallet.id,
        action: TransactionAction.CONVERSION,
        type: TransactionType.DEBIT,
        status: TransactionStatus.COMPLETED,
        amount,
        rateUsed: rate,
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        reference: `${conversionReference}-DEBIT`,
        metadata: {
          conversionReference,
          convertedAmount,
          fromCurrency,
          toCurrency,
        },
      });

      // ── Credit transaction record ──────────────────────────────────────────
      const creditTx = queryRunner.manager.create(Transaction, {
        userId,
        walletId: destinationWallet.id,
        action: TransactionAction.CONVERSION,
        type: TransactionType.CREDIT,
        status: TransactionStatus.COMPLETED,
        amount: convertedAmount,
        rateUsed: rate,
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        reference: `${conversionReference}-CREDIT`,
        metadata: {
          conversionReference,
          originalAmount: amount,
          fromCurrency,
          toCurrency,
        },
      });

      await queryRunner.manager.save(Transaction, debitTx);
      await queryRunner.manager.save(Transaction, creditTx);

      await queryRunner.commitTransaction();

      return {
        fromCurrency,
        toCurrency,
        amountDebited: amount,
        amountCredited: convertedAmount,
        rateUsed: rate,
        reference: conversionReference,
        sourceWalletBalance: sourceWallet.balance,
        destinationWalletBalance: destinationWallet.balance,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

// ─── GetRatesHandler ──────────────────────────────────────────────────────────

@QueryHandler(GetRatesQuery)
export class GetRatesHandler implements IQueryHandler<GetRatesQuery> {
  constructor(private readonly fxRateService: FxRateService) {}

  async execute({ base }: GetRatesQuery) {
    const cacheInfo = this.fxRateService.getCacheInfo();

    const rates = base
      ? await this.fxRateService.getRatesForBase(base)
      : await this.fxRateService.getRates();

    return {
      base: base ?? Currency.USD,
      rates,
      cachedAt: cacheInfo.cachedAt,
      cacheAgeSeconds: cacheInfo.ageSeconds,
    };
  }
}

// ─── GetRateForPairHandler ────────────────────────────────────────────────────

@QueryHandler(GetRateForPairQuery)
export class GetRateForPairHandler implements IQueryHandler<GetRateForPairQuery> {
  constructor(private readonly fxRateService: FxRateService) {}

  async execute({ from, to }: GetRateForPairQuery) {
    const rate = await this.fxRateService.getRate(from, to);
    const cacheInfo = this.fxRateService.getCacheInfo();

    return {
      from,
      to,
      rate,
      cachedAt: cacheInfo.cachedAt,
      cacheAgeSeconds: cacheInfo.ageSeconds,
    };
  }
}

export const FxHandlers = [
  ConvertCurrencyHandler,
  GetRatesHandler,
  GetRateForPairHandler,
];