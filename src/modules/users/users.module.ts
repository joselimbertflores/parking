import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/users.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
