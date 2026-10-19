/**
 * Lấy token nhân viên THÔ ra khỏi một request, không xác thực gì cả.
 *
 * Dùng cho các handler gắn `@Public()` nhưng vẫn muốn biết người gọi có đăng
 * nhập hay không. Guard toàn cục bị `@Public()` bỏ qua nên `req.user` không
 * được điền — muốn biết thì phải tự đọc và tự verify.
 *
 * Tách riêng phần ĐỌC khỏi phần VERIFY vì hai việc khác bản chất: đọc là thao
 * tác thuần trên request, test không cần JwtService lẫn secret; còn verify là
 * bất đồng bộ và cần khoá. Gộp lại thì không test được phần dễ sai nhất — thứ
 * tự ưu tiên giữa cookie và header.
 *
 * Thứ tự cookie trước, header sau — khớp đúng thứ tự extractor ở JwtStrategy,
 * để một request mang cả hai không xác thực ra hai kết quả khác nhau tuỳ chỗ.
 */
import { ACCESS_COOKIE } from '../strategies/jwt.strategy';

/** Chỉ khai đúng hai thứ hàm này đọc — handler nhận nó thay cho cả
 *  FastifyRequest, nên test dựng được request giả bằng object thường. */
export interface TokenCarrier {
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, unknown>;
}

export function extractStaffToken(req: TokenCarrier): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;

  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const raw = auth.slice('Bearer '.length).trim();
    if (raw) return raw;
  }
  return null;
}
