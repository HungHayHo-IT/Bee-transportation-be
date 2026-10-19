import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';
import { signOtpTicket } from './otp-ticket.helper';

const jwt = new JwtService({ secret: 'test-secret' });

function mk(account: object | null = { id: 4, email: 'a@b.c', isActive: true }) {
  const findUnique = jest.fn().mockResolvedValue(account);
  const update = jest.fn().mockResolvedValue({ id: 4 });
  const prisma = { customerAccount: { findUnique, update } } as unknown as PrismaService;
  const svc = new CustomerAuthService(
    prisma,
    { send: jest.fn(), verify: jest.fn() } as unknown as CustomerOtpService,
    jwt,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { svc, update, findUnique };
}

const ticketFor = (email: string, purpose = 'reset_pin') => signOtpTicket(jwt, email, purpose);

describe('resetPin — quên PIN, đặt lại bằng vé, không cần đăng nhập trước', () => {
  it('vé hợp lệ thì ghi PIN mới cho đúng tài khoản', async () => {
    const { svc, update } = mk();
    await svc.resetPin({ ticket: await ticketFor('a@b.c'), newPin: '246802' });
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0][0].where).toEqual({ id: 4 });
  });

  it('PIN mới được băm, không lưu thô', async () => {
    const { svc, update } = mk();
    await svc.resetPin({ ticket: await ticketFor('a@b.c'), newPin: '246802' });
    const { pinHash } = update.mock.calls[0][0].data;
    expect(pinHash).not.toBe('246802');
    await expect(bcrypt.compare('246802', pinHash)).resolves.toBe(true);
  });

  it('tra tài khoản bằng email trong vé', async () => {
    const { svc, findUnique } = mk();
    await svc.resetPin({ ticket: await ticketFor('  A@B.C '), newPin: '246802' });
    expect(findUnique.mock.calls[0][0].where.email).toBe('a@b.c');
  });

  /** Vé đăng ký không được phép đổi PIN của tài khoản đang có. */
  it('vé register không đổi PIN được', async () => {
    const { svc, update } = mk();
    await expect(
      svc.resetPin({ ticket: await ticketFor('a@b.c', 'register'), newPin: '246802' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  it('vé hết hạn thì 401', async () => {
    const { svc } = mk();
    const expired = await jwt.signAsync(
      { sub: 'a@b.c', type: 'otp_ticket', purpose: 'reset_pin' }, { expiresIn: '-1s' },
    );
    await expect(svc.resetPin({ ticket: expired, newPin: '246802' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('email trong vé không còn tài khoản thì 401', async () => {
    const { svc, update } = mk(null);
    await expect(svc.resetPin({ ticket: await ticketFor('a@b.c'), newPin: '246802' }))
      .rejects.toThrow(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  /** Tài khoản bị khoá thì đổi PIN cũng vô nghĩa — và không nên báo khác đi. */
  it('tài khoản đã khoá thì 401', async () => {
    const { svc, update } = mk({ id: 4, email: 'a@b.c', isActive: false });
    await expect(svc.resetPin({ ticket: await ticketFor('a@b.c'), newPin: '246802' }))
      .rejects.toThrow(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });
});
