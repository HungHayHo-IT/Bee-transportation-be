import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import {
  readOtpTicket, signOtpTicket,
} from '@/modules/customer-auth/otp-ticket.helper';
import { laKhachBeeLogs } from '@/modules/customers/khach-bee-logs.helper';

/**
 * Mục đích OTP RIÊNG cho việc này. Dùng chung 'register' với tài khoản khách
 * thì một vé xin cho việc kia tiêu được ở đây — vé mang `purpose` và được đối
 * chiếu lúc đọc, nên hai việc phải hai purpose.
 */
export const MUC_DICH_DOI_TAC = 'register_partner';

/**
 * Người của công ty đối tác tự mở tài khoản xem đơn.
 *
 * Ba bước, mỗi bước một request: xin mã → nhập mã lấy vé → đổi vé lấy tài
 * khoản. Dựng lại y hệt luồng đăng ký của khách, dùng lại CustomerOtpService
 * (đã có hạn mã 5 phút, 5 lần sai, 60s giữa hai lần gửi) thay vì viết bộ OTP
 * thứ hai.
 *
 * Bước xác thực hộp thư là thứ KHÔNG được bỏ. Thiếu nó thì ai gõ một địa chỉ
 * `@beelogistics.com` bất kỳ cũng vào xem được đơn của Bee Logistics — tên
 * miền là thông tin công khai, nó chứng minh người gõ biết tên công ty chứ
 * không chứng minh họ làm ở đó.
 */
@Injectable()
export class DangKyDoiTacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: CustomerOtpService,
    private readonly jwt: JwtService,
  ) {}

  /** Chặn sớm những email không thuộc tên miền — không gửi mã, không tốn hộp thư người ta. */
  private chanNgoaiTenMien(email: string): string {
    const sach = email.trim().toLowerCase();
    if (!laKhachBeeLogs(sach))
      throw new BadRequestException('Chỉ email của Bee Logistics mới mở được tài khoản này');
    return sach;
  }

  async guiMa(email: string): Promise<{ resendAfter: number }> {
    const sach = this.chanNgoaiTenMien(email);
    /* Email đã có tài khoản thì dừng NGAY, trước khi gửi mã: để họ nhập hết ba
       bước rồi mới báo trùng là bắt người ta làm công cốc, và là một đường dò
       xem địa chỉ nào đã đăng ký. */
    await this.chanTrungEmail(sach);
    return this.otp.send(sach, MUC_DICH_DOI_TAC);
  }

  /** Nhập mã đúng thì nhận vé 10 phút, dùng cho bước cuối. */
  async kiemMa(email: string, code: string): Promise<{ ticket: string }> {
    const sach = this.chanNgoaiTenMien(email);
    await this.otp.verify(sach, MUC_DICH_DOI_TAC, code);
    return { ticket: await signOtpTicket(this.jwt, sach, MUC_DICH_DOI_TAC) };
  }

  /**
   * Đổi vé lấy tài khoản. Email lấy TỪ VÉ chứ không từ body — xác thực hộp thư
   * A rồi mở tài khoản cho hộp thư B là bất khả.
   */
  async taoTaiKhoan(ticket: string, fullName: string, password: string): Promise<{ email: string }> {
    const email = await readOtpTicket(this.jwt, ticket, MUC_DICH_DOI_TAC);
    /* Kiểm tên miền MỘT LẦN NỮA ở đây. Vé do chính hệ thống ký nên về lý là
       sạch, nhưng đây là cửa duy nhất sinh ra tài khoản có vai trò partner —
       một chốt thừa ở chỗ này rẻ hơn nhiều so với một đường vòng chưa nghĩ ra. */
    const sach = this.chanNgoaiTenMien(email);
    await this.chanTrungEmail(sach);

    await this.prisma.user.create({
      data: {
        email: sach,
        fullName: fullName.trim() || sach,
        passwordHash: await bcrypt.hash(password, 12),
        roles: [Role.PARTNER],
        // KHÔNG phòng ban: đối tác không thuộc phòng nào của Bee. Để trống còn
        // là lớp chặn thứ hai — xem nhánh đối tác trong ScopeService.orderWhere.
        departmentId: null,
        mustChangePassword: false,
      },
    });
    return { email: sach };
  }

  private async chanTrungEmail(email: string): Promise<void> {
    const daCo = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (daCo) throw new ConflictException('Email này đã có tài khoản — hãy đăng nhập');
  }
}
