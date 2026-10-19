import {
  BadRequestException, HttpException, HttpStatus, Injectable, Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { renderOtpEmail } from './otp-email.template';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 phút giữa 2 lần gửi cùng email/purpose

@Injectable()
export class CustomerOtpService {
  private readonly logger = new Logger(CustomerOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Tạo mã 6 số, ghi bcrypt-hash vào DB, gửi mail. Rate limit theo cặp
   * (email, purpose): 60s cooldown giữa hai lần gửi. Trả thời gian chờ nếu
   * client cần biết bao lâu mới gửi lại được.
   */
  async send(email: string, purpose: string): Promise<{ resendAfter: number }> {
    const normalized = email.trim().toLowerCase();
    const last = await this.prisma.customerOtp.findFirst({
      where: { email: normalized, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (last) {
      const since = Date.now() - last.createdAt.getTime();
      if (since < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - since) / 1000);
        throw new HttpException(
          `Vui lòng chờ ${wait}s trước khi gửi lại`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    await this.prisma.customerOtp.create({
      data: {
        email: normalized, codeHash, purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    // Gửi trong background: user không cần đợi SMTP. Nếu SMTP hỏng, log lại
    // để dev thấy code (dev-only path).
    const rendered = renderOtpEmail(code, purpose);
    void this.mail
      .send({ to: normalized, ...rendered })
      .catch((err) => {
        this.logger.warn(`Gửi OTP mail hỏng cho ${normalized}: ${(err as Error).message}`);
        this.logger.debug(`[dev-only] OTP=${code}`);
      });

    return { resendAfter: Math.ceil(RESEND_COOLDOWN_MS / 1000) };
  }

  /**
   * Verify OTP mới nhất: đúng code → đánh dấu consumed_at, trả true. Sai →
   * tăng attempts; quá MAX_ATTEMPTS thì OTP đó hỏng vĩnh viễn (buộc gửi lại).
   * KHÔNG mở khoá tài khoản — chỉ nói "đúng OTP hay không". Việc login/register
   * ở tầng cao hơn (customerAuth).
   */
  async verify(email: string, purpose: string, code: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const row = await this.prisma.customerOtp.findFirst({
      where: { email: normalized, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new BadRequestException('Chưa yêu cầu mã hoặc mã đã dùng');
    if (row.expiresAt.getTime() < Date.now())
      throw new BadRequestException('Mã đã hết hạn — gửi lại mã mới');
    if (row.attempts >= MAX_ATTEMPTS)
      throw new BadRequestException('Đã nhập sai quá nhiều — gửi lại mã mới');

    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      await this.prisma.customerOtp.update({
        where: { id: row.id }, data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Mã không đúng');
    }

    await this.prisma.customerOtp.update({
      where: { id: row.id }, data: { consumedAt: new Date() },
    });
    return true;
  }
}
