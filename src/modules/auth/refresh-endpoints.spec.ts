import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthController } from '@/modules/customer-auth/customer-auth.controller';
import { CustomerAuthService } from '@/modules/customer-auth/customer-auth.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './refresh-token.helper';

const config = { get: () => undefined } as unknown as ConfigService;
const jwt = { signAsync: jest.fn(async () => 'access-moi') } as unknown as JwtService;

function mkRes(): FastifyReply {
  return {
    setCookie: jest.fn(), clearCookie: jest.fn(),
  } as unknown as FastifyReply;
}

/** Một dòng refresh còn sống, khớp đúng token thô truyền vào. */
function songRow(ownerField: 'userId' | 'customerId', ownerId: number, raw: string) {
  return {
    id: 1, [ownerField]: ownerId, tokenHash: hashRefreshToken(raw),
    expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null,
  };
}

function mkDelegate(row: unknown) {
  return {
    findUnique: jest.fn(async () => row),
    create: jest.fn(async (a: { data: unknown }) => a.data),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
}

// ------------------------------------------------------------------ Nhân viên

describe('Nhân viên: /auth/refresh và logout', () => {
  const RAW = 'refresh-cua-nhan-vien';

  function mkService(userRow: unknown = { id: 7, isActive: true }) {
    const refreshToken = mkDelegate(songRow('userId', 7, RAW));
    const prisma = {
      refreshToken,
      user: { findUnique: jest.fn(async () => userRow) },
    } as unknown as PrismaService;
    const svc = new AuthService(
      prisma, jwt, { log: jest.fn() } as unknown as ActivityService,
    );
    return { svc, refreshToken };
  }

  it('đổi refresh lấy access mới VÀ refresh mới', async () => {
    const { svc, refreshToken } = mkService();
    const out = await svc.refresh(RAW);

    expect(out.token).toBe('access-moi');
    expect(out.refreshToken).toEqual(expect.any(String));
    expect(out.refreshToken).not.toBe(RAW);
    // cái cũ bị đánh dấu thu hồi, cái mới được ghi xuống
    expect(refreshToken.updateMany).toHaveBeenCalled();
    expect(refreshToken.create).toHaveBeenCalled();
  });

  /**
   * Tài khoản bị khoá giữa chừng: refresh token còn hợp lệ về mặt chữ ký/hạn
   * dùng nhưng KHÔNG được đổi ra access mới, nếu không khoá tài khoản chỉ có
   * hiệu lực sau 30 ngày.
   */
  it('tài khoản đã khoá thì không đổi được access mới', async () => {
    const { svc } = mkService({ id: 7, isActive: false });
    await expect(svc.refresh(RAW)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login trả kèm refreshToken bên cạnh access token', async () => {
    const refreshToken = mkDelegate(null);
    const prisma = {
      refreshToken,
      user: {
        findUnique: jest.fn(async () => ({
          id: 7, email: 'a@b.vn', fullName: 'A', roles: [], departmentId: null,
          department: null, canViewCompanyReport: false, mustChangePassword: false,
          isActive: true, passwordHash: bcrypt.hashSync('matkhau', 4),
        })),
      },
    } as unknown as PrismaService;
    const svc = new AuthService(
      prisma, jwt, { log: jest.fn() } as unknown as ActivityService,
    );
    const out = await svc.login('a@b.vn', 'matkhau');
    expect(out.refreshToken).toEqual(expect.any(String));
    expect(refreshToken.create).toHaveBeenCalled();
  });

  it('controller POST /auth/refresh trả cả hai token và đặt lại cookie access', async () => {
    const svc = {
      refresh: jest.fn(async () => ({ token: 'a1', refreshToken: 'r1' })),
    } as unknown as AuthService;
    const res = mkRes();

    const body = await new AuthController(svc, config).refresh({ refreshToken: RAW }, res);

    expect(body).toEqual({ token: 'a1', refreshToken: 'r1' });
    expect(res.setCookie).toHaveBeenCalledWith('access_token', 'a1', expect.anything());
  });

  it('controller logout thu hồi refresh token gửi kèm', async () => {
    const svc = { revokeRefresh: jest.fn(async () => undefined) } as unknown as AuthService;
    await new AuthController(svc, config).logout(mkRes(), { refreshToken: RAW });
    expect(svc.revokeRefresh).toHaveBeenCalledWith(RAW);
  });

  it('logout không kèm refresh token vẫn chạy (web chỉ dùng cookie)', async () => {
    const svc = { revokeRefresh: jest.fn(async () => undefined) } as unknown as AuthService;
    const res = mkRes();
    await expect(new AuthController(svc, config).logout(res, {})).resolves.toEqual({ ok: true });
    expect(res.clearCookie).toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------- Khách

describe('Khách hàng: /customer-auth/refresh và logout', () => {
  const RAW = 'refresh-cua-khach';

  function mkService(active = true) {
    const customerRefreshToken = mkDelegate(songRow('customerId', 9, RAW));
    const prisma = {
      customerRefreshToken,
      customerAccount: {
        findUnique: jest.fn(async () => ({ id: 9, isActive: active })),
      },
    } as unknown as PrismaService;
    const svc = new CustomerAuthService(
      prisma, {} as CustomerOtpService, jwt, config,
    );
    return { svc, customerRefreshToken };
  }

  it('đổi refresh lấy access mới VÀ refresh mới', async () => {
    const { svc, customerRefreshToken } = mkService();
    const out = await svc.refresh(RAW);

    expect(out.token).toBe('access-moi');
    expect(out.refreshToken).not.toBe(RAW);
    expect(customerRefreshToken.updateMany).toHaveBeenCalled();
    expect(customerRefreshToken.create).toHaveBeenCalled();
  });

  it('tài khoản khách đã khoá thì không đổi được access mới', async () => {
    const { svc } = mkService(false);
    await expect(svc.refresh(RAW)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  function mkController(auth: Partial<CustomerAuthService>) {
    return new CustomerAuthController(
      auth as CustomerAuthService, {} as CustomerOtpService, config,
    );
  }

  it('controller POST /customer-auth/refresh trả cả hai token và đặt lại cookie', async () => {
    const auth = { refresh: jest.fn(async () => ({ token: 'a2', refreshToken: 'r2' })) };
    const res = mkRes();

    const body = await mkController(auth as never).refresh({ refreshToken: RAW }, res);

    expect(body).toEqual({ token: 'a2', refreshToken: 'r2' });
    expect(res.setCookie).toHaveBeenCalledWith('customer_token', 'a2', expect.anything());
  });

  it('controller logout thu hồi refresh token gửi kèm và xoá cookie', async () => {
    const auth = { revokeRefresh: jest.fn(async () => undefined) };
    const res = mkRes();
    await mkController(auth as never).logout(res, { refreshToken: RAW });
    expect(auth.revokeRefresh).toHaveBeenCalledWith(RAW);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('khách login/pin trả kèm refreshToken', async () => {
    const customerRefreshToken = mkDelegate(null);
    const prisma = {
      customerRefreshToken,
      customerAccount: {
        findUnique: jest.fn(async () => ({
          id: 9, isActive: true, pinHash: bcrypt.hashSync('123456', 4),
        })),
        findUniqueOrThrow: jest.fn(async () => ({
          id: 9, email: 'k@b.vn', fullName: 'K', phone: null, pinHash: 'h', identities: [],
        })),
      },
    } as unknown as PrismaService;
    const svc = new CustomerAuthService(prisma, {} as CustomerOtpService, jwt, config);
    const out = await svc.loginPin({ email: 'k@b.vn', pin: '123456' });
    expect(out.refreshToken).toEqual(expect.any(String));
    expect(customerRefreshToken.create).toHaveBeenCalled();
  });
});
