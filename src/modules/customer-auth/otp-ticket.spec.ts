import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { readOtpTicket, signOtpTicket } from './otp-ticket.helper';

const jwt = new JwtService({ secret: 'test-secret' });

describe('Vé OTP — cầu nối giữa bước verify và bước cuối', () => {
  it('ký vé rồi đọc lại ra đúng email', async () => {
    const ticket = await signOtpTicket(jwt, 'a@b.c', 'register');
    await expect(readOtpTicket(jwt, ticket, 'register')).resolves.toBe('a@b.c');
  });

  /**
   * Chốt chính của thiết kế: email nằm TRONG vé, không do client gửi. Verify
   * email này rồi đăng ký cho email khác là bất khả.
   */
  it('email lấy từ vé chứ không phải từ client', async () => {
    const ticket = await signOtpTicket(jwt, 'nguoithat@b.c', 'register');
    const decoded = jwt.decode(ticket) as { sub: string };
    expect(decoded.sub).toBe('nguoithat@b.c');
  });

  it('chuẩn hoá hoa/thường và khoảng trắng khi ký', async () => {
    const ticket = await signOtpTicket(jwt, '  HOA@X.VN  ', 'register');
    await expect(readOtpTicket(jwt, ticket, 'register')).resolves.toBe('hoa@x.vn');
  });

  /** Vé đăng ký không được phép đi đổi PIN — và ngược lại. */
  it('vé sai purpose thì từ chối', async () => {
    const ticket = await signOtpTicket(jwt, 'a@b.c', 'register');
    await expect(readOtpTicket(jwt, ticket, 'reset_pin')).rejects.toThrow(UnauthorizedException);
  });

  it('vé reset_pin không dùng để đăng ký được', async () => {
    const ticket = await signOtpTicket(jwt, 'a@b.c', 'reset_pin');
    await expect(readOtpTicket(jwt, ticket, 'register')).rejects.toThrow(UnauthorizedException);
  });

  /**
   * Cookie đăng nhập khách ký cùng JWT_SECRET, chỉ khác `type`. Không chặn thì
   * một cookie hợp lệ biến thành vé đặt lại PIN của chính mình — hoặc tệ hơn,
   * của người khác nếu `sub` bị đọc nhầm sang email.
   */
  it('token khác loại (cookie đăng nhập) không dùng làm vé được', async () => {
    const cookie = await jwt.signAsync({ sub: 7, type: 'customer' });
    await expect(readOtpTicket(jwt, cookie, 'register')).rejects.toThrow(UnauthorizedException);
  });

  it('vé hết hạn thì từ chối', async () => {
    const expired = await jwt.signAsync(
      { sub: 'a@b.c', type: 'otp_ticket', purpose: 'register' },
      { expiresIn: '-1s' },
    );
    await expect(readOtpTicket(jwt, expired, 'register')).rejects.toThrow(UnauthorizedException);
  });

  it('chuỗi rác không phải JWT thì từ chối', async () => {
    await expect(readOtpTicket(jwt, 'khong-phai-jwt', 'register'))
      .rejects.toThrow(UnauthorizedException);
  });

  it('vé sống 10 phút', async () => {
    const ticket = await signOtpTicket(jwt, 'a@b.c', 'register');
    const { iat, exp } = jwt.decode(ticket) as { iat: number; exp: number };
    expect(exp - iat).toBe(600);
  });
});
