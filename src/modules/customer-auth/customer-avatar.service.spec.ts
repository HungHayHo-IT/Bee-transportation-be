import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAvatarS3Service } from './customer-avatar-s3.service';
import { CustomerAvatarService } from './customer-avatar.service';

const KEY7 = `customer-avatars/7/${'0123abcd-4567-89ef-0123-456789abcdef'}.png`;
const URL7 = `https://cdn.example/${KEY7}`;

const ROW = {
  id: 7,
  email: 'khach@example.com',
  fullName: 'Nguyễn Văn A',
  phone: null,
  pinHash: '$2b$10$hash',
  avatarUrl: URL7,
  identities: [{ provider: 'email' }],
};

function mk() {
  const update = jest.fn().mockResolvedValue(ROW);
  const prisma = { customerAccount: { update } } as unknown as PrismaService;
  const s3 = {
    isEnabled: () => true,
    presignAvatar: jest.fn().mockResolvedValue({ key: KEY7, publicUrl: URL7 }),
    publicUrlForOwnedKey: jest.fn((id: number, key: string) => {
      if (!key.startsWith(`customer-avatars/${id}/`))
        throw new BadRequestException('Key không thuộc về bạn');
      return `https://cdn.example/${key}`;
    }),
  } as unknown as CustomerAvatarS3Service;
  return { svc: new CustomerAvatarService(prisma, s3), update, s3 };
}

/**
 * id chủ ảnh lấy từ @CurrentCustomer chứ không bao giờ từ body — test này khoá
 * lại điều đó ở tầng service: key trỏ sang khách khác thì phải chết TRƯỚC khi
 * chạm tới Prisma.
 */
describe('CustomerAvatarService.setAvatar — chỉ đổi được ảnh của mình', () => {
  it('key thuộc khách khác thì từ chối và không ghi DB', async () => {
    const { svc, update } = mk();
    const alien = `customer-avatars/8/${'0123abcd-4567-89ef-0123-456789abcdef'}.png`;
    await expect(svc.setAvatar(7, alien)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * Lưu URL do SERVER dựng từ key, không lưu URL client gửi lên: nhận URL tự do
   * là để khách trỏ avatar sang máy chủ bất kỳ (theo dõi người xem, hoặc nhét
   * nội dung khác vào chỗ ai cũng thấy).
   */
  it('URL lưu xuống DB do server dựng từ key', async () => {
    const { svc, update } = mk();
    await svc.setAvatar(7, KEY7);
    expect(update.mock.calls[0][0].data).toEqual({ avatarUrl: URL7 });
    expect(update.mock.calls[0][0].where).toEqual({ id: 7 });
  });

  it('trả về CustomerMeDto kèm avatarUrl', async () => {
    const { svc } = mk();
    const me = await svc.setAvatar(7, KEY7);
    expect(me.avatarUrl).toBe(URL7);
    expect(me as unknown as Record<string, unknown>).not.toHaveProperty('pinHash');
  });
});

describe('CustomerAvatarService.clearAvatar', () => {
  it('xoá ảnh thì ghi null và DTO trả null (không phải undefined)', async () => {
    const { svc, update } = mk();
    update.mockResolvedValueOnce({ ...ROW, avatarUrl: null });
    const me = await svc.clearAvatar(7);
    expect(update.mock.calls[0][0].data).toEqual({ avatarUrl: null });
    expect(me.avatarUrl).toBeNull();
    expect(Object.keys(me)).toContain('avatarUrl');
  });
});

describe('CustomerAvatarService.presign', () => {
  it('chuyển thẳng id phiên xuống S3 service', async () => {
    const { svc, s3 } = mk();
    await svc.presign(7, 'a.png', 'image/png');
    expect((s3.presignAvatar as jest.Mock).mock.calls[0].slice(0, 3))
      .toEqual([7, 'a.png', 'image/png']);
  });
});
