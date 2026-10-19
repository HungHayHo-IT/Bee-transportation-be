import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { sessionCookieOptions } from './session-cookie';

function cfg(value?: string | boolean): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

/**
 * Trước đây cookie khách dùng `!== 'false'` còn cookie nhân viên dùng
 * `=== 'true'`: cùng một biến môi trường mà ra hai kết quả trái ngược. Trên
 * production (đang chạy http, chưa có TLS) biến không được đặt nên cookie khách
 * bị gắn Secure và bị vứt, còn cookie nhân viên thì không. Một nguồn sự thật
 * duy nhất mới chặn được kiểu lệch này tái diễn.
 */
describe('sessionCookieOptions — một nguồn sự thật cho cờ Secure', () => {
  it('thiếu COOKIE_SECURE thì secure = false, vì prod đang phục vụ qua http', () => {
    expect(sessionCookieOptions(cfg(undefined)).secure).toBe(false);
  });

  it("COOKIE_SECURE='true' mới bật Secure", () => {
    expect(sessionCookieOptions(cfg('true')).secure).toBe(true);
  });

  it("COOKIE_SECURE='false' thì tắt", () => {
    expect(sessionCookieOptions(cfg('false')).secure).toBe(false);
  });

  it('giá trị rác không được hiểu thành bật', () => {
    expect(sessionCookieOptions(cfg('yes')).secure).toBe(false);
  });

  /**
   * ĐÂY LÀ ĐƯỜNG THẬT, và nó từng im lặng hỏng suốt.
   *
   * ConfigModule chạy qua schema Joi, mà `Joi.boolean()` ĐỔI chuỗi 'true'
   * thành boolean `true`. Nên trong app thật `config.get('COOKIE_SECURE')`
   * không bao giờ trả về chuỗi — so sánh `=== 'true'` luôn sai, và cờ Secure
   * không thể bật được dù đặt biến môi trường thế nào. Đã đo trên production:
   * đặt COOKIE_SECURE=true, khởi động lại, cookie vẫn không có Secure.
   */
  it('nhận boolean true — dạng mà Joi thật sự trả về', () => {
    expect(sessionCookieOptions(cfg(true)).secure).toBe(true);
  });

  it('boolean false thì tắt', () => {
    expect(sessionCookieOptions(cfg(false)).secure).toBe(false);
  });

  it('các thuộc tính còn lại giống nhau cho mọi phiên: httpOnly, path, sameSite, 12h', () => {
    const o = sessionCookieOptions(cfg(undefined));
    expect(o.httpOnly).toBe(true);
    expect(o.path).toBe('/');
    expect(o.sameSite).toBe('lax');
    expect(o.maxAge).toBe(12 * 60 * 60);
  });
});

/**
 * GOOGLE_CLIENT_ID vắng mặt trong .env.example là lý do production dựng lên mà
 * thiếu nó và /customer-auth/login/google trả 400. Biến nào bắt buộc phải biết
 * thì phải nằm trong file mẫu, nếu không người dựng môi trường không có cách
 * nào đoán ra.
 */
describe('.env.example — khai báo đủ biến ảnh hưởng tới đăng nhập', () => {
  const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

  it('có GOOGLE_CLIENT_ID', () => {
    expect(env).toMatch(/^GOOGLE_CLIENT_ID=/m);
  });

  it('có COOKIE_SECURE', () => {
    expect(env).toMatch(/^COOKIE_SECURE=/m);
  });
});
