import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ActivityService } from '@/common/activity/activity.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { ChuKyS3Service } from './chu-ky-s3.service';
import { chenChuKy } from './chen-chu-ky.helper';
import { TrangThaiKy, bamToken, duocKy } from './chu-ky.helper';

/** `purpose` của mã OTP, tách khỏi OTP đăng nhập để hai luồng không đốt mã của nhau. */
const OTP_PURPOSE = 'sign_order';

export interface DauVetKy {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Phía KHÁCH của luồng ký: mọi thứ mở bằng mã một lần trong đường dẫn.
 *
 * Tách khỏi `SignaturesService` theo đúng ranh giới mà controller đã có sẵn —
 * bên kia là hai cửa của nhân viên đã đăng nhập, bên này là năm cửa `@Public`
 * tự bảo vệ bằng mã. Ranh giới ấy là ranh giới quyền truy cập, nên để hai nhóm
 * nằm chung một lớp thì lúc đọc code rất dễ nhầm cửa nào cần đăng nhập.
 */
@Injectable()
export class KhachKyService {
  private readonly logger = new Logger(KhachKyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: ChuKyS3Service,
    private readonly don: OrdersService,
    private readonly otp: CustomerOtpService,
    private readonly activity: ActivityService,
  ) {}

  /** Tra yêu cầu theo mã, kèm lý do nếu không ký được. Dùng chung cho mọi cửa. */
  private async timTheoToken(token: string) {
    const row = await this.prisma.orderSignature.findUnique({
      where: { tokenHash: bamToken(token) },
      include: {
        order: {
          select: {
            id: true, code: true, status: true, finalAmount: true,
            customer: { select: { companyName: true, contactName: true, email: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Đường dẫn ký không đúng');
    return row;
  }

  /** Thông tin cho trang ký. KHÔNG trả file — file đi qua cửa riêng. */
  async xem(token: string): Promise<{
    maDon: string;
    tenKhach: string;
    dieuKhoan: string;
    trangThai: string;
    kyDuoc: boolean;
    vi?: string;
    emailAn: string;
  }> {
    const row = await this.timTheoToken(token);
    const kq = duocKy(row.trangThai as TrangThaiKy, row.hetHanLuc, new Date());
    return {
      maDon: row.order.code,
      tenKhach: row.order.customer?.companyName ?? '',
      dieuKhoan: row.dieuKhoan,
      trangThai: row.trangThai,
      kyDuoc: kq.duoc,
      ...(kq.duoc ? {} : { vi: kq.vi }),
      emailAn: che(row.order.customer?.email ?? ''),
    };
  }

  /** Bản PDF đã chốt. Mã chính là giấy thông hành — không có cửa nào khác ra file này. */
  async docPdf(token: string): Promise<{ buffer: Buffer; tenFile: string }> {
    const row = await this.timTheoToken(token);
    const buffer = await this.s3.docFile(row.pdfKyKey ?? row.pdfKey);
    return { buffer, tenFile: `phieu-xac-nhan-${row.order.code}.pdf` };
  }

  /** Gửi mã OTP tới email của khách trên đơn. */
  async guiOtp(token: string): Promise<{ resendAfter: number }> {
    const row = await this.timTheoToken(token);
    const kq = duocKy(row.trangThai as TrangThaiKy, row.hetHanLuc, new Date());
    if (!kq.duoc) throw new ConflictException(kq.vi);
    const email = row.order.customer?.email?.trim();
    if (!email) throw new ConflictException('Đơn chưa có email khách');
    return this.otp.send(email, OTP_PURPOSE);
  }

  /**
   * Khách ký.
   *
   * Thứ tự cố ý: kiểm hạn → kiểm OTP → chèn chữ ký → ghi. Chèn PDF là bước tốn
   * thời gian nhất và cũng là bước dễ hỏng nhất; làm nó trước khi ghi nghĩa là
   * hỏng thì không có dòng 'da_ky' nào nửa vời nằm lại.
   */
  async ky(
    token: string,
    dto: { otp: string; anhKyBase64: string; tenNguoiKy: string },
    dauVet: DauVetKy,
  ): Promise<{ ok: true }> {
    const row = await this.timTheoToken(token);
    const bayGio = new Date();
    const kq = duocKy(row.trangThai as TrangThaiKy, row.hetHanLuc, bayGio);
    if (!kq.duoc) throw new ConflictException(kq.vi);

    const email = row.order.customer?.email?.trim();
    if (!email) throw new ConflictException('Đơn chưa có email khách');
    await this.otp.verify(email, OTP_PURPOSE, dto.otp);

    const anh = docAnhPng(dto.anhKyBase64);
    const goc = await this.s3.docFile(row.pdfKey);

    /* Đối chiếu mã băm trước khi ký: nếu file trên S3 đã khác bản lúc chốt thì
       có chuyện, và ký tiếp là đóng dấu lên một thứ không ai kiểm được. */
    const sha = createHash('sha256').update(goc).digest('hex');
    if (sha !== row.pdfSha256) {
      this.logger.error(`Phiếu ký ${row.id} lệch mã băm — từ chối ký`);
      throw new ConflictException('Phiếu đã thay đổi, vui lòng yêu cầu gửi lại');
    }

    const daKy = await chenChuKy(goc, anh, {
      tenNguoiKy: dto.tenNguoiKy,
      kyLuc: bayGio,
      maDon: row.order.code,
    });

    const don = await this.prisma.order.findUnique({
      where: { id: row.orderId },
      select: { departmentId: true },
    });

    const anhKey = `chu-ky/${row.orderId}/${row.id}-chu-ky.png`;
    const kyKey = `chu-ky/${row.orderId}/${row.id}-da-ky.pdf`;
    await this.s3.luuFile(anhKey, anh, 'image/png');
    await this.s3.luuFile(kyKey, daKy, 'application/pdf');

    await this.prisma.orderSignature.update({
      where: { id: row.id },
      data: {
        trangThai: TrangThaiKy.DA_KY,
        anhKyKey: anhKey,
        pdfKyKey: kyKey,
        kyLuc: bayGio,
        kyIp: dauVet.ip,
        kyUserAgent: dauVet.userAgent,
        kyTen: dto.tenNguoiKy,
        otpEmail: email,
        otpDungLuc: bayGio,
        updatedAt: bayGio,
      },
    });

    await this.activity.log(null, {
      entity: 'order_signatures',
      entityId: row.id,
      action: 'update',
      actorId: row.createdBy,
      detail: { orderId: row.orderId, kyBoi: dto.tenNguoiKy, ip: dauVet.ip },
    });

    /* Khách ký xong thì đơn tự chốt — đúng đường mà nút "Chốt đơn" đang đi.
       Việc này KHOÁ DOANH THU và sinh bộ mốc, nên nó phải chạy sau khi chữ ký
       đã ghi xong: hỏng ở bước chốt thì chữ ký vẫn còn đó và sale chốt tay
       được, còn hỏng theo chiều ngược lại thì doanh thu ghi mà không có chữ ký
       nào chứng minh.

       Người đứng tên trong nhật ký là sale đã gửi yêu cầu, vì đó là người của
       công ty chịu trách nhiệm cho lần chốt này — khách không có tài khoản
       nhân viên để đứng tên. */
    try {
      await this.don.chotDon(
        row.orderId,
        /* Giờ Việt Nam, không phải chuỗi ISO: dòng này hiện trên nhật ký đơn
           và in vào ô Ghi chú của hợp đồng, nơi người đọc là sale và khách. */
        `Khách ký điện tử lúc ${gioVn(bayGio)}`,
        row.createdBy,
        row.order.code,
        don?.departmentId ?? null,
      );
    } catch (e) {
      this.logger.error(`Ký xong nhưng chốt đơn ${row.orderId} hỏng: ${String(e)}`);
    }

    return { ok: true };
  }

  /** Khách từ chối. Đơn GIỮ NGUYÊN trạng thái — sale còn thương lượng tiếp được. */
  async tuChoi(token: string, lyDo: string): Promise<{ ok: true }> {
    const row = await this.timTheoToken(token);
    const kq = duocKy(row.trangThai as TrangThaiKy, row.hetHanLuc, new Date());
    if (!kq.duoc) throw new ConflictException(kq.vi);
    if (!lyDo.trim()) throw new BadRequestException('Vui lòng cho biết lý do');

    await this.prisma.orderSignature.update({
      where: { id: row.id },
      data: {
        trangThai: TrangThaiKy.TU_CHOI,
        lyDoTuChoi: lyDo.trim(),
        updatedAt: new Date(),
      },
    });
    await this.activity.log(null, {
      entity: 'order_signatures',
      entityId: row.id,
      action: 'update',
      actorId: row.createdBy,
      detail: { orderId: row.orderId, tuChoi: lyDo.trim() },
    });
    return { ok: true };
  }
}

/** Che email khi trả ra trang công khai: đủ để khách nhận ra, không đủ để lộ. */
function che(email: string): string {
  const [ten, mien] = email.split('@');
  if (!ten || !mien) return '';
  const dau = ten.slice(0, 2);
  return `${dau}${'*'.repeat(Math.max(1, ten.length - 2))}@${mien}`;
}

/** Nhận data URL hoặc base64 trần, trả buffer PNG. */
function docAnhPng(s: string): Buffer {
  const raw = s.startsWith('data:') ? (s.split(',')[1] ?? '') : s;
  if (!raw) throw new BadRequestException('Thiếu ảnh chữ ký');
  const buf = Buffer.from(raw, 'base64');
  // Tám byte đầu của mọi file PNG. Chặn ở đây để không đẩy rác lên S3.
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG)) {
    throw new BadRequestException('Ảnh chữ ký phải là PNG');
  }
  return buf;
}

/** Giờ Việt Nam đọc được bằng mắt, dùng cho chữ hiện ra với người dùng. */
function gioVn(d: Date): string {
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

