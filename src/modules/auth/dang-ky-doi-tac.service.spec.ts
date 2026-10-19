import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { signOtpTicket } from '@/modules/customer-auth/otp-ticket.helper';
import { DangKyDoiTacService, MUC_DICH_DOI_TAC } from './dang-ky-doi-tac.service';

const jwt = new JwtService({ secret: 'bi-mat-thu' });

function dung(daCoEmail: string | null = null) {
  const create = jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(where.email === daCoEmail ? { id: 9 } : null)),
      create,
    },
  } as unknown as PrismaService;
  const send = jest.fn(() => Promise.resolve({ resendAfter: 60 }));
  const verify = jest.fn(() => Promise.resolve(true));
  const otp = { send, verify } as unknown as CustomerOtpService;
  return { s: new DangKyDoiTacService(prisma, otp, jwt), create, send, verify };
}

describe('DangKyDoiTacService', () => {
  it('email ngoài tên miền bị từ chối và KHÔNG gửi mã đi đâu cả', async () => {
    const { s, send } = dung();
    await expect(s.guiMa('ai.do@gmail.com')).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('tên miền chỉ kết thúc giống cũng bị từ chối', async () => {
    const { s, send } = dung();
    await expect(s.guiMa('gia@notbeelogistics.com')).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('email đã có tài khoản thì dừng TRƯỚC khi gửi mã', async () => {
    const { s, send } = dung('an@beelogistics.com');
    await expect(s.guiMa('an@beelogistics.com')).rejects.toBeInstanceOf(ConflictException);
    expect(send).not.toHaveBeenCalled();
  });

  it('email hợp lệ thì gửi mã với ĐÚNG mục đích riêng, không dùng chung "register"', async () => {
    const { s, send } = dung();
    await s.guiMa('  An@BeeLogistics.com ');
    expect(send).toHaveBeenCalledWith('an@beelogistics.com', MUC_DICH_DOI_TAC);
    expect(MUC_DICH_DOI_TAC).not.toBe('register');
  });

  it('tạo tài khoản lấy email TỪ VÉ, không từ tham số nào khác', async () => {
    const { s, create } = dung();
    const ve = await signOtpTicket(jwt, 'an@beelogistics.com', MUC_DICH_DOI_TAC);
    const kq = await s.taoTaiKhoan(ve, 'Nguyễn Văn An', 'matkhaudai123');
    expect(kq.email).toBe('an@beelogistics.com');
    expect(create).toHaveBeenCalled();
  });

  it('tài khoản tạo ra CHỈ có vai trò partner và KHÔNG thuộc phòng ban nào', async () => {
    const { s, create } = dung();
    const ve = await signOtpTicket(jwt, 'an@beelogistics.com', MUC_DICH_DOI_TAC);
    await s.taoTaiKhoan(ve, 'An', 'matkhaudai123');
    const data = create.mock.calls[0][0].data as { roles: string[]; departmentId: null };
    expect(data.roles).toEqual([Role.PARTNER]);
    expect(data.departmentId).toBeNull();
  });

  it('mật khẩu được băm, không bao giờ ghi thẳng', async () => {
    const { s, create } = dung();
    const ve = await signOtpTicket(jwt, 'an@beelogistics.com', MUC_DICH_DOI_TAC);
    await s.taoTaiKhoan(ve, 'An', 'matkhaudai123');
    const data = create.mock.calls[0][0].data as { passwordHash: string };
    expect(data.passwordHash).not.toContain('matkhaudai123');
    expect(data.passwordHash.startsWith('$2')).toBe(true);
  });

  it('vé xin cho VIỆC KHÁC không tiêu được ở đây', async () => {
    const { s } = dung();
    const veKhach = await signOtpTicket(jwt, 'an@beelogistics.com', 'register');
    await expect(s.taoTaiKhoan(veKhach, 'An', 'matkhaudai123')).rejects.toThrow();
  });

  it('vé mang email ngoài tên miền vẫn bị chặn ở bước cuối', async () => {
    const { s, create } = dung();
    const veXau = await signOtpTicket(jwt, 'ai.do@gmail.com', MUC_DICH_DOI_TAC);
    await expect(s.taoTaiKhoan(veXau, 'Ai Đó', 'matkhaudai123'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
