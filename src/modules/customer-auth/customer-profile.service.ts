import {
  BadRequestException, ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from './customer-otp.service';
import { toCustomerMe } from './customer-me.helper';
import { CustomerMeDto } from './dto/customer-auth.dto';
import {
  ChangePinDto, LinkProviderResponseDto, RegisterDeviceDto, SetPinByOtpDto, UpdateProfileDto,
} from './dto/profile.dto';

@Injectable()
export class CustomerProfileService {
  private readonly google: OAuth2Client;
  private readonly googleClientId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: CustomerOtpService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
  ) {
    this.googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.google = new OAuth2Client();
  }

  /**
   * Trả thẳng hồ sơ sau khi cập nhật thay vì 204: client vừa sửa xong là có ngay
   * trạng thái mới, không phải gọi thêm GET /customer-auth/me — bớt một vòng
   * mạng và bớt khoảng thời gian màn hình còn hiển thị dữ liệu cũ.
   *
   * Body rỗng vẫn trả hồ sơ chứ không trả rỗng: một endpoint chỉ nên có một hình
   * dạng response, nếu không FE phải viết nhánh riêng cho ca "không đổi gì".
   */
  async updateProfile(customerId: number, dto: UpdateProfileDto): Promise<CustomerMeDto> {
    const data: { fullName?: string; phone?: string | null } = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;

    // Lấy identities ngay trong câu ghi/đọc: providers là một phần của hồ sơ, đi
    // query rời là thêm một round-trip cho cùng một câu trả lời.
    const include = { identities: { select: { provider: true } } };
    const c = Object.keys(data).length === 0
      ? await this.prisma.customerAccount.findUniqueOrThrow({
        where: { id: customerId }, include,
      })
      : await this.prisma.customerAccount.update({
        where: { id: customerId }, data, include,
      });

    return toCustomerMe(c);
  }

  async changePin(customerId: number, dto: ChangePinDto): Promise<void> {
    if (dto.oldPin === dto.newPin)
      throw new BadRequestException('PIN mới trùng với PIN cũ');
    const c = await this.prisma.customerAccount.findUnique({ where: { id: customerId } });
    if (!c?.pinHash) throw new BadRequestException('Tài khoản chưa có PIN');
    const ok = await bcrypt.compare(dto.oldPin, c.pinHash);
    if (!ok) throw new UnauthorizedException('PIN cũ không đúng');
    const newHash = await bcrypt.hash(dto.newPin, 10);
    await this.prisma.customerAccount.update({
      where: { id: customerId }, data: { pinHash: newHash },
    });
  }

  /**
   * Đặt/đổi PIN cho khách đã đăng nhập nhưng KHÔNG nhớ PIN cũ (login qua OAuth
   * mà chưa từng đặt PIN, hoặc login bằng OTP). Xác thực bằng OTP purpose
   * 'reset_pin' gửi tới email đang có.
   */
  async setPinByOtp(customerId: number, dto: SetPinByOtpDto): Promise<void> {
    const c = await this.prisma.customerAccount.findUniqueOrThrow({ where: { id: customerId } });
    await this.otp.verify(c.email, 'reset_pin', dto.otp);
    const newHash = await bcrypt.hash(dto.newPin, 10);
    await this.prisma.customerAccount.update({
      where: { id: customerId }, data: { pinHash: newHash },
    });
  }

  /** Xem provider đang gắn. */
  private async listProviders(customerId: number): Promise<string[]> {
    const rows = await this.prisma.customerIdentity.findMany({
      where: { customerId }, select: { provider: true },
    });
    return [...new Set(rows.map((r) => r.provider))];
  }

  async linkGoogle(customerId: number, idToken: string): Promise<LinkProviderResponseDto> {
    if (!this.googleClientId)
      throw new BadRequestException('GOOGLE_CLIENT_ID chưa cấu hình');
    const ticket = await this.google.verifyIdToken({ idToken, audience: this.googleClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email)
      throw new UnauthorizedException('Google token không hợp lệ');

    // Google account này đã liên kết ai đó khác chưa?
    const dup = await this.prisma.customerIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: p.sub } },
    });
    if (dup && dup.customerId !== customerId)
      throw new ConflictException('Tài khoản Google này đã liên kết với khách khác');
    if (dup && dup.customerId === customerId) {
      return { ok: true as const, providers: await this.listProviders(customerId) };
    }
    await this.prisma.customerIdentity.create({
      data: {
        customerId, provider: 'google', providerUserId: p.sub, providerEmail: p.email,
      },
    });
    return { ok: true as const, providers: await this.listProviders(customerId) };
  }

  /**
   * Đăng ký / làm mới thiết bị nhận push. Upsert khớp theo `fcmToken` chứ không
   * theo customerId: một token là một bản cài app trên một máy, nên khách A
   * logout rồi khách B login trên cùng máy (FCM trả lại đúng token cũ) thì token
   * phải ĐỔI CHỦ, không được sinh dòng thứ hai — sinh thêm dòng là máy đó nhận
   * push của cả hai người.
   *
   * Cũng là heartbeat: FE gọi lại mỗi lần app mở và mỗi lần FCM rotate token,
   * nên lastSeenAt luôn được dời để sau này dọn token chết.
   */
  async registerDevice(customerId: number, dto: RegisterDeviceDto): Promise<void> {
    const now = new Date();
    await this.prisma.customerDevice.upsert({
      where: { fcmToken: dto.fcmToken },
      update: { customerId, platform: dto.platform, lastSeenAt: now },
      create: {
        customerId, fcmToken: dto.fcmToken, platform: dto.platform, lastSeenAt: now,
      },
    });
    // Máy này trước đó có thể đã gửi form public (quote_requests.fcm_token) khi
    // chưa đăng nhập, hoặc thuộc về người khác. Dòng vãng lai đó không có chủ và
    // không có đường huỷ, nên phải xoá claim cũ — nếu không máy vừa đổi chủ vẫn
    // nhận push của yêu cầu báo giá cũ.
    await this.prisma.quoteRequest.updateMany({
      where: { fcmToken: dto.fcmToken, customerId: null },
      data: { fcmToken: null },
    });
    // Và gỡ khỏi phía NHÂN VIÊN. fcm_token là UNIQUE nhưng chỉ TRONG MỘT BẢNG —
    // customer_devices và user_devices không biết gì về nhau, nên một máy có thể
    // nằm ở cả hai và nhận push của cả hai phía.
    //
    // Ca thật: máy công ty dùng chung ca kíp. Nhân viên đăng xuất, khách đăng
    // nhập, dòng cũ bên user_devices còn nguyên — thông báo nội bộ về đơn hàng
    // rơi thẳng sang màn hình khách.
    //
    // Gỡ theo TOKEN, không ràng userId: mục đích là dọn cái MÁY, không phải dọn
    // một người cụ thể.
    await this.prisma.userDevice.deleteMany({ where: { fcmToken: dto.fcmToken } });
  }

  /**
   * Huỷ thiết bị, thường gọi lúc logout. `where` ràng CẢ customerId để khách
   * không huỷ được token của máy người khác khi đoán/bắt được token đó.
   * deleteMany thay vì delete: token không còn thì coi như đã xong, không 404.
   */
  async unregisterDevice(customerId: number, fcmToken: string): Promise<void> {
    await this.prisma.customerDevice.deleteMany({ where: { fcmToken, customerId } });
  }

  /**
   * Xoá thật tài khoản khách khỏi DB — không soft-delete, không hoàn tác được.
   *
   * DB lo phần quan hệ: `customer_identities` ON DELETE CASCADE, và
   * `quote_requests.customer_id` ON DELETE SET NULL nên lead cũ vẫn ở lại cho
   * Sale (chỉ tụt submittedBy về 'anonymous'). Đơn hàng không liên quan — chúng
   * trỏ bảng `customers` (CRM), không trỏ `customer_accounts`.
   *
   * `customer_otps` thì KHÔNG có FK, khớp bằng email, nên phải xoá tay và phải
   * xoá trước: mất bản ghi account là mất luôn đường lần ra OTP mồ côi, mà mã
   * chưa hết hạn còn sót sẽ dùng được cho lần đăng ký lại bằng email đó.
   */
  async deleteAccount(customerId: number): Promise<void> {
    const c = await this.prisma.customerAccount.findUniqueOrThrow({
      where: { id: customerId },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.customerOtp.deleteMany({ where: { email: c.email } });
      await tx.customerAccount.delete({ where: { id: customerId } });
      await this.activity.log(tx, {
        entity: 'customer_accounts', entityId: customerId,
        action: 'delete', actorId: null, detail: { email: c.email },
      });
    });
  }

  async unlinkProvider(customerId: number, provider: string): Promise<LinkProviderResponseDto> {
    if (provider === 'email')
      throw new BadRequestException('Không thể huỷ liên kết Email');
    // Không cho huỷ nếu là provider duy nhất (không login được nữa).
    const identities = await this.prisma.customerIdentity.findMany({
      where: { customerId }, select: { provider: true },
    });
    const providers = new Set(identities.map((i) => i.provider));
    if (!providers.has(provider))
      throw new BadRequestException(`Chưa liên kết ${provider}`);
    const c = await this.prisma.customerAccount.findUniqueOrThrow({ where: { id: customerId } });
    if (providers.size === 1 && !c.pinHash)
      throw new BadRequestException('Không thể huỷ — bạn sẽ không đăng nhập lại được');
    await this.prisma.customerIdentity.deleteMany({ where: { customerId, provider } });
    return { ok: true as const, providers: await this.listProviders(customerId) };
  }
}
