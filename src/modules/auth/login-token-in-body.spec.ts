import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { CustomerAuthController } from '@/modules/customer-auth/customer-auth.controller';
import { CustomerAuthService } from '@/modules/customer-auth/customer-auth.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const config = { get: () => undefined } as unknown as ConfigService;

type Cookie = { name: string; value: string; opts: { secure?: boolean } };

function mkRes(): { res: FastifyReply; cookies: Cookie[] } {
  const cookies: Cookie[] = [];
  const res = {
    setCookie: (name: string, value: string, opts: { secure?: boolean }) => {
      cookies.push({ name, value, opts });
    },
  } as unknown as FastifyReply;
  return { res, cookies };
}

const STAFF_ME = { id: 1, email: 'a@b.vn' } as never;
const CUSTOMER_ME = { id: 9, email: 'k@b.vn' } as never;

/**
 * Cookie là httpOnly nên client không-phải-trình-duyệt (app mobile) không có
 * cách nào đọc được token ra để gắn vào header Authorization. Trả kèm token
 * trong body là đường duy nhất để các client đó đăng nhập được — vẫn đúng token
 * đang nằm trong cookie, không phát sinh phiên mới.
 */
describe('Đăng nhập trả token trong body cho client không đọc được cookie', () => {
  it('staff POST /auth/login trả token y hệt token trong cookie', async () => {
    const svc = { login: jest.fn().mockResolvedValue({ token: 'tok-staff', me: STAFF_ME }) };
    const controller = new AuthController(svc as unknown as AuthService, config);
    const { res, cookies } = mkRes();

    const body = await controller.login({ email: 'a@b.vn', password: 'x' }, res);

    expect(body.token).toBe('tok-staff');
    expect(cookies[0].value).toBe('tok-staff');
  });

  it('staff vẫn trả nguyên hồ sơ người dùng cạnh token', async () => {
    const svc = { login: jest.fn().mockResolvedValue({ token: 't', me: STAFF_ME }) };
    const controller = new AuthController(svc as unknown as AuthService, config);
    const body = await controller.login({ email: 'a@b.vn', password: 'x' }, mkRes().res);
    expect(body.id).toBe(1);
  });

  function mkCustomer(token: string) {
    const auth = {
      loginPin: jest.fn().mockResolvedValue({ token, me: CUSTOMER_ME }),
      loginGoogle: jest.fn().mockResolvedValue({ token, me: CUSTOMER_ME }),
      register: jest.fn().mockResolvedValue({ token, me: CUSTOMER_ME }),
    };
    return new CustomerAuthController(
      auth as unknown as CustomerAuthService,
      {} as CustomerOtpService,
      config,
    );
  }

  it('khách login/pin trả token trong body', async () => {
    const { res, cookies } = mkRes();
    const body = await mkCustomer('tok-pin').loginPin({ email: 'k@b.vn', pin: '123456' }, res);
    expect(body.token).toBe('tok-pin');
    expect(cookies[0].value).toBe('tok-pin');
  });

  it('khách login/google trả token trong body', async () => {
    const body = await mkCustomer('tok-gg').loginGoogle({ idToken: 'x'.repeat(30) }, mkRes().res);
    expect(body.token).toBe('tok-gg');
  });

  it('khách register trả token trong body', async () => {
    const body = await mkCustomer('tok-reg').register(
      { ticket: 'v', pin: '123456' },
      mkRes().res,
    );
    expect(body.token).toBe('tok-reg');
  });

  /**
   * Đây là lỗi đã xảy ra thật: hai controller mặc định ngược nhau nên app mobile
   * đăng nhập được bằng tài khoản nhân viên mà không đăng nhập được bằng tài
   * khoản khách. Khoá lại bằng test để không lệch lần nữa.
   */
  it('thiếu COOKIE_SECURE thì cookie khách và cookie nhân viên cùng secure = false', async () => {
    const staffRes = mkRes();
    const svc = { login: jest.fn().mockResolvedValue({ token: 't', me: STAFF_ME }) };
    await new AuthController(svc as unknown as AuthService, config)
      .login({ email: 'a@b.vn', password: 'x' }, staffRes.res);

    const custRes = mkRes();
    await mkCustomer('t').loginPin({ email: 'k@b.vn', pin: '123456' }, custRes.res);

    expect(staffRes.cookies[0].opts.secure).toBe(false);
    expect(custRes.cookies[0].opts.secure).toBe(false);
  });
});
