import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UserHandlers } from './handlers';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [...UserHandlers],
  exports: [TypeOrmModule], // Export so AuthModule can query User repo directly
})
export class UsersModule {}
