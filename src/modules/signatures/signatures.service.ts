import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { laDonLanding } from '@/modules/orders/gia-sale.helper';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { ActivityService } from '@/common/activity/activity.service';
import { OrderStatus } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { OrdersExportService } from '@/modules/orders/orders-export.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { DieuKhoanService } from '@/modules/cms/dieu-khoan.service';
import { ChuKyS3Service } from './chu-ky-s3.service';
import { TrangThaiKy, bamToken, hetHanLuc, sinhToken } from './chu-ky.helper';

/** Khoá cấu hình chứa điều khoản khách ký vào — xem migration 037. */
export interface DauVetKy {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Luồng khách ký xác nhận đơn hàng.
 *
 * Hai nguyên tắc chi phối mọi hàm ở đây:
 *
 * 1. **Bản ký là bản đã chốt.** Phiếu xác nhận vốn được sinh lại mỗi lần tải,
 *    nên lúc gửi đi ta chốt một bản vật lý lên S3 và lưu mã băm của chính nó.
 *    Không làm vậy thì sửa đơn sau khi khách ký cũng đổi luôn nội dung phiếu,
 *    và chữ ký không chứng minh được gì.
 * 2. **Một yêu cầu đang chờ mỗi đơn.** Hai đường dẫn cùng sống thì ký cái nào
 *    cũng được, và không ai biết bản nào là thật. Ràng buộc này ép ở tầng dữ
 *    liệu (chỉ số duy nhất một phần), còn ở đây ta huỷ cái cũ trước khi tạo
 *    cái mới.
 */
@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: ChuKyS3Service,
    private readonly xuat: OrdersExportService,
    private readonly don: OrdersService,
    private readonly mail: MailService,
    private readonly otp: CustomerOtpService,
    private readonly activity: ActivityService,
    private readonly config: ConfigService,
    private readonly dieuKhoanService: DieuKhoanService,
  ) {}

  /**
   * Điều khoản đang áp dụng — các điều đang bật ghép lại (migration 053).
   *
   * Chưa soạn điều nào là LỖI CÀI ĐẶT, không im lặng: gửi khách một tờ giấy
   * trắng rồi lấy chữ ký lên đó còn tệ hơn là không gửi được.
   */
  private async dieuKhoan(): Promise<string> {
    const toanVan = await this.dieuKhoanService.toanVan();
    if (!toanVan.trim()) {
      throw new BadRequestException(
        'Chưa soạn điều khoản ký — vào CMS để soạn trước khi gửi khách',
      );
    }
    return toanVan;
  }

  /** Địa chỉ trang ký bên landing, để dựng đường dẫn gửi khách. */
  private goc(): string {
    const v = (this.config.get<string>('SIGN_PAGE_URL') ?? '').replace(/\/+$/, '');
    if (!v) throw new BadRequestException('Chưa cấu hình SIGN_PAGE_URL');
    return v;
  }

  /**
   * Gửi khách ký: chốt PDF, sinh mã, gửi email.
   *
   * Chạy TRƯỚC khi sinh mã: nếu chốt PDF hỏng thì không có dòng nào được tạo,
   * và người bấm thấy lỗi ngay thay vì thấy "đã gửi" rồi khách mở ra trang trắng.
   */
  async guiYeuCau(orderId: number, user: AuthenticatedUser): Promise<{ id: number }> {
    const don = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, code: true, status: true, departmentId: true, customerId: true,
        source: true, salePrice: true,
      },
    });
    if (!don) throw new NotFoundException('Không tìm thấy đơn hàng');

    /* Phiếu xác nhận cần có SỐ TIỀN thì mới có gì để ký, mà số tiền chỉ có sau
       khi sale chọn báo giá thắng. Chặn ở đây chứ không để khách mở ra một tờ
       giấy trống rồi mới phát hiện. */
    if (!don.departmentId) {
      throw new ConflictException('Đơn chưa chọn báo giá thắng — chưa gửi ký được');
    }
    // Đơn landing ký theo giá Sale chốt — chưa nhập thì hợp đồng không có số tiền.
    if (laDonLanding(don.source) && don.salePrice === null) {
      throw new ConflictException('Chưa nhập giá chốt với khách — chưa gửi ký được');
    }
    if (don.status === OrderStatus.CLOSED || don.status === OrderStatus.CANCELLED) {
      throw new ConflictException('Đơn đã kết thúc, không gửi ký được nữa');
    }

    const email = await this.emailKhach(don.customerId);
    const dieuKhoan = await this.dieuKhoan();
    /* Đọc đường dẫn trang ký NGAY ĐÂY, không để tới lúc dựng mail.
       Hai lý do. Một: thiếu nó thì cả việc dựng phiếu lẫn đẩy lên S3 đều là
       công toi. Hai, quan trọng hơn: nếu để `goc()` ném ở trong khối bắt lỗi
       của bước gửi mail thì máy chủ quên đặt SIGN_PAGE_URL sẽ hiện ra y hệt
       lỗi SMTP — và người đi sửa đào nhầm hướng. Đã mất công thật. */
    const gocTrangKy = this.goc();
    /* Đưa THẲNG đoạn điều khoản vừa đọc vào bản PDF, chứ không để nơi kia tự
       đọc lại cấu hình: hai lần đọc là hai thời điểm, và nếu có người sửa điều
       khoản xen vào giữa thì bản khách ký sẽ khác đoạn chữ ta lưu bên cạnh chữ
       ký — đúng cái mà cả tính năng này sinh ra để tránh. */
    const pdf = await this.xuat.confirmationPdf(orderId, user, dieuKhoan);
    const sha = createHash('sha256').update(pdf).digest('hex');
    const key = `chu-ky/${orderId}/${Date.now()}-phieu.pdf`;
    await this.s3.luuFile(key, pdf, 'application/pdf');

    const token = sinhToken();
    const bayGio = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      // Huỷ yêu cầu cũ trước: chỉ số duy nhất một phần sẽ từ chối dòng mới nếu
      // còn một dòng 'cho_ky', và câu báo lỗi của Postgres thì không ai hiểu.
      await tx.orderSignature.updateMany({
        where: { orderId, trangThai: TrangThaiKy.CHO_KY },
        data: { trangThai: TrangThaiKy.HET_HAN, updatedAt: bayGio },
      });
      return tx.orderSignature.create({
        data: {
          orderId,
          tokenHash: bamToken(token),
          hetHanLuc: hetHanLuc(bayGio),
          pdfKey: key,
          pdfSha256: sha,
          dieuKhoan,
          createdBy: user.id,
        },
        select: { id: true },
      });
    });

    /* Gửi mail TRƯỚC khi ghi nhật ký, và hỏng thì XOÁ hẳn dòng vừa tạo.

       Mã gốc chỉ tồn tại trong lần gọi này — dưới cơ sở dữ liệu chỉ có bản băm
       — nên mail không đi thì không ai lấy lại được mã, và dòng đó không còn
       là một yêu cầu ký nữa: nó chỉ chiếm chỗ "đang chờ" và chặn lần gửi sau.

       Xoá chứ không đánh dấu hết hạn: một dòng "hết hạn" là một yêu cầu khách
       đã từng nhận được rồi để quá hạn, còn đây là thứ chưa bao giờ ra khỏi
       máy chủ. Để lại thì sale nhìn bảng thấy "Hết hạn" và đi tìm xem khách đã
       làm gì với nó. */
    try {
      await this.guiMailKy(gocTrangKy, email, don.code, token);
    } catch (e) {
      await this.prisma.orderSignature.delete({ where: { id: row.id } });
      this.logger.error(`Gửi mail ký đơn ${orderId} hỏng, đã rút lại: ${String(e)}`);
      throw new BadRequestException(`Không gửi được email tới ${email}`);
    }

    await this.activity.log(null, {
      entity: 'order_signatures',
      entityId: row.id,
      action: 'create',
      actorId: user.id,
      detail: { orderId, orderCode: don.code, email },
    });

    return row;
  }

  /** Email nhận link ký. Không có thì không gửi được — nói rõ thay vì gửi vào hư không. */
  private async emailKhach(customerId: number | null): Promise<string> {
    if (!customerId) throw new ConflictException('Đơn chưa gắn khách hàng');
    const kh = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, companyName: true },
    });
    const email = kh?.email?.trim();
    if (!email) {
      throw new ConflictException(
        `Khách hàng "${kh?.companyName ?? ''}" chưa có email — bổ sung trước khi gửi ký`,
      );
    }
    return email;
  }

  private async guiMailKy(
    goc: string,
    email: string,
    maDon: string,
    token: string,
  ): Promise<void> {
    const link = `${goc}/${token}`;
    await this.mail.send({
      to: email,
      subject: `Xác nhận đơn hàng ${maDon}`,
      html: this.mail.layout(
        `<p>Kính gửi Quý khách,</p>
         <p>Vui lòng xem và xác nhận phiếu đơn hàng <b>${maDon}</b> theo đường dẫn dưới đây.</p>
         <p><a href="${link}">Xem và ký phiếu xác nhận</a></p>
         <p>Đường dẫn có hiệu lực trong 7 ngày và chỉ dùng được một lần.</p>`,
      ),
    });
  }

  /** Trạng thái ký của một đơn, cho màn chi tiết đơn bên admin. */
  async trangThaiCuaDon(orderId: number) {
    return this.prisma.orderSignature.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, trangThai: true, hetHanLuc: true, kyLuc: true, kyTen: true,
        lyDoTuChoi: true, createdAt: true,
      },
    });
  }
}
