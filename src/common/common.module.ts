import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ActivityService } from './activity/activity.service';
import { BiMatService } from './bi-mat/bi-mat.service';
import { PageAccessGuard } from './permissions/page-access.guard';
import { PermissionMatrixService } from './permissions/permission-matrix.service';
import { envSchema } from './config/env.validation';
import { FcmService } from './fcm/fcm.service';
import { MailService } from './mail/mail.service';
import { PrismaService } from './prisma/prisma.service';
import { ScopeService } from './scope/scope.service';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PassportModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' },
      }),
    }),
  ],
  providers: [
    PrismaService, ScopeService, ActivityService, MailService, FcmService,
    JwtStrategy, CustomerJwtStrategy, BiMatService,
    // Ma trận phân quyền: service đọc bảng, guard chặn theo nó. Ở đây chứ
    // không thành một module riêng — nó không có phụ thuộc nào ngoài Prisma,
    // và mọi module đều cần tới guard.
    PermissionMatrixService, PageAccessGuard,
  ],
  exports: [
    PrismaService, ScopeService, ActivityService, MailService, FcmService, JwtModule,
    BiMatService,
    PermissionMatrixService, PageAccessGuard,
  ],
})
export class CommonModule {}
