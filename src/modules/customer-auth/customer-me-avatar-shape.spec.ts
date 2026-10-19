import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';
import { CustomerProfileService } from './customer-profile.service';

const AVATAR = 'https://cdn.example/customer-avatars/7/0123abcd-4567-89ef-0123-456789abcdef.png';

const ROW = {
  id: 7,
  email: 'khach@example.com',
  fullName: 'Nguyễn Văn A',
  phone: '0900000000',
  pinHash: '$2b$10$hash',
  avatarUrl: AVATAR,
  identities: [{ provider: 'email' }],
};

function authSvc(row: object) {
  const prisma = {
    customerAccount: { findUniqueOrThrow: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  return new CustomerAuthService(
    prisma,
    {} as CustomerOtpService,
    new JwtService({ secret: 'test-secret' }),
    { get: () => undefined } as unknown as ConfigService,
  );
}

function profileSvc(row: object) {
  const prisma = {
    customerAccount: {
      update: jest.fn().mockResolvedValue(row),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
  } as unknown as PrismaService;
  return new CustomerProfileService(
    prisma,
    {} as CustomerOtpService,
    { get: () => undefined } as never,
    {} as ActivityService,
  );
}

/**
 * GET /customer-auth/me và PATCH /customer-auth/me phải trả CÙNG một hình dạng.
 * Trước đây hai chỗ tự dựng DTO riêng, thêm trường ở một chỗ mà quên chỗ kia là
 * FE đọc được avatar sau khi load nhưng mất nó ngay sau khi sửa hồ sơ.
 */
describe('CustomerMeDto — GET me và PATCH me cùng hình dạng', () => {
  it('hai đường trả cùng bộ trường, cùng giá trị', async () => {
    const fromGet = await authSvc(ROW).me({ id: 7 } as never);
    const fromPatch = await profileSvc(ROW).updateProfile(7, { fullName: 'Nguyễn Văn A' });
    expect(Object.keys(fromGet).sort()).toEqual(Object.keys(fromPatch).sort());
    expect(fromGet).toEqual(fromPatch);
  });

  it('cả hai đều có avatarUrl', async () => {
    expect((await authSvc(ROW).me({ id: 7 } as never)).avatarUrl).toBe(AVATAR);
    expect((await profileSvc(ROW).updateProfile(7, {})).avatarUrl).toBe(AVATAR);
  });

  /**
   * null chứ không undefined: undefined biến mất khi JSON.stringify nên client
   * không phân biệt được "chưa có ảnh" với "server phiên bản cũ chưa trả trường
   * này" — hai ca cần xử lý khác nhau.
   */
  it('chưa có ảnh thì trả null, không phải undefined', async () => {
    const row = { ...ROW, avatarUrl: null };
    for (const me of [
      await authSvc(row).me({ id: 7 } as never),
      await profileSvc(row).updateProfile(7, {}),
    ]) {
      expect(me.avatarUrl).toBeNull();
      expect(Object.keys(me)).toContain('avatarUrl');
      expect(JSON.parse(JSON.stringify(me))).toHaveProperty('avatarUrl', null);
    }
  });
});
