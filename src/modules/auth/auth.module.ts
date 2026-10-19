import { Module } from '@nestjs/common';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DangKyDoiTacController } from './dang-ky-doi-tac.controller';
import { DangKyDoiTacService } from './dang-ky-doi-tac.service';

@Module({
  // Dùng lại bộ OTP của cổng khách thay vì viết bộ thứ hai: nó đã có hạn mã 5
  // phút, khoá sau 5 lần sai, và 60s giữa hai lần gửi.
  imports: [CustomerAuthModule],
  controllers: [AuthController, DangKyDoiTacController],
  providers: [AuthService, DangKyDoiTacService],
})
export class AuthModule {}
