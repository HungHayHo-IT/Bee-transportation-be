import {
  BadRequestException, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ActivityService } from '@/common/activity/activity.service';
import { isTestAccount } from '@/common/config/test-accounts.helper';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { MeResponseDto } from './dto/auth.dto';
import { RefreshTokenStore } from './refresh-token.store';

export const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
  ) {
    this.refreshTokens = new RefreshTokenStore(this.prisma.refreshToken, 'userId');
  }

  /**
   * Dựng tay chứ không inject: RefreshTokenStore là lớp thuần dùng chung với
   * phía khách hàng, mà module bên đó không sửa được để đăng ký provider.
   */
  private readonly refreshTokens: RefreshTokenStore;

  /** Trả token + hồ sơ. Thông điệp lỗi cố tình mơ hồ để không dò được email tồn tại. */
  async login(
    email: string, password: string,
  ): Promise<{ token: string; refreshToken: string; me: MeResponseDto }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { department: { select: { name: true } } },
    });
    const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    await this.activity.log(null, {
      entity: 'users',
      entityId: user.id,
      action: 'login',
      actorId: user.id,
    });

    // Payload CHỈ có sub — mọi quyền đọc lại từ DB ở mỗi request (JwtStrategy).
    return {
      token: await this.jwt.signAsync({ sub: user.id }),
      refreshToken: await this.refreshTokens.issue(user.id),
      me: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles,
        departmentId: user.departmentId,
        departmentName: user.department?.name ?? null,
        canViewCompanyReport: user.canViewCompanyReport,
        canViewAllOrders: user.canViewAllOrders,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Đổi refresh lấy access mới. Refresh cũ bị thu hồi ngay trong rotate() —
   * xem RefreshTokenStore để biết vì sao tái sử dụng lại cắt sạch phiên.
   *
   * Vẫn phải đọc lại `users` ở đây dù rotate đã xác thực xong: refresh sống 30
   * ngày, mà Admin khoá tài khoản thì phải có hiệu lực ngay chứ không đợi hết
   * 30 ngày đó. Tài khoản khoá thì refresh vừa cấp coi như bỏ, và thu hồi luôn
   * mọi phiên còn lại — người đã bị khoá không còn lý do giữ phiên nào.
   */
  async refresh(raw: string): Promise<{ token: string; refreshToken: string }> {
    const { ownerId, refreshToken } = await this.refreshTokens.rotateForActiveOwner(
      raw,
      async (id) => (await this.prisma.user.findUnique({
        where: { id }, select: { isActive: true },
      }))?.isActive === true,
    );
    return { token: await this.jwt.signAsync({ sub: ownerId }), refreshToken };
  }

  /**
   * Logout: thu hồi refresh token của ĐÚNG phiên đó, các máy khác vẫn đăng nhập.
   *
   * Access token 12h thì KHÔNG thu hồi được — cố ý, không có danh sách đen.
   * Đánh đổi: sau logout, access token cũ vẫn dùng được tới khi hết hạn (tối đa
   * 12h). Đổi lại mọi request không phải tra thêm một bảng đen nào. Chấp nhận
   * được vì access token chỉ nằm ở cookie httpOnly của chính máy vừa logout
   * hoặc trong bộ nhớ app vừa xoá; đường thoát khi thật sự nghi bị lộ là khoá
   * tài khoản (isActive=false), có hiệu lực NGAY vì JwtStrategy đọc DB mỗi request.
   */
  async revokeRefresh(raw?: string): Promise<void> {
    await this.refreshTokens.revoke(raw);
  }

  async me(user: AuthenticatedUser): Promise<MeResponseDto> {
    const dept = user.departmentId
      ? await this.prisma.department.findUnique({
          where: { id: user.departmentId },
          select: { name: true },
        })
      : null;
    return { ...user, canViewAllOrders: user.canViewAllOrders ?? false, departmentName: dept?.name ?? null };
  }

  async changePassword(user: AuthenticatedUser, current: string, next: string): Promise<void> {
    // Cả team dùng chung bộ tài khoản test, nên một người đổi mật khẩu là những
    // người còn lại mất lối vào. Chặn TRƯỚC khi kiểm mật khẩu hiện tại: kiểm
    // trước rồi mới chặn sẽ biến endpoint này thành chỗ dò mật khẩu, vì hai
    // thông điệp lỗi khác nhau cho biết đoán đúng hay sai.
    if (isTestAccount(user.email))
      throw new ForbiddenException('Tài khoản test không được đổi mật khẩu');

    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!(await bcrypt.compare(current, row.passwordHash)))
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    if (current === next) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS),
        mustChangePassword: false,
      },
    });
    await this.activity.log(null, {
      entity: 'users',
      entityId: user.id,
      action: 'change_password',
      actorId: user.id,
    });
  }
}
