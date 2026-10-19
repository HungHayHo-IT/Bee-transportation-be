import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { DiaChiKhachService } from './dia-chi-khach.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, DiaChiKhachService],
  exports: [CustomersService, DiaChiKhachService],
})
export class CustomersModule {}
