import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ActivityService } from '@/common/activity/activity.service';
import { isTestAccount, TEST_ACCOUNT_EMAILS } from '@/common/config/test-accounts.helper';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { AuthService } from './auth.service';

const mkUser = (email: string): AuthenticatedUser =>
  ({ id: 1, email, fullName: 'X', roles: ['admin'], departmentId: null,
     canViewCompanyReport: true, mustChangePassword: false }) as AuthenticatedUser;

function mk() {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        passwordHash: bcrypt.hashSync('matkhaucu', 4),
      }),
      update,
    },
  } as unknown as PrismaService;
  const svc = new AuthService(
    prisma,
    {} as JwtService,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
  );
  return { svc, update };
}

describe('isTestAccount', () => {
  it('nhận ra mọi email trong danh sách', () => {
    expect(TEST_ACCOUNT_EMAILS.length).toBeGreaterThan(0);
    for (const e of TEST_ACCOUNT_EMAILS) expect(isTestAccount(e)).toBe(true);
  });

  it('email thật thì không phải tài khoản test', () => {
    expect(isTestAccount('admin@beetransportation.vn')).toBe(false);
  });

  /** Email trong DB la citext, nen so sanh phai khong phan biet hoa thuong. */
  it('không phân biệt hoa thường', () => {
    expect(isTestAccount(TEST_ACCOUNT_EMAILS[0].toUpperCase())).toBe(true);
  });
});

/**
 * Cả team dùng chung bộ tài khoản này, nên một người đổi mật khẩu là những
 * người còn lại mất lối vào. Chặn ở service chứ không chỉ ở tài liệu.
 */
describe('AuthService.changePassword — tài khoản test bị khoá', () => {
  it('tài khoản test thì ném 403 và KHÔNG ghi gì vào DB', async () => {
    const { svc, update } = mk();
    await expect(
      svc.changePassword(mkUser(TEST_ACCOUNT_EMAILS[0]), 'matkhaucu', 'matkhaumoi'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  /** Chặn TRƯỚC khi kiểm mật khẩu cũ: không cho dò mật khẩu qua thông điệp lỗi. */
  it('chặn kể cả khi gõ sai mật khẩu hiện tại', async () => {
    const { svc } = mk();
    await expect(
      svc.changePassword(mkUser(TEST_ACCOUNT_EMAILS[0]), 'sai-bet', 'matkhaumoi'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('tài khoản thật vẫn đổi được mật khẩu bình thường', async () => {
    const { svc, update } = mk();
    await expect(
      svc.changePassword(mkUser('admin@beetransportation.vn'), 'matkhaucu', 'matkhaumoi'),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
