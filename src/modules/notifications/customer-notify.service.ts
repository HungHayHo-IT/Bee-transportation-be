import { Injectable, Logger } from '@nestjs/common';
import { giaChoKhach } from '@/modules/orders/gia-sale.helper';
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotifyService } from './notify.service';

/** Chủ sở hữu thông báo phía khách: có tài khoản, hoặc chỉ có yêu cầu báo giá. */
interface CustomerRef {
  customerId: number | null;
  quoteRequestId: number;
}

/**
 * Định dạng tiền tất định, KHÔNG dùng Intl/toLocaleString: kết quả của
 * toLocaleString('vi-VN') phụ thuộc bản build Node có đủ ICU hay không — thiếu ICU
 * thì dấu chấm ngăn cách hàng nghìn biến thành dấu phẩy, cùng một test pass ở máy
 * này và fail ở máy khác. `v` thường là Prisma Decimal (OrderDepartment.amount) nên
 * Number(v) là bước chuẩn hoá bắt buộc trước khi định dạng.
 */
const money = (v: unknown): string | undefined => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
};

/**
 * Tầng FORMAT nội dung thông báo cho khách. Tầng ghi dòng là
 * NotifyService.pushCustomer — tách ra vì hai trách nhiệm khác nhau, và vì nhờ
 * thế mỗi điểm gọi trong orders/quotes/milestones chỉ tốn một dòng (trần 300
 * dòng mỗi file của repo).
 *
 * Mọi method đều IM LẶNG khi không tìm ra khách: đơn do Sale tự tạo không đến từ
 * yêu cầu báo giá nào, đó là ca bình thường chứ không phải lỗi.
 *
 * Mọi method public đều tự bọc try/catch: các đọc Prisma bên trong (quoteRequest,
 * order, orderDepartment) có thể ném lỗi, và lỗi đó không được lọt ra ngoài tới
 * nơi gọi — ở mọi điểm gọi hiện tại và sáu điểm gọi sắp tới (Task 6, 8), việc này
 * xảy ra SAU khi nghiệp vụ chính (vd chọn báo giá) đã commit. Bọc một lần ở đây
 * thay vì nhớ bọc lại ở từng call site, giống cách NotifyService.push/pushCustomer
 * tự nuốt lỗi ghi thông báo của chúng.
 */
@Injectable()
export class CustomerNotifyService {
  private readonly logger = new Logger(CustomerNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** Tra ngược từ đơn về khách qua quote_requests.converted_to_order_id. */
  private async refOfOrder(orderId: number): Promise<CustomerRef | null> {
    const qr = await this.prisma.quoteRequest.findFirst({
      where: { convertedToOrderId: orderId },
      select: { id: true, customerId: true },
    });
    return qr ? { customerId: qr.customerId, quoteRequestId: qr.id } : null;
  }

  private async refOfRequest(quoteRequestId: number): Promise<CustomerRef | null> {
    const qr = await this.prisma.quoteRequest.findUnique({
      where: { id: quoteRequestId },
      select: { id: true, customerId: true },
    });
    return qr ? { customerId: qr.customerId, quoteRequestId: qr.id } : null;
  }

  /** Sale chốt giá — đơn sang awaiting_customer. Loại thông báo chính của luồng này. */
  async quoteReady(orderId: number, departmentId: number): Promise<void> {
    try {
      const ref = await this.refOfOrder(orderId);
      if (!ref) return;
      const [order, dept] = await Promise.all([
        this.prisma.order.findUnique({
          where: { id: orderId }, select: { code: true, source: true, salePrice: true },
        }),
        this.prisma.orderDepartment.findUnique({
          where: { orderId_departmentId: { orderId, departmentId } },
          select: { amount: true },
        }),
      ]);
      if (!order) return;
      await this.notify.pushCustomer([
        {
          ...ref,
          orderId,
          type: CustomerNotifType.QUOTE_READY,
          title: `Báo giá đơn ${order.code} đã có`,
          // Đơn landing: giá Sale chốt, không phải giá phòng ban — xem gia-sale.helper.
          body: money(giaChoKhach(order, dept?.amount)),
        },
      ]);
    } catch (e) {
      this.logger.error({ err: e }, 'Báo khách giá đã sẵn sàng thất bại');
    }
  }

  /**
   * Không có cái này thì khách gửi form xong không thấy hồi âm sẽ gửi lại lần hai,
   * lần ba, và Sale nhận ba yêu cầu trùng.
   */
  async quoteRequestReceived(quoteRequestId: number): Promise<void> {
    try {
      const ref = await this.refOfRequest(quoteRequestId);
      if (!ref) return;
      await this.notify.pushCustomer([
        {
          ...ref,
          type: CustomerNotifType.QUOTE_REQUEST_RECEIVED,
          title: `Đã nhận yêu cầu báo giá #${quoteRequestId}`,
          body: 'Chúng tôi sẽ gửi báo giá tới bạn trong thời gian sớm nhất.',
        },
      ]);
    } catch (e) {
      this.logger.error({ err: e }, 'Báo khách đã nhận yêu cầu báo giá thất bại');
    }
  }

  async quoteRequestRejected(quoteRequestId: number, reason: string): Promise<void> {
    try {
      const ref = await this.refOfRequest(quoteRequestId);
      if (!ref) return;
      await this.notify.pushCustomer([
        {
          ...ref,
          type: CustomerNotifType.QUOTE_REQUEST_REJECTED,
          title: `Yêu cầu báo giá #${quoteRequestId} chưa thể tiếp nhận`,
          body: `Lý do: ${reason}`,
        },
      ]);
    } catch (e) {
      this.logger.error({ err: e }, 'Báo khách từ chối yêu cầu báo giá thất bại');
    }
  }

  /** Dùng chung cho mọi sự kiện ở tầng đơn hàng (chốt, huỷ, mốc, hoàn thành). */
  async orderEvent(
    orderId: number,
    type: CustomerNotifType,
    title: string,
    body?: string,
  ): Promise<void> {
    try {
      const ref = await this.refOfOrder(orderId);
      if (!ref) return;
      await this.notify.pushCustomer([{ ...ref, orderId, type, title, body }]);
    } catch (e) {
      this.logger.error({ err: e }, 'Báo sự kiện đơn hàng cho khách thất bại');
    }
  }
}
