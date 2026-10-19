import { ConfigService } from '@nestjs/config';

/** Phiên sống 12 giờ — khớp JWT_EXPIRES_IN mặc định, cookie không được sống lâu hơn token. */
const TWELVE_HOURS = 12 * 60 * 60;

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

/**
 * Một nguồn sự thật cho cookie phiên (nhân viên lẫn khách hàng). Trước đây hai
 * controller tự đọc COOKIE_SECURE với hai cách hiểu ngược nhau (`!== 'false'`
 * và `=== 'true'`), nên cùng một môi trường lại ra hai kết quả trái ngược:
 * cookie khách bị gắn Secure và bị trình duyệt/app vứt, cookie nhân viên thì
 * không — đăng nhập khách hỏng còn đăng nhập nhân viên vẫn chạy, rất khó lần ra.
 *
 * Nhận CẢ boolean `true` lẫn chuỗi `'true'`, và đó không phải sự dễ dãi.
 * ConfigModule chạy biến môi trường qua schema Joi, mà `Joi.boolean()` ĐỔI
 * chuỗi 'true' thành boolean `true`. Bản cũ chỉ so sánh `=== 'true'` nên trong
 * app thật nó luôn sai: cờ Secure KHÔNG THỂ bật được dù đặt biến thế nào, kể
 * cả khi dùng giá trị mặc định của schema. Đã đo trên production — đặt
 * COOKIE_SECURE=true, khởi động lại, cookie trả về vẫn không có Secure.
 *
 * Mọi giá trị khác đều là TẮT: 'yes', '1', chuỗi rỗng, hay thiếu hẳn. Hỏng về
 * phía tắt thì đăng nhập vẫn chạy và người ta còn đọc được log; hỏng về phía
 * bật thì cookie bị trình duyệt vứt im lặng và không ai vào được.
 */
export function sessionCookieOptions(config: ConfigService): SessionCookieOptions {
  const co = config.get<string | boolean>('COOKIE_SECURE');
  return {
    httpOnly: true,
    secure: co === true || co === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: TWELVE_HOURS,
  };
}
