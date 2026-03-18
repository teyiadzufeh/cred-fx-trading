import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { UpdateUserDto, UpdateUserRoleDto } from './dto';
import { UpdateUserCommand, UpdateUserRoleCommand, DeactivateUserCommand } from './commands';
import { GetUserByIdQuery, GetAllUsersQuery } from './queries';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // GET /api/v1/users?page=1&limit=20  (admin only)
  @Get()
  @Roles(UserRole.ADMIN)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.queryBus.execute(new GetAllUsersQuery(page, limit));
  }

  // GET /api/v1/users/me
  @Get('me')
  getProfile(@Request() req) {
    return this.queryBus.execute(new GetUserByIdQuery(req.user.id));
  }

  // GET /api/v1/users/:id  (admin only)
  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetUserByIdQuery(id));
  }

  // PATCH /api/v1/users/:id
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Request() req,
  ) {
    return this.commandBus.execute(new UpdateUserCommand(id, dto, req.user.id));
  }

  // PATCH /api/v1/users/:id/role  (admin only)
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.commandBus.execute(new UpdateUserRoleCommand(id, dto));
  }

  // DELETE /api/v1/users/:id  (admin only — soft deactivate)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(new DeactivateUserCommand(id));
  }
}
