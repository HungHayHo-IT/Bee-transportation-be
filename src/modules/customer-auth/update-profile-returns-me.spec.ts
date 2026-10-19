import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from './customer-otp.service';
import { CustomerProfileService } from './customer-profile.service';

const ROW = {
  id: 7,
  email: 'khach@example.com',
  fullName: 'Nguyễn Văn A',
  phone: '0900000000',
  pinHash: '$2b$10$hash',
  identities: [{ provider: 'email' }, { provider: 'google' }, { provider: 'email' }],
};

function mk(row: typeof ROW = ROW) {
  const update = jest.fn().mockResolvedValue(row);
  const findUniqueOrThrow = jest.fn().mockResolvedValue(row);
  const prisma = {
    customerAccount: { update, findUniqueOrThrow },
  } as unknown as PrismaService;
  const svc = new CustomerProfileService(
    prisma,
    {} as CustomerOtpService,
    { get: () => undefined } as never,
    {} as ActivityService,
  );
  return { svc, update, findUniqueOrThrow };
}

/**
 * PATCH /customer-auth/me trước đây trả 204 nên client buộc phải gọi thêm
 * GET /customer-auth/me để biết hồ sơ vừa đổi thành gì — một vòng mạng thừa và
 * một khoảng thời gian màn hình hiển thị dữ liệu cũ. Service phải trả thẳng hồ sơ.
 */
describe('CustomerProfileService.updateProfile — trả hồ sơ sau khi cập nhật', () => {
  it('trả về CustomerMeDto đầy đủ, không phải undefined', async () => {
    const { svc } = mk();
    const me = await svc.updateProfile(7, { fullName: 'Nguyễn Văn A' });
    expect(me).toEqual({
      id: 7,
      email: 'khach@example.com',
      fullName: 'Nguyễn Văn A',
      phone: '0900000000',
      avatarUrl: null,
      hasPin: true,
      providers: ['email', 'google'],
    });
  });

  /** Không lộ pinHash ra ngoài — chỉ cờ boolean. */
  it('không kèm pinHash trong kết quả', async () => {
    const { svc } = mk();
    const me = await svc.updateProfile(7, { fullName: 'A' });
    expect(me as unknown as Record<string, unknown>).not.toHaveProperty('pinHash');
  });

  it('tài khoản chưa đặt PIN thì hasPin = false', async () => {
    const { svc } = mk({ ...ROW, pinHash: null } as unknown as typeof ROW);
    const me = await svc.updateProfile(7, { fullName: 'A' });
    expect(me.hasPin).toBe(false);
  });

  /**
   * Body rỗng vẫn là một lần đọc hồ sơ hợp lệ: client dùng cùng một response
   * shape cho mọi lần gọi, không được nhận undefined chỉ vì không có gì để đổi.
   */
  it('không có trường nào để đổi thì vẫn trả hồ sơ hiện tại và không gọi update', async () => {
    const { svc, update, findUniqueOrThrow } = mk();
    const me = await svc.updateProfile(7, {});
    expect(update).not.toHaveBeenCalled();
    expect(findUniqueOrThrow).toHaveBeenCalled();
    expect(me.id).toBe(7);
  });

  it('phone rỗng được chuẩn hoá thành null khi gửi xuống Prisma', async () => {
    const { svc, update } = mk();
    await svc.updateProfile(7, { phone: '   ' });
    expect(update.mock.calls[0][0].data).toEqual({ phone: null });
  });
});
