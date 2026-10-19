import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { xemDonDaChot } from '../scope/dieu-van';

export const ACCESS_COOKIE = 'access_token';

type CookieRequest = FastifyRequest & { cookies?: Record<string, string | undefined> };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Cookie trước, header sau: web dùng cookie httpOnly (an toàn hơn vì JS
      // không đọc được), còn app mobile không có kho cookie chung nên buộc phải
      // gửi qua `Authorization: Bearer`. Thiếu extractor header thì token hợp lệ
      // từ app vẫn bị 401.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: CookieRequest) => req.cookies?.[ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Token CHỈ mang { sub }. Mọi quyền đọc từ DB mỗi request — nếu nhét roles /
   * canViewCompanyReport vào token thì Admin thu hồi quyền sẽ trễ tới 12 giờ.
   */
  async validate(payload: { sub: number }): Promise<AuthenticatedUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        roles: true,
        departmentId: true,
        canViewCompanyReport: true,
        canViewAllOrders: true,
        mustChangePassword: true,
        isActive: true,
        department: { select: { isSales: true, isQuoting: true, serviceIds: true } },
      },
    });
    if (!u || !u.isActive) throw new UnauthorizedException();
    // isActive chỉ dùng để chặn ở trên, không đưa vào AuthenticatedUser.
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      roles: u.roles,
      departmentId: u.departmentId,
      canViewCompanyReport: u.canViewCompanyReport,
      canViewAllOrders: u.canViewAllOrders,
      mustChangePassword: u.mustChangePassword,
      ...(xemDonDaChot(u.roles, u.department) && u.departmentId !== null
        ? { dieuVan: { departmentId: u.departmentId, serviceIds: u.department!.serviceIds } }
        : {}),
    };
  }
}
