import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';

/**
 * Đo trên production: gửi một chuỗi bất kỳ vào POST /customer-auth/login/google
 * trả về 500 "Lỗi hệ thống". Stack trace trong log chỉ thẳng
 * `OAuth2Client.verifyIdTokenAsync` — thư viện Google ném khi token không giải
 * mã được, và không ai bắt, nên nó văng ra thành lỗi hệ thống.
 *
 * Hậu quả: app mobile cầm một token hết hạn không tài nào phân biệt được
 * "token của tôi hỏng, xin cái mới" với "server đang chết, thử lại sau".
 * Đúng chỗ đó quyết định app hiển thị gì cho người dùng.
 */
function mk(googleClientId: string | undefined, verify: () => Promise<unknown>) {
  const svc = new CustomerAuthService(
    { customerAccount: { findUnique: jest.fn() } } as unknown as PrismaService,
    { send: jest.fn(), verify: jest.fn() } as unknown as CustomerOtpService,
    new JwtService({ secret: 'test-secret' }),
    { get: () => googleClientId } as unknown as ConfigService,
  );
  // OAuth2Client thật gọi ra mạng; thay bằng bản giả để đo đúng cách xử lý lỗi.
  (svc as unknown as { google: { verifyIdToken: () => Promise<unknown> } }).google = {
    verifyIdToken: verify,
  };
  return svc;
}

describe('login/google — token hỏng phải là 401, không phải 500', () => {
  it('thư viện Google ném thì trả UnauthorizedException', async () => {
    const svc = mk('abc.apps.googleusercontent.com', () =>
      Promise.reject(new Error('Wrong number of segments in token')));
    await expect(svc.loginGoogle({ idToken: 'khong-phai-token' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** Không nói kỹ hơn mức cần: chi tiết lỗi của thư viện là chuyện nội bộ. */
  it('không rò thông điệp nội bộ của thư viện ra ngoài', async () => {
    const svc = mk('abc.apps.googleusercontent.com', () =>
      Promise.reject(new Error('Wrong number of segments in token')));
    const err = await svc.loginGoogle({ idToken: 'x' }).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).not.toContain('segments');
  });

  /** Ca payload thiếu trường vốn đã đúng — giữ nguyên, đừng làm hồi quy. */
  it('token giải mã được nhưng thiếu sub/email vẫn là 401', async () => {
    const svc = mk('abc.apps.googleusercontent.com', () =>
      Promise.resolve({ getPayload: () => ({ email: 'a@b.c' }) }));
    await expect(svc.loginGoogle({ idToken: 'x' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * Thiếu cấu hình là lỗi của NGƯỜI VẬN HÀNH, không phải của token khách gửi.
   * Gộp nó vào 401 thì app sẽ bảo khách "đăng nhập lại" mãi trong khi thứ cần
   * làm là đặt biến môi trường.
   */
  it('thiếu GOOGLE_CLIENT_ID vẫn là 400, không bị gộp vào 401', async () => {
    const svc = mk('', () => Promise.resolve({ getPayload: () => ({}) }));
    await expect(svc.loginGoogle({ idToken: 'x' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
