import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import { RefreshTokenStore } from '@/modules/auth/refresh-token.store';
import {
  CheckEmailResponseDto, CustomerMeDto, LoginPinDto, LoginResponseDto, OauthLoginDto,
  RegisterDto, ResetPinDto,
} from './dto/customer-auth.dto';
import { CustomerOtpService } from './customer-otp.service';
import { toCustomerMe } from './customer-me.helper';
import { verifyGoogleIdToken } from './google-token.helper';
import { linkGuestQuoteRequests } from './guest-request-link.helper';
import { readOtpTicket, signOtpTicket } from './otp-ticket.helper';

/** Hai purpose có bước cuối tách rời nên cần vé bắc cầu. */
const TICKETED_PURPOSES = ['register', 'reset_pin'];

@Injectable()
export class CustomerAuthService {
  private readonly google: OAuth2Client;
  private readonly googleClientId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: CustomerOtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.google = new OAuth2Client();
    this.refreshTokens = new RefreshTokenStore(
      this.prisma.customerRefreshToken, 'customerId',
    );
  }

  /** Cùng lớp kho với phía nhân viên nhưng khác BẢNG — xem db/migrations/017. */
  private readonly refreshTokens: RefreshTokenStore;

  // ---------------------------------------------------------------- Helpers

  private async signToken(customerId: number): Promise<string> {
    return this.jwt.signAsync({ sub: customerId, type: 'customer' });
  }

  /**
   * Mọi lối vào (register / PIN / Google) đều cấp cùng một cặp token, và đều đi
   * qua đúng hàm này — nên đây là chỗ duy nhất cần gắn việc nhận lại yêu cầu
   * vãng lai. Đặt ở từng lối vào thì thêm lối thứ tư là có người quên.
   *
   * refresh() KHÔNG gọi hàm này, nên việc gắn chỉ chạy lúc đăng nhập thật chứ
   * không lặp lại mỗi lần gia hạn token.
   */
  private async newSession(
    customerId: number, email: string,
  ): Promise<{ token: string; refreshToken: string }> {
    const session = {
      token: await this.signToken(customerId),
      refreshToken: await this.refreshTokens.issue(customerId),
    };
    await linkGuestQuoteRequests(this.prisma, customerId, email);
    return session;
  }

  /**
   * Đổi refresh lấy access mới. Vẫn đọc lại customer_accounts dù rotate đã xác
   * thực xong: refresh sống 30 ngày, mà tài khoản bị khoá thì phải chặn NGAY.
   */
  async refresh(raw: string): Promise<{ token: string; refreshToken: string }> {
    const { ownerId, refreshToken } = await this.refreshTokens.rotateForActiveOwner(
      raw,
      async (id) => (await this.prisma.customerAccount.findUnique({
        where: { id }, select: { isActive: true },
      }))?.isActive === true,
    );
    return { token: await this.signToken(ownerId), refreshToken };
  }

  /** Logout thu hồi refresh của đúng phiên đó. Access 12h vẫn sống tới khi hết
   * hạn — đánh đổi có chủ đích, xem AuthService.revokeRefresh. */
  async revokeRefresh(raw?: string): Promise<void> {
    await this.refreshTokens.revoke(raw);
  }

  private async toMe(customerId: number): Promise<CustomerMeDto> {
    const c = await this.prisma.customerAccount.findUniqueOrThrow({
      where: { id: customerId },
      include: { identities: { select: { provider: true } } },
    });
    return toCustomerMe(c);
  }

  // ------------------------------------------------------------- OTP + vé

  /** Một email chỉ mở được một tài khoản khách. Chốt dùng lại ở nhiều bước. */
  private async assertEmailFree(email: string): Promise<void> {
    const existing = await this.prisma.customerAccount.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email đã có tài khoản, vui lòng đăng nhập');
  }

  /**
   * Gửi OTP, kèm chốt sớm nhất của luồng đăng ký: email đã có tài khoản thì
   * chặn ngay tại đây, không tốn một lá mail nào và khách biết lỗi lúc vừa gõ
   * email — thay vì gõ hết OTP lẫn PIN rồi mới bị từ chối ở bước cuối.
   *
   * Chỉ áp cho `register`. `reset_pin` thì ngược lại, tài khoản BẮT BUỘC phải
   * có sẵn, nên không đụng tới.
   */
  async sendOtp(email: string, purpose: string): Promise<{ resendAfter: number }> {
    const normalized = email.trim().toLowerCase();
    if (purpose === 'register') await this.assertEmailFree(normalized);
    return this.otp.send(normalized, purpose);
  }

  /**
   * Kiểm mã và đốt nó. Với hai purpose còn một bước nữa mới xong việc
   * (`register` -> nhập PIN, `reset_pin` -> nhập PIN mới), trả kèm vé để bước
   * đó biết email này vừa xác thực xong. Xem otp-ticket.helper.
   *
   * Chốt trùng chạy lại sau khi verify: tài khoản có thể được tạo xen vào giữa
   * lúc gửi mã và lúc nhập mã.
   */
  async verifyOtp(
    email: string, purpose: string, code: string,
  ): Promise<{ ok: true; ticket?: string }> {
    const normalized = email.trim().toLowerCase();
    await this.otp.verify(normalized, purpose, code);
    if (purpose === 'register') await this.assertEmailFree(normalized);
    if (!TICKETED_PURPOSES.includes(purpose)) return { ok: true as const };
    return { ok: true as const, ticket: await signOtpTicket(this.jwt, normalized, purpose) };
  }

  // ---------------------------------------------------------- Email + PIN

  /**
   * Bước cuối của đăng ký: đổi vé lấy tài khoản. OTP đã được verify và đốt ở
   * /otp/verify, nên ở đây không verify lại — đó chính là lý do vé tồn tại.
   */
  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    const email = await readOtpTicket(this.jwt, dto.ticket, 'register');
    await this.assertEmailFree(email);

    const pinHash = await bcrypt.hash(dto.pin, 10);
    const created = await this.prisma.customerAccount.create({
      data: {
        email, pinHash, emailVerifiedAt: new Date(),
        fullName: (dto.fullName ?? '').trim(),
        phone: dto.phone?.trim() || null,
        identities: {
          create: { provider: 'email', providerUserId: email, providerEmail: email },
        },
      },
    });
    return { ...(await this.newSession(created.id, email)), me: await this.toMe(created.id) };
  }

  async loginPin(dto: LoginPinDto): Promise<LoginResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const c = await this.prisma.customerAccount.findUnique({ where: { email } });
    if (!c || !c.isActive || !c.pinHash)
      throw new UnauthorizedException('Email hoặc PIN không đúng');
    const ok = await bcrypt.compare(dto.pin, c.pinHash);
    if (!ok) throw new UnauthorizedException('Email hoặc PIN không đúng');
    return { ...(await this.newSession(c.id, email)), me: await this.toMe(c.id) };
  }

  /**
   * Quên PIN: đổi vé lấy quyền đặt PIN mới, KHÔNG cần đăng nhập trước.
   *
   * Trước đây việc này phải đi vòng — đăng nhập bằng OTP để có phiên, rồi mới
   * gọi /me/set-pin, tức hai mã OTP và hai hòm thư cho một việc. Vé bỏ được
   * vòng đó mà không hạ chuẩn: cửa ải vẫn đúng một cái, "ai đọc được hòm mail".
   *
   * Không cấp cookie ở đây. Đặt xong PIN thì đăng nhập lại bằng PIN mới — một
   * lần gõ để chứng minh khách nhớ đúng cái vừa đặt.
   */
  async resetPin(dto: ResetPinDto): Promise<void> {
    const email = await readOtpTicket(this.jwt, dto.ticket, 'reset_pin');
    const c = await this.prisma.customerAccount.findUnique({ where: { email } });
    // Tài khoản biến mất hoặc bị khoá giữa chừng: báo y như vé hỏng, không xác
    // nhận giúp kẻ dò xem email nào có tài khoản.
    if (!c || !c.isActive)
      throw new UnauthorizedException('Phiên xác thực đã hết hạn — xin mã mới');
    await this.prisma.customerAccount.update({
      where: { id: c.id }, data: { pinHash: await bcrypt.hash(dto.newPin, 10) },
    });
  }

  // -------------------------------------------------------------- Google

  async loginGoogle(dto: OauthLoginDto): Promise<LoginResponseDto> {
    const g = await verifyGoogleIdToken(this.google, this.googleClientId, dto.idToken);
    // Tìm customer theo identity Google trước; không có thì tìm theo email và
    // liên kết. Cuối cùng mới tạo mới. Thứ tự này tránh double-account cho
    // cùng người khi họ đã đăng ký email trước, sau dùng Google.
    const existing = await this.prisma.customerIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'google', providerUserId: g.sub },
      },
      include: { customer: true },
    });
    if (existing) {
      return {
        ...(await this.newSession(existing.customerId, g.email)),
        me: await this.toMe(existing.customerId),
      };
    }
    const byEmail = await this.prisma.customerAccount.findUnique({
      where: { email: g.email.toLowerCase() },
    });
    if (byEmail) {
      await this.prisma.customerIdentity.create({
        data: {
          customerId: byEmail.id, provider: 'google',
          providerUserId: g.sub, providerEmail: g.email,
        },
      });
      return { ...(await this.newSession(byEmail.id, g.email)), me: await this.toMe(byEmail.id) };
    }
    const created = await this.prisma.customerAccount.create({
      data: {
        email: g.email.toLowerCase(), fullName: g.name,
        emailVerifiedAt: new Date(),
        identities: {
          create: { provider: 'google', providerUserId: g.sub, providerEmail: g.email },
        },
      },
    });
    return { ...(await this.newSession(created.id, g.email)), me: await this.toMe(created.id) };
  }

  // ------------------------------------------------------------ Session

  async me(customer: AuthenticatedCustomer): Promise<CustomerMeDto> {
    return this.toMe(customer.id);
  }

  /**
   * Trả về email đã có account chưa và các provider đã liên kết. Dùng để FE
   * quyết định luồng: chưa có → register (OTP + PIN); có nhưng chỉ có 'google'
   * → mời login Google; có 'email' → cho login PIN hoặc OTP; là nhân viên
   * (`isStaff` và `exists=false`) → chuyển sang màn đăng nhập nội bộ.
   *
   * Tra SONG SONG hai bảng người dùng tách rời. `users.email` và
   * `customer_accounts.email` đều `@unique @db.Citext` nên cả hai đều là tra có
   * index, không phân biệt hoa thường.
   *
   * KHÔNG lộ trạng thái khoá, ở cả hai phía và theo hai cách khác nhau:
   * - Khách: tài khoản còn hoạt động hay đã khoá đều trả `exists=true`. Chỉ
   *   chặn ở login thật.
   * - Nhân viên: "không phải nhân viên" và "nhân viên đã khoá" đều trả
   *   `isStaff=false`, nên không phân biệt được hai ca. Cờ này để điều hướng
   *   tới màn hình người dùng đăng nhập ĐƯỢC, mà màn Admin thì người đã khoá
   *   vào không nổi nữa.
   *
   * Chỉ lấy đúng `isActive` từ bảng `users`: ngoài một boolean ra, không có gì
   * về tài khoản nội bộ được rời khỏi server qua endpoint công khai này. Đó
   * cũng là lý do KHÔNG trả `mustChangePassword` — nói công khai rằng một tài
   * khoản còn dùng mật khẩu admin cấp là trao sẵn danh sách mục tiêu ưu tiên.
   * Thông tin đó đã có ở response của `POST /auth/login`, đúng lúc cần.
   */
  async checkEmail(email: string): Promise<CheckEmailResponseDto> {
    const normalized = email.trim().toLowerCase();
    const [c, staff] = await Promise.all([
      this.prisma.customerAccount.findUnique({
        where: { email: normalized },
        include: { identities: { select: { provider: true } } },
      }),
      this.prisma.user.findUnique({
        where: { email: normalized },
        select: { isActive: true },
      }),
    ]);
    // Nhân viên đã khoá coi như không phải nhân viên: cờ này để điều hướng tới
    // màn hình họ đăng nhập ĐƯỢC, mà màn Admin thì họ vào không nổi nữa.
    const isStaff = staff?.isActive === true;
    if (!c) return { exists: false, providers: [], emailVerified: false, isStaff };
    return {
      exists: true,
      providers: [...new Set(c.identities.map((i) => i.provider))],
      emailVerified: c.emailVerifiedAt !== null,
      isStaff,
    };
  }
}
