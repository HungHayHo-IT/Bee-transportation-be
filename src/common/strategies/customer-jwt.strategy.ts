import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedCustomer } from '../types/authenticated-customer.type';

/** Cookie riêng cho khách hàng — không chạm cookie nhân viên nội bộ. */
export const CUSTOMER_COOKIE = 'customer_token';

type CookieRequest = FastifyRequest & { cookies?: Record<string, string | undefined> };

/**
 * JWT chỉ mang { sub, type: 'customer' }. Đọc lại mọi thông tin từ DB mỗi
 * request — thu hồi quyền (khoá tài khoản) có hiệu lực ngay.
 */
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Cookie trước, header sau — app khách hàng không đọc được cookie httpOnly
      // nên phải gửi token qua `Authorization: Bearer`; web vẫn đi bằng cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: CookieRequest) => req.cookies?.[CUSTOMER_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; type?: string }): Promise<AuthenticatedCustomer> {
    if (payload.type !== 'customer') throw new UnauthorizedException();
    const c = await this.prisma.customerAccount.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, fullName: true, phone: true, pinHash: true, isActive: true,
      },
    });
    if (!c || !c.isActive) throw new UnauthorizedException();
    return {
      id: c.id, email: c.email, fullName: c.fullName, phone: c.phone,
      hasPin: c.pinHash !== null,
    };
  }
}
