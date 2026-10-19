import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAvatarS3Service } from './customer-avatar-s3.service';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerOtpService } from './customer-otp.service';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  controllers: [CustomerAuthController, CustomerProfileController],
  providers: [
    CustomerAuthService, CustomerOtpService, CustomerProfileService, CustomerNotificationsService,
    CustomerAvatarS3Service, CustomerAvatarService,
  ],
  // Luồng ký điện tử dùng lại đúng cơ chế OTP này, purpose riêng.
  exports: [CustomerAuthService, CustomerOtpService],
})
export class CustomerAuthModule {}
