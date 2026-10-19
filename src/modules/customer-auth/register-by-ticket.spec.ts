import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';
import { signOtpTicket } from './otp-ticket.helper';

const jwt = new JwtService({ secret: 'test-secret' });

function mk(existingAccount: object | null = null) {
  const created = {
    id: 9, email: 'moi@b.c', fullName: 'Người Mới', phone: null,
    pinHash: 'x', identities: [{ provider: 'email' }],
  };
  const findUnique = jest.fn().mockResolvedValue(existingAccount);
  const create = jest.fn().mockResolvedValue(created);
  const findUniqueOrThrow = jest.fn().mockResolvedValue(created);
  const prisma = {
    customerAccount: { findUnique, create, findUniqueOrThrow },
    // register tự đăng nhập luôn cho khách nên nó cấp cả refresh token — thiếu
    // bảng này trong Prisma giả thì test đỏ vì fixture, không phải vì hành vi.
    customerRefreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  const svc = new CustomerAuthService(
    prisma,
    { send: jest.fn(), verify: jest.fn() } as unknown as CustomerOtpService,
    jwt,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { svc, create, findUnique };
}

const ticketFor = (email: string, purpose = 'register') => signOtpTicket(jwt, email, purpose);

describe('register — đổi vé lấy tài khoản', () => {
  it('vé hợp lệ thì tạo tài khoản và cấp token đăng nhập', async () => {
    const { svc, create } = mk(null);
    const res = await svc.register({ ticket: await ticketFor('moi@b.c'), pin: '135790' });
    expect(create).toHaveBeenCalled();
    expect(res.token).toEqual(expect.any(String));
    expect(res.me.email).toBe('moi@b.c');
  });

  /**
   * Lý do email nằm trong vé chứ không nằm trong body: không có đường nào để
   * client verify hòm mail của mình rồi mở tài khoản mang tên người khác.
   */
  it('email lấy từ vé, tài khoản tạo ra mang đúng email đã xác thực', async () => {
    const { svc, create } = mk(null);
    await svc.register({ ticket: await ticketFor('  NGUOITHAT@X.VN '), pin: '135790' });
    expect(create.mock.calls[0][0].data.email).toBe('nguoithat@x.vn');
  });

  it('đánh dấu email đã xác thực ngay lúc tạo', async () => {
    const { svc, create } = mk(null);
    await svc.register({ ticket: await ticketFor('moi@b.c'), pin: '135790' });
    expect(create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('PIN được băm, không lưu thô', async () => {
    const { svc, create } = mk(null);
    await svc.register({ ticket: await ticketFor('moi@b.c'), pin: '135790' });
    const { pinHash } = create.mock.calls[0][0].data;
    expect(pinHash).not.toBe('135790');
    await expect(bcrypt.compare('135790', pinHash)).resolves.toBe(true);
  });

  it('nhận tên và số điện thoại kèm theo nếu có', async () => {
    const { svc, create } = mk(null);
    await svc.register({
      ticket: await ticketFor('moi@b.c'), pin: '135790',
      fullName: '  Nguyễn Linh ', phone: ' 0977856665 ',
    });
    expect(create.mock.calls[0][0].data.fullName).toBe('Nguyễn Linh');
    expect(create.mock.calls[0][0].data.phone).toBe('0977856665');
  });

  /** Lớp chặn trùng thứ ba: hai request cùng vé, hoặc tạo xen vào phút chót. */
  it('email đã có tài khoản thì 409, không tạo thêm', async () => {
    const { svc, create } = mk({ id: 1 });
    await expect(svc.register({ ticket: await ticketFor('moi@b.c'), pin: '135790' }))
      .rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('vé reset_pin không đăng ký được', async () => {
    const { svc, create } = mk(null);
    await expect(
      svc.register({ ticket: await ticketFor('moi@b.c', 'reset_pin'), pin: '135790' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
  });

  it('vé hết hạn thì 401', async () => {
    const { svc } = mk(null);
    const expired = await jwt.signAsync(
      { sub: 'moi@b.c', type: 'otp_ticket', purpose: 'register' }, { expiresIn: '-1s' },
    );
    await expect(svc.register({ ticket: expired, pin: '135790' }))
      .rejects.toThrow(UnauthorizedException);
  });
});
