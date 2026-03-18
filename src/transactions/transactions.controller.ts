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
import { RolesGuard } from '../common/guards/roles.guard';
import { IdempotencyGuard } from '../common/guards/idempotency.guard';
import { IsEmailVerifiedGuard } from '../common/guards/email-verified.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  CreateTransactionDto,
  UpdateTransactionStatusDto,
  GetTransactionsQueryDto,
} from './dto';
import {
  CreateTransactionCommand,
  UpdateTransactionStatusCommand,
  ReverseTransactionCommand,
} from './commands';
import {
  GetTransactionByIdQuery,
  GetUserTransactionsQuery,
  GetAllTransactionsQuery,
} from './queries';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // POST /api/v1/transactions
  // IsEmailVerifiedGuard blocks unverified users
  // IdempotencyGuard prevents duplicate transactions via reference field
  @Post()
  @UseGuards(IsEmailVerifiedGuard, IdempotencyGuard)
  create(@Body() dto: CreateTransactionDto, @Request() req) {
    return this.commandBus.execute(new CreateTransactionCommand(req.user.id, dto));
  }

  // GET /api/v1/transactions
  @Get()
  findMine(@Query() filters: GetTransactionsQueryDto, @Request() req) {
    return this.queryBus.execute(new GetUserTransactionsQuery(req.user.id, filters));
  }

  // GET /api/v1/transactions/all  (admin only)
  @Get('all')
  @Roles(UserRole.ADMIN)
  findAll(@Query() filters: GetTransactionsQueryDto) {
    return this.queryBus.execute(new GetAllTransactionsQuery(filters));
  }

  // GET /api/v1/transactions/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.queryBus.execute(new GetTransactionByIdQuery(id, req.user.id));
  }

  // PATCH /api/v1/transactions/:id/status  (admin only)
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionStatusDto,
  ) {
    return this.commandBus.execute(new UpdateTransactionStatusCommand(id, dto));
  }

  // PATCH /api/v1/transactions/:id/reverse  (admin only)
  @Patch(':id/reverse')
  @Roles(UserRole.ADMIN)
  reverse(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.commandBus.execute(new ReverseTransactionCommand(id, req.user.id));
  }
}