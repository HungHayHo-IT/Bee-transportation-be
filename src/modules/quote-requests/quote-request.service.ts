import {
  BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '@/common/activity/activity.service';
import { NotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { CreateOrderDto } from '../orders/dto/order.dto';
import {
  CreateQuoteRequestDto, CustomerQuoteDto, PublicQuoteRequestDto, QuoteRequestCreatedDto,
  QuoteRequestDto,
} from './dto/quote-request.dto';
import {
  convertFailedMessage, newRequestMessage, notifyStaff, unknownServiceCodeMessage,
} from './quote-request-notify.helper';
import { classifyServiceCode, ServiceCodeProblem } from './service-code.helper';
import { claimGuestToken } from './guest-token.helper';
import { findCustomerQuote } from './customer-quote.helper';
import { resolveOrderActor } from './order-actor.helper';
import { findGuestQuoteRequest } from './public-lookup.helper';
import {
  QUOTE_REQUEST_INCLUDE, toPublicQuoteRequestDto, toQuoteRequestDto,
} from './quote-request.mapper';

/** Số yêu cầu báo giá tối đa của MỘT số điện thoại trong cửa sổ bên dưới. */
export const GIOI_HAN_MOI_SO = 3;
const GIOI_HAN_CUA_SO_MS = 24 * 60 * 60 * 1000;


@Injectable()
export class QuoteRequestService {
  private readonly logger = new Logger(QuoteRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly orders: OrdersService,
    private readonly customerNotify: CustomerNotifyService,
    private readonly notify: NotifyService,
  ) {}

  /**
   * Sinh Order từ một yêu cầu báo giá, rồi đánh dấu yêu cầu đã chuyển.
   *
   * Tách khỏi `create()` để CHỈ CÓ MỘT bản luật "yêu cầu thành đơn thì ánh xạ
   * trường nào vào đâu". Lúc gửi form thì `create()` gọi; còn một yêu cầu đã
   * lỡ nằm lại ở `pending` — auto-convert hỏng, như lần cả bốn yêu cầu từ
   * landing đều chết vì luật dịch vụ con — thì `chuyenYeuCauDangCho()` gọi lại
   * đúng hàm này. Chép lại phép ánh xạ ở chỗ thứ hai là hai bản sẽ lệch nhau,
   * và đơn tạo bằng đường cứu hộ sẽ khác đơn tạo bình thường.
   */
  private async taoDonTuYeuCau(
    quoteRequestId: number,
    yeuCau: {
      serviceId: number; serviceChildId?: number;
      customerName: string; phone: string; email?: string | null;
      originProvince?: string | null; destinationProvince?: string | null; note?: string | null;
    },
    createdBy: number | null,
  ): Promise<number> {
    const actor = await resolveOrderActor(this.prisma, createdBy);
    const orderDto: CreateOrderDto = {
      serviceId: yeuCau.serviceId,
      serviceChildId: yeuCau.serviceChildId,
      newCustomer: {
        // Form website hỏi TÊN NGƯỜI ("Nguyễn Văn A"), không hỏi tên công ty
        // — hỏi thêm một ô nữa là mất khách. Nhét tên người vào companyName
        // làm màn hình khách hàng hiện "Tên công ty: Lê Thị Minh Châu" còn
        // "Người liên hệ" để trống: sai cả hai ô cùng lúc. Tên công ty để
        // admin điền sau khi đã gọi cho khách.
        contactName: yeuCau.customerName.trim(),
        phone: yeuCau.phone.trim(),
        email: yeuCau.email?.trim() || undefined,
      },
      originProvince: yeuCau.originProvince ?? undefined,
      destinationProvince: yeuCau.destinationProvince ?? undefined,
      note: yeuCau.note ?? undefined,
      source: 'website',
    } as CreateOrderDto;
    // Đơn từ form công khai được phép thiếu trường bắt buộc của dịch vụ: form
    // cố tình tối giản, còn "Thuê từ ngày"/"Loại hình tờ khai" là thứ sale hỏi
    // khách sau khi liên hệ. Thà đơn thiếu dữ liệu mà có người phụ trách, còn
    // hơn yêu cầu nằm im ở pending không ai nhìn thấy.
    const created = await this.orders.create(orderDto, actor, { fromPublicForm: true });
    await this.prisma.quoteRequest.update({
      where: { id: quoteRequestId },
      data: {
        status: 'converted', convertedToOrderId: created.id,
        reviewedBy: actor?.id ?? null, reviewedAt: new Date(),
      },
    });
    await this.activity.log(null, {
      entity: 'quote_requests', entityId: String(quoteRequestId),
      action: 'auto-convert', actorId: actor?.id ?? null, detail: { orderId: created.id },
    });
    return created.id;
  }

  /**
   * Chuyển những yêu cầu còn kẹt ở `pending` thành đơn — đường cứu hộ cho các
   * yêu cầu đã rơi vào lỗi auto-convert trước khi lỗi đó được sửa.
   *
   * Mỗi yêu cầu một try/catch: một cái hỏng không được chặn những cái sau, vì
   * lý do hỏng thường khác nhau từng yêu cầu.
   */
  async chuyenYeuCauDangCho(ids?: number[]): Promise<{ id: number; orderId?: number; loi?: string }[]> {
    const rows = await this.prisma.quoteRequest.findMany({
      where: { status: 'pending', serviceId: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: { id: 'asc' },
    });
    const kq: { id: number; orderId?: number; loi?: string }[] = [];
    for (const row of rows) {
      try {
        const orderId = await this.taoDonTuYeuCau(row.id, {
          serviceId: row.serviceId as number,
          customerName: row.customerName,
          phone: row.phone,
          email: row.email,
          originProvince: row.originProvince,
          destinationProvince: row.destinationProvince,
          note: row.note,
        }, row.createdBy);
        kq.push({ id: row.id, orderId });
      } catch (err) {
        kq.push({ id: row.id, loi: (err as Error).message });
      }
    }
    return kq;
  }

  /**
   * Public submit. Nếu có serviceId hợp lệ, tự tạo Order + phân phối theo ma
   * trận định tuyến ngay — nhân viên các phòng phụ trách dịch vụ đó thấy đơn
   * trong "Hàng đợi phòng ban" và báo giá bình thường. Không có serviceId thì
   * giữ pending cho Admin xử lý tay.
   */
  async create(
    dto: CreateQuoteRequestDto,
    createdBy: number | null,
    customerId: number | null = null,
  ): Promise<QuoteRequestCreatedDto> {
    // Nếu chỉ có serviceCode (form public không biết id), tra ra id cho quả.
    // Mã không dùng được thì KHÔNG ném lỗi — xem service-code.helper để biết vì
    // sao — nhưng phải giữ lại lý do để báo cho đúng người, đúng việc.
    let serviceId = dto.serviceId;
    let codeProblem: ServiceCodeProblem | undefined;
    if (serviceId === undefined && dto.serviceCode) {
      const code = dto.serviceCode.toUpperCase();
      const found = classifyServiceCode(
        code,
        await this.prisma.service.findUnique({ where: { code } }),
      );
      serviceId = found.serviceId;
      codeProblem = found.problem;
      if (codeProblem)
        this.logger.warn(
          `serviceCode "${code}" không dùng được (${codeProblem.reason}) — `
          + 'yêu cầu vẫn được lưu, không tạo đơn tự động.',
        );
    }
    if (serviceId !== undefined) {
      const svc = await this.prisma.service.findUnique({ where: { id: serviceId } });
      if (!svc || !svc.isActive)
        throw new BadRequestException('Dịch vụ không tồn tại hoặc đã ngừng');
    }
    // Chống dò giá: khách gửi tối đa 3 yêu cầu / số điện thoại / 24 giờ. Nhân
    // viên nhập hộ (createdBy đã xác thực) không bị tính. Đếm trong DB chứ không
    // trong bộ nhớ: khởi động lại tiến trình không được xoá lượt đã dùng.
    // ponytail: hai lần gửi đồng thời có thể cùng lọt lượt thứ 3 — chấp nhận được.
    if (createdBy === null) {
      const daGui = await this.prisma.quoteRequest.count({
        where: { phone: dto.phone, createdAt: { gte: new Date(Date.now() - GIOI_HAN_CUA_SO_MS) } },
      });
      if (daGui >= GIOI_HAN_MOI_SO)
        throw new HttpException(
          `Mỗi số điện thoại gửi tối đa ${GIOI_HAN_MOI_SO} yêu cầu báo giá trong 24 giờ. `
            + 'Vui lòng gọi hotline để được hỗ trợ thêm.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    const row = await this.prisma.quoteRequest.create({
      data: {
        customerName: dto.customerName.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim() ?? null,
        serviceId: serviceId ?? null,
        originProvince: dto.originProvince ?? null,
        destinationProvince: dto.destinationProvince ?? null,
        note: dto.note ?? null,
        // CHỈ lưu token cho khách VÃNG LAI. Khách đã đăng nhập có token nằm ở
        // customer_devices (có chủ, có lastSeenAt, có đường huỷ khi logout/xoá
        // tài khoản). Lưu thêm ở đây sẽ tạo một bản sao không chủ: xoá tài khoản
        // chỉ SET NULL customer_id, dòng này thành "vãng lai" và tiếp tục đẩy
        // push tới máy đã đổi chủ.
        fcmToken: customerId === null ? (dto.fcmToken ?? null) : null,
        createdBy,
        customerId,
      },
    });
    if (customerId === null && dto.fcmToken)
      await claimGuestToken(this.prisma, row.id, dto.fcmToken, dto.phone.trim());
    await this.activity.log(null, {
      entity: 'quote_requests', entityId: String(row.id),
      action: 'create', actorId: createdBy,
    });
    // Xác nhận đã nhận — khách không thấy hồi âm sẽ gửi lại nhiều lần.
    await this.customerNotify.quoteRequestReceived(row.id);

    // Tự chuyển thành Order nếu đủ điều kiện — tách try/catch để lỗi định
    // tuyến không xóa mất quote_request đã tạo (khách vẫn có ID để hỏi lại).
    if (serviceId !== undefined) {
      try {
        await this.taoDonTuYeuCau(row.id, {
          serviceId,
          serviceChildId: dto.serviceChildId,
          customerName: dto.customerName,
          phone: dto.phone,
          email: dto.email,
          originProvince: dto.originProvince,
          destinationProvince: dto.destinationProvince,
          note: dto.note,
        }, createdBy);
      } catch (err) {
        this.logger.warn(
          `Auto-convert quote_request ${row.id} thất bại: ${(err as Error).message}`,
        );
        // Vẫn trả 201 — khách đã submit thành công, Admin sẽ xử lý tay bản pending.
        const msg = convertFailedMessage(row.id, dto.customerName, dto.phone);
        await notifyStaff(
          this.notify, () => this.notify.admins(), row.id,
          NotifType.QUOTE_REQUEST_FAILED, msg.title, msg.body,
        );
      }
    } else {
      const msg = codeProblem
        ? unknownServiceCodeMessage(row.id, dto.customerName, dto.phone, codeProblem)
        : newRequestMessage(row.id, dto.customerName, dto.phone);
      await notifyStaff(
        this.notify, () => this.notify.adminsAndSales(), row.id,
        NotifType.QUOTE_REQUEST_NEW, msg.title, msg.body,
      );
    }

    return { id: row.id, status: 'pending', createdAt: row.createdAt.toISOString() };
  }

  async list(status: string | undefined, page: number, limit: number) {
    const where: Prisma.QuoteRequestWhereInput = {};
    if (status) where.status = status;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.quoteRequest.count({ where }),
      this.prisma.quoteRequest.findMany({
        where, include: QUOTE_REQUEST_INCLUDE, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ]);
    return { items: items.map((r) => toQuoteRequestDto(r)), total, page, limit };
  }

  async detail(id: number): Promise<QuoteRequestDto> {
    const row = await this.prisma.quoteRequest.findUnique({ where: { id }, include: QUOTE_REQUEST_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu báo giá');
    return toQuoteRequestDto(row);
  }

  /** List cho khách hàng ĐANG đăng nhập — chỉ trả bản của họ. */
  async myList(
    customerId: number, status: string | undefined,
    page: number, limit: number,
  ) {
    const where: Prisma.QuoteRequestWhereInput = { customerId };
    if (status) where.status = status;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.quoteRequest.count({ where }),
      this.prisma.quoteRequest.findMany({
        where, include: QUOTE_REQUEST_INCLUDE, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ]);
    return { items: items.map((r) => toQuoteRequestDto(r)), total, page, limit };
  }

  /** Detail cho khách hàng — chặn xem bản của người khác. */
  async myDetail(customerId: number, id: number): Promise<QuoteRequestDto> {
    const row = await this.prisma.quoteRequest.findFirst({
      where: { id, customerId }, include: QUOTE_REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu báo giá');
    return toQuoteRequestDto(row);
  }

  /**
   * Giá đã chốt cho khách hàng ĐANG đăng nhập — xem customer-quote.helper.ts để
   * biết vì sao chỉ lộ đúng giá của phòng thắng và vì sao "chưa có giá" là 200.
   */
  async myQuote(customerId: number, id: number): Promise<CustomerQuoteDto> {
    return findCustomerQuote(this.prisma, customerId, id);
  }

  /**
   * Tra cứu công khai cho khách vãng lai — xem public-lookup.helper.ts để biết
   * vì sao phải khớp cả hai tham số và vì sao mọi ca hỏng chung một lỗi.
   */
  async publicLookup(rawId: string, rawPhone: string): Promise<PublicQuoteRequestDto> {
    return toPublicQuoteRequestDto(await findGuestQuoteRequest(this.prisma, rawId, rawPhone));
  }

  async reject(id: number, reason: string, user: AuthenticatedUser): Promise<QuoteRequestDto> {
    const row = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu báo giá');
    if (row.status !== 'pending')
      throw new BadRequestException('Yêu cầu đã được xử lý, không đổi trạng thái được nữa');
    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        status: 'rejected', rejectReason: reason,
        reviewedBy: user.id, reviewedAt: new Date(),
      },
      include: QUOTE_REQUEST_INCLUDE,
    });
    await this.activity.log(null, {
      entity: 'quote_requests', entityId: String(id),
      action: 'reject', actorId: user.id, detail: { reason },
    });
    await this.customerNotify.quoteRequestRejected(id, reason);
    return toQuoteRequestDto(updated);
  }

  /**
   * Đánh dấu request đã chuyển thành order. Việc tạo Order thật vẫn đi qua
   * OrdersService — service này chỉ cập nhật liên kết + status.
   */
  async markConverted(
    id: number, orderId: number, user: AuthenticatedUser,
  ): Promise<QuoteRequestDto> {
    const row = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu báo giá');
    if (row.status !== 'pending')
      throw new BadRequestException('Yêu cầu đã được xử lý, không chuyển đổi được nữa');
    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        status: 'converted', convertedToOrderId: orderId,
        reviewedBy: user.id, reviewedAt: new Date(),
      },
      include: QUOTE_REQUEST_INCLUDE,
    });
    await this.activity.log(null, {
      entity: 'quote_requests', entityId: String(id),
      action: 'convert', actorId: user.id, detail: { orderId },
    });
    return toQuoteRequestDto(updated);
  }
}
