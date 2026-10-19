import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { Of1Client } from './of1.client';
import { TmsController } from './tms.controller';
import { TmsService } from './tms.service';

@Module({
  // Can DiaChiKhachService de tra ma dia chi truoc khi day don.
  imports: [CustomersModule],
  controllers: [TmsController],
  providers: [TmsService, Of1Client],
  exports: [TmsService],
})
export class TmsModule {}
