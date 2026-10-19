import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';
import { readOtpTicket } from './otp-ticket.helper';

const jwt = new JwtService({ secret: 'test-secret' });

function mk(existingAccount: object | null = null) {
  const findUnique = jest.fn().mockResolvedValue(existingAccount);
  const prisma = { customerAccount: { findUnique } } as unknown as PrismaService;
  const send = jest.fn().mockResolvedValue({ resendAfter: 60 });
  const verify = jest.fn().mockResolvedValue(true);
  const otp = { send, verify } as unknown as CustomerOtpService;

  const svc = new CustomerAuthService(
    prisma, otp, jwt, { get: () => undefined } as unknown as ConfigService,
  );
  return { svc, send, verify, findUnique };
}

const ACCOUNT = { id: 1, email: 'a@b.c', isActive: true };

describe('sendOtp — chặn email trùng ngay từ bước nhập email', () => {
  /**
   * Chốt sớm nhất trong ba lớp. Không có nó, khách gõ email đã đăng ký vẫn
   * nhận mail, gõ OTP, gõ PIN, rồi mới bị báo trùng ở bước cuối.
   */
  it('email đã có tài khoản thì không gửi mã đăng ký', async () => {
    const { svc, send } = mk(ACCOUNT);
    await expect(svc.sendOtp('a@b.c', 'register')).rejects.toThrow(ConflictException);
    expect(send).not.toHaveBeenCalled();
  });

  it('email chưa có tài khoản thì gửi mã bình thường', async () => {
    const { svc, send } = mk(null);
    await expect(svc.sendOtp('moi@b.c', 'register')).resolves.toEqual({ resendAfter: 60 });
    expect(send).toHaveBeenCalledWith('moi@b.c', 'register');
  });

  /** Quên PIN thì tài khoản PHẢI tồn tại — chốt trùng chỉ áp cho register. */
  it('purpose reset_pin vẫn gửi cho email đã có tài khoản', async () => {
    const { svc, send } = mk(ACCOUNT);
    await expect(svc.sendOtp('a@b.c', 'reset_pin')).resolves.toBeDefined();
    expect(send).toHaveBeenCalledWith('a@b.c', 'reset_pin');
  });
});

describe('verifyOtp — đốt mã và phát vé', () => {
  it('purpose register: mã đúng thì trả vé đọc được ra email', async () => {
    const { svc, verify } = mk(null);
    const res = await svc.verifyOtp('a@b.c', 'register', '123456');
    expect(verify).toHaveBeenCalledWith('a@b.c', 'register', '123456');
    expect(res.ok).toBe(true);
    await expect(readOtpTicket(jwt, res.ticket!, 'register')).resolves.toBe('a@b.c');
  });

  it('purpose reset_pin cũng được phát vé', async () => {
    const { svc } = mk(ACCOUNT);
    const res = await svc.verifyOtp('a@b.c', 'reset_pin', '123456');
    await expect(readOtpTicket(jwt, res.ticket!, 'reset_pin')).resolves.toBe('a@b.c');
  });

  /** change_email xử lý ở luồng khác, không có bước cuối nào cần vé. */
  it('purpose change_email thì không phát vé', async () => {
    const { svc } = mk(ACCOUNT);
    const res = await svc.verifyOtp('a@b.c', 'change_email', '123456');
    expect(res).toEqual({ ok: true });
  });

  /** Tài khoản tạo xen giữa send và verify — lớp chặn thứ hai. */
  it('register: tài khoản xuất hiện giữa chừng thì không phát vé', async () => {
    const { svc } = mk(ACCOUNT);
    await expect(svc.verifyOtp('a@b.c', 'register', '123456'))
      .rejects.toThrow(ConflictException);
  });

  it('mã sai thì lỗi bật lên từ tầng OTP, không có vé nào', async () => {
    const { svc, verify } = mk(null);
    verify.mockRejectedValue(new Error('Mã không đúng'));
    await expect(svc.verifyOtp('a@b.c', 'register', '000000')).rejects.toThrow('Mã không đúng');
  });
});
