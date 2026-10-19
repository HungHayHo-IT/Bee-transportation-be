import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Vé OTP: bằng chứng ngắn hạn rằng "email này vừa nhập đúng mã cho việc kia".
 *
 * Sinh ra để tách màn nhập OTP khỏi màn nhập PIN. Trước đây hai việc đó dồn vào
 * một request (`register` tự verify OTP lấy), nên FE không thể có một bước
 * "kiểm tra mã đúng chưa" riêng: gọi `otp/verify` trước là mã bị đốt
 * (`consumed_at`), tới `register` verify lần hai thì không còn mã nào chưa dùng
 * -> luôn hỏng.
 *
 * Vé giải chuyện đó mà không cần thêm cột hay bảng: verify xong đốt mã và phát
 * vé, bước cuối chỉ cần vé.
 *
 * Hai điều làm vé an toàn:
 * - `sub` là EMAIL, và bước cuối lấy email từ đây chứ không từ body. Verify
 *   email A rồi đăng ký cho email B là bất khả.
 * - `purpose` nằm trong vé và được đối chiếu lúc đọc, nên vé đăng ký không đi
 *   đặt lại PIN được. Cộng thêm `type` riêng để cookie đăng nhập của khách —
 *   ký cùng JWT_SECRET, chỉ khác type — không mạo danh được vé.
 */
const TICKET_TYPE = 'otp_ticket';

/** 10 phút: đủ cho người thật gõ PIN, đủ ngắn để vé nhặt được cũng hết thời. */
const TICKET_TTL_SECONDS = 600;

interface TicketPayload {
  sub: string;
  type: string;
  purpose: string;
}

export async function signOtpTicket(
  jwt: JwtService,
  email: string,
  purpose: string,
): Promise<string> {
  return jwt.signAsync(
    { sub: email.trim().toLowerCase(), type: TICKET_TYPE, purpose },
    { expiresIn: TICKET_TTL_SECONDS },
  );
}

/** Trả email trong vé. Vé hỏng/hết hạn/sai loại/sai purpose đều là 401 như nhau. */
export async function readOtpTicket(
  jwt: JwtService,
  ticket: string,
  expectedPurpose: string,
): Promise<string> {
  let payload: TicketPayload;
  try {
    payload = await jwt.verifyAsync<TicketPayload>(ticket);
  } catch {
    throw new UnauthorizedException('Phiên xác thực đã hết hạn — xin mã mới');
  }
  if (payload.type !== TICKET_TYPE || payload.purpose !== expectedPurpose)
    throw new UnauthorizedException('Phiên xác thực đã hết hạn — xin mã mới');
  return payload.sub;
}
