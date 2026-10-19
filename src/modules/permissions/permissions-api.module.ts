import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';

/**
 * Tên module có hậu tố `-api` để không trùng với PermissionsModule ở tầng
 * common — cái kia giữ service và guard, cái này chỉ mở cửa API.
 */
@Module({ controllers: [PermissionsController] })
export class PermissionsApiModule {}
