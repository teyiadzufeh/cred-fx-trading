import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsEmailVerifiedGuard } from '../common/guards/email-verified.guard';
import { CreateWalletDto, FundWalletDto, DebitWalletDto, GetWalletsQueryDto } from './dto';
import { ConvertCurrencyDto, TradeCurrencyDto, TradeDirection } from '../fx/dto';
import { CreateWalletCommand, FundWalletCommand, DebitWalletCommand } from './commands';
import { GetWalletByIdQuery, GetUserWalletsQuery } from './queries';
import { ConvertCurrencyCommand } from '../fx/commands';
import { Currency } from '../common/enums';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // POST /api/v1/wallets
  @Post()
  create(@Body() dto: CreateWalletDto, @Request() req) {
    return this.commandBus.execute(
      new CreateWalletCommand(req.user.id, dto.currency),
    );
  }

  // GET /api/v1/wallets?currency=NGN
  @Get()
  findAll(@Query() query: GetWalletsQueryDto, @Request() req) {
    return this.queryBus.execute(
      new GetUserWalletsQuery(req.user.id, query.currency),
    );
  }

  // GET /api/v1/wallets/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.queryBus.execute(new GetWalletByIdQuery(id, req.user.id));
  }

  // PATCH /api/v1/wallets/:id/fund
  @Patch(':id/fund')
  fund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FundWalletDto,
    @Request() req,
  ) {
    return this.commandBus.execute(
      new FundWalletCommand(id, req.user.id, dto.amount),
    );
  }

  // PATCH /api/v1/wallets/:id/debit
  @Patch(':id/debit')
  debit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DebitWalletDto,
    @Request() req,
  ) {
    return this.commandBus.execute(
      new DebitWalletCommand(id, req.user.id, dto.amount),
    );
  }

  // POST /api/v1/wallets/convert
  // Direct swap — caller specifies both fromCurrency and toCurrency explicitly.
  // NGN must be on one side.
  @Post('convert')
  @UseGuards(IsEmailVerifiedGuard)
  convert(@Body() dto: ConvertCurrencyDto, @Request() req) {
    return this.commandBus.execute(
      new ConvertCurrencyCommand(
        req.user.id,
        dto.fromCurrency,
        dto.toCurrency,
        dto.amount,
      ),
    );
  }

  // POST /api/v1/wallets/trade
  // Market-style trade: caller picks a direction (buy/sell) and a foreign currency.
  // BUY  → spend NGN to acquire the foreign currency  (NGN → foreign)
  // SELL → sell the foreign currency to receive NGN   (foreign → NGN)
  // NGN ↔ foreign constraint is naturally satisfied by the direction model.
  @Post('trade')
  @UseGuards(IsEmailVerifiedGuard)
  trade(@Body() dto: TradeCurrencyDto, @Request() req) {
    const fromCurrency =
      dto.direction === TradeDirection.BUY ? Currency.NGN : dto.currency;
    const toCurrency =
      dto.direction === TradeDirection.BUY ? dto.currency : Currency.NGN;

    return this.commandBus.execute(
      new ConvertCurrencyCommand(
        req.user.id,
        fromCurrency,
        toCurrency,
        dto.amount,
      ),
    );
  }
}