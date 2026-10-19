import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard cho endpoint dành cho KHÁCH HÀNG. Áp riêng bằng @UseGuards trên từng
 * route — mã hoá vào 'customer-jwt' để không lẫn với JwtStrategy nhân viên.
 * KHÔNG dùng làm global guard — route mặc định đã đi qua JwtAuthGuard.
 */
@Injectable()
export class CustomerJwtGuard extends AuthGuard('customer-jwt') {}
