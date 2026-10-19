import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { LoginTicket, OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

/**
 * Verify Google id_token bằng thư viện chính chủ (kiểm iss, aud, exp, chữ ký
 * với Google JWKs). Trả email + sub (Google user id).
 *
 * Tách khỏi CustomerAuthService vì nó không cần gì của service ngoài hai tham
 * số này — và service đã chạm mốc 300 dòng của repo.
 *
 * google-auth-library NÉM khi token không giải mã được, nó không trả null.
 * Không bắt thì ngoại lệ văng nguyên ra ngoài thành 500 "Lỗi hệ thống" — đã đo
 * trên production bằng một chuỗi bịa. Với app mobile, 500 và 401 dẫn tới hai
 * hành vi khác hẳn nhau: một bên là "xin token mới rồi thử lại", bên kia là
 * "server chết, đừng hành người dùng". Trả nhầm mã là app xử lý nhầm, mà token
 * Google hết hạn là chuyện hằng ngày.
 *
 * Cũng không chuyển tiếp thông điệp của thư viện ("Wrong number of segments in
 * token") ra ngoài: chi tiết nội bộ, client không dùng được gì.
 *
 * Thiếu cấu hình thì là 400 chứ không phải 401: đó là lỗi của NGƯỜI VẬN HÀNH,
 * không phải của token khách gửi. Gộp vào 401 thì app bảo khách "đăng nhập
 * lại" mãi trong khi thứ cần làm là đặt biến môi trường.
 */
export async function verifyGoogleIdToken(
  google: OAuth2Client,
  googleClientId: string,
  idToken: string,
): Promise<GoogleIdentity> {
  if (!googleClientId) throw new BadRequestException('GOOGLE_CLIENT_ID chưa cấu hình');

  let ticket: LoginTicket;
  try {
    ticket = await google.verifyIdToken({ idToken, audience: googleClientId });
  } catch {
    throw new UnauthorizedException('Google token không hợp lệ');
  }
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new UnauthorizedException('Google token không hợp lệ');
  return { sub: p.sub, email: p.email, name: p.name ?? '' };
}
