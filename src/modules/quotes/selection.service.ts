import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { CommentKind, DeptState, NotifType, OrderStatus, REVENUE_STATUSES, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { assertTransition } from '../orders/order-state.helper';
import {
  AddDepartmentDto, ReferencePriceDto, RequestRevisionDto, SelectQuoteDto, SetSalePriceDto,
} from './dto/quote.dto';
import { laDonLanding } from '../orders/gia-sale.helper';
import { huyChoKy } from '@/modules/signatures/huy-cho-ky';

@Injectable()
export class SelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly customerNotify: CustomerNotifyService,
  ) {}

  private async ownedOrder(orderId: number, user: AuthenticatedUser) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, this.scope.orderWhere(user)] },
      include: { departments: { include: { department: { select: { isQuoting: true } } } } },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (o.createdBy !== user.id && !user.roles.includes(Role.ADMIN))
      throw new ForbiddenException('Chỉ sale phụ trách đơn mới thao tác được');
    return o;
  }

  /**
   * Đặc tả: "phòng thắng thành phòng phụ trách chính thức; các phòng khác nhận thông
   * báo kết thúc" — xảy ra NGAY ở bước chọn. Nhưng CHƯA ghi finalAmount: doanh thu chỉ
   * khóa khi khách đồng ý và sale bấm Chốt.
   */
  async selectQuote(orderId: number, dto: SelectQuoteDto, user: AuthenticatedUser): Promise<void> {
    const order = await this.ownedOrder(orderId, user);
    const won = order.departments.find((d) => d.departmentId === dto.departmentId);
    if (!won) throw new BadRequestException('Phòng ban không tham gia đơn này');
    if (won.amount === null) throw new BadRequestException('Phòng này chưa gửi báo giá');
    // Sale chỉ chốt được giá do Phòng báo giá gửi về (079). Báo giá cũ của các
    // phòng khác còn nằm lại làm lịch sử nhưng không chọn được nữa.
    if (!won.department.isQuoting)
      throw new BadRequestException('Chỉ chọn được báo giá của Phòng báo giá');

    // QA-18: chặn chọn lần hai bằng câu chỉ đúng đường đi tiếp. Mốc nhận biết giờ
    // là departmentId chứ không phải trạng thái: từ khi gộp "chờ sale chọn" với
    // "chờ khách xác nhận" (migration 023), chọn báo giá KHÔNG đổi trạng thái nữa
    // nên trạng thái không còn nói được là đã chọn hay chưa.
    if (order.departmentId !== null)
      throw new ConflictException(
        'Đơn đã chọn phòng phụ trách. Muốn đổi phòng, hãy gửi yêu cầu điều chỉnh giá ' +
          'để mở lại vòng chọn.',
      );

    await this.prisma.$transaction(async (tx) => {
      // Chọn từ 'quoting' (chưa đủ phòng trả lời nhưng sale đã quyết) thì kéo đơn
      // sang "Chờ chốt giá"; đang ở đó rồi thì chỉ gắn phòng. Vẫn đi qua
      // assertTransition để đơn đã chốt hoặc đã huỷ không lọt xuống đây.
      const needsMove = order.status !== OrderStatus.AWAITING_SELECTION;
      if (needsMove) assertTransition(order.status, OrderStatus.AWAITING_SELECTION);
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...(needsMove ? { status: OrderStatus.AWAITING_SELECTION } : {}),
          departmentId: dto.departmentId,
          updatedAt: new Date(),
        },
      });
      await tx.orderDepartment.updateMany({
        where: { orderId, state: DeptState.QUOTED }, // 'passed' giữ nguyên
        data: { state: DeptState.LOST },
      });
      await tx.orderDepartment.update({
        where: { orderId_departmentId: { orderId, departmentId: dto.departmentId } },
        data: { state: DeptState.WON },
      });
      await this.activity.log(tx, {
        orderId, entity: 'orders', entityId: orderId, action: 'select_quote', actorId: user.id,
        detail: { departmentId: dto.departmentId, reason: dto.reason ?? null },
      });
    });

    for (const d of order.departments) {
      if (d.state === DeptState.PASSED) continue;
      const isWinner = d.departmentId === dto.departmentId;
      const users = await this.notify.deptRecipients(null, orderId, d.departmentId);
      await this.notify.push(
        users.map((userId) => ({
          userId, orderId,
          type: isWinner ? NotifType.QUOTE_WON : NotifType.QUOTE_LOST,
          title: isWinner
            ? `Báo giá của phòng bạn được chọn — đơn ${order.code}`
            : `Đơn ${order.code} đã chọn phòng khác`,
        })),
      );
    }

    // Khách đã gửi yêu cầu báo giá cần biết giá đã chốt. Gọi SAU vòng bắn cho các
    // phòng. quoteReady tự bọc try/catch và không bao giờ throw ra đây — lỗi đọc/ghi
    // thông báo không được biến một lần chọn giá ĐÃ commit thành công thành lỗi 500.
    // Đơn landing: giá phòng ban là giá vốn — khách chỉ được báo khi Sale nhập
    // giá chốt (setSalePrice).
    if (!laDonLanding(order.source)) await this.customerNotify.quoteReady(orderId, dto.departmentId);
  }

  /**
   * Sale nhập giá đã thoả thuận riêng với khách — mọi đơn, sau khi chọn phòng
   * thắng. Bắt buộc với đơn landing, tuỳ chọn với đơn khác (không nhập thì dùng
   * giá phòng thắng). Không thấp hơn giá phòng thắng — Sale không được bán dưới
   * giá vốn; cần giảm thì yêu cầu phòng ban báo lại.
   */
  async setSalePrice(orderId: number, dto: SetSalePriceDto, user: AuthenticatedUser): Promise<void> {
    const order = await this.ownedOrder(orderId, user);
    if (order.status !== OrderStatus.AWAITING_SELECTION || order.departmentId === null)
      throw new ConflictException('Chọn báo giá thắng trước, rồi mới nhập giá chốt với khách');
    const won = order.departments.find((d) => d.departmentId === order.departmentId);
    if (!won || won.amount === null) throw new BadRequestException('Phòng thắng chưa có báo giá');
    if (dto.salePrice < Number(won.amount))
      throw new BadRequestException(
        `Giá chốt không được thấp hơn giá phòng ban (${Number(won.amount).toLocaleString('vi-VN')}đ)`,
      );

    // Giá đổi thì yêu cầu ký đang chờ phải huỷ: khách không được ký vào con số cũ.
    await huyChoKy(this.prisma, orderId);
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId }, data: { salePrice: dto.salePrice, updatedAt: new Date() },
      });
      await this.activity.log(tx, {
        orderId, entity: 'orders', entityId: orderId, action: 'set_sale_price', actorId: user.id,
        detail: { salePrice: dto.salePrice, giaPhongBan: Number(won.amount) },
      });
    });
    await this.customerNotify.quoteReady(orderId, order.departmentId);
  }

  /**
   * Mở lại vòng giá. Đơn ĐÃ chọn phòng thì BẮT BUỘC hoàn tác việc chọn — quên
   * bước này thì đơn quay lại quoting nhưng vẫn mang phòng phụ trách và một
   * phòng 'won' của vòng trước.
   */
  async requestRevision(
    orderId: number,
    dto: RequestRevisionDto,
    user: AuthenticatedUser,
  ): Promise<void> {
    const order = await this.ownedOrder(orderId, user);
    const known = new Set(order.departments.map((d) => d.departmentId));
    if (dto.departmentIds.some((id) => !known.has(id)))
      throw new BadRequestException('Có phòng ban không tham gia đơn này');

    /* Mở lại vòng chọn thì số tiền trên phiếu sắp đổi, nên yêu cầu ký đang chờ
       phải chết theo: khách ký vào bản cũ là ký một con số không còn áp dụng. */
    await huyChoKy(this.prisma, orderId);

    // Dấu hiệu đã chọn là departmentId, không phải trạng thái — xem ghi chú
    // trong selectQuote.
    const wasSelected = order.departmentId !== null;

    await this.prisma.$transaction(async (tx) => {
      assertTransition(order.status, OrderStatus.QUOTING);

      if (wasSelected) {
        // Giá chốt của Sale dựa trên giá phòng cũ — mở lại vòng giá thì xoá theo.
        await tx.order.update({ where: { id: orderId }, data: { departmentId: null, salePrice: null } });
        await tx.orderDepartment.updateMany({
          where: { orderId, state: { in: [DeptState.WON, DeptState.LOST] } },
          data: { state: DeptState.QUOTED },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.QUOTING, updatedAt: new Date() },
      });

      await tx.comment.createMany({
        data: dto.departmentIds.map((departmentId) => ({
          orderId,
          departmentId,
          userId: user.id,
          kind: CommentKind.REVISION_REQUEST,
          body: dto.reason,
        })),
      });

      await this.activity.log(tx, {
        orderId, entity: 'orders', entityId: orderId, action: 'request_revision',
        actorId: user.id, detail: { departmentIds: dto.departmentIds, undoSelection: wasSelected },
      });
    });

    for (const deptId of dto.departmentIds) {
      const users = await this.notify.deptRecipients(null, orderId, deptId);
      await this.notify.push(
        users.map((userId) => ({
          userId, orderId, type: NotifType.REVISION_REQUESTED,
          title: `Yêu cầu điều chỉnh báo giá — đơn ${order.code}`,
          body: dto.reason,
        })),
      );
    }
  }

  /** Admin thêm phòng ngoài cấu hình. Đơn ở awaiting_selection phải quay về quoting. */
  async addDepartment(orderId: number, dto: AddDepartmentDto, user: AuthenticatedUser): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept || !dept.isActive) throw new BadRequestException('Phòng ban không hợp lệ');
    if (dept.isSales) throw new BadRequestException('Phòng Sale không tham gia báo giá');
    if (!dept.isQuoting) throw new BadRequestException('Chỉ Phòng báo giá tham gia báo giá');

    const existing = await this.prisma.orderDepartment.findUnique({
      where: { orderId_departmentId: { orderId, departmentId: dto.departmentId } },
    });
    if (existing) throw new BadRequestException('Phòng ban đã có trong đơn này');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDepartment.create({
        data: { orderId, departmentId: dto.departmentId, isManual: true },
      });

      // Thêm phòng mới thì không còn đúng "mọi phòng đã trả lời".
      let next: OrderStatus | null = null;
      if (order.status === OrderStatus.NEW) next = OrderStatus.DISTRIBUTED;
      else if (order.status === OrderStatus.AWAITING_SELECTION) next = OrderStatus.QUOTING;
      if (next) {
        assertTransition(order.status, next);
        await tx.order.update({ where: { id: orderId }, data: { status: next, updatedAt: new Date() } });
      }

      await this.activity.log(tx, {
        orderId, entity: 'orders', entityId: orderId, action: 'add_department',
        actorId: user.id, detail: { departmentId: dto.departmentId, manual: true },
      });
    });

    await this.notify.push(
      (await this.notify.deptRecipients(null, orderId, dto.departmentId)).map((userId) => ({
        userId, orderId, type: NotifType.NEW_ORDER,
        title: `Đơn ${order.code} được chuyển tới phòng bạn`,
      })),
    );
  }

  /**
   * Đơn giá tham khảo: 5 đơn thành công gần nhất, xếp theo độ khớp.
   * CHỈ khớp theo trường số cố định — tuyệt đối không đụng orders.note.
   */
  async referencePrices(orderId: number, user: AuthenticatedUser): Promise<ReferencePriceDto[]> {
    const order = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, this.scope.orderWhere(user)] },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    const dimVolume =
      order.dimLM && order.dimWM && order.dimHM
        ? Number(order.dimLM) * Number(order.dimWM) * Number(order.dimHM)
        : null;

    // Q-09: trước đây chỉ so tuyến + khối lượng + thể tích. Với hàng cồng kềnh, số
    // kiện và kích thước quyết định giá nhiều hơn cân nặng, nên cộng thêm hai vế.
    // Tuyến vẫn nặng nhất (2 điểm) — cùng tuyến khác tải vẫn gần hơn khác tuyến.
    return this.prisma.$queryRaw<ReferencePriceDto[]>`
      SELECT o.code, o.final_amount::float8 AS "finalAmount", o.closed_at AS "closedAt",
             o.origin_province AS "originProvince", o.destination_province AS "destinationProvince",
             o.weight_kg::float8 AS "weightKg", o.volume_cbm::float8 AS "volumeCbm",
             o.package_count AS "packageCount", o.container_type AS "containerType",
             ( (CASE WHEN o.origin_province      = ${order.originProvince} THEN 2 ELSE 0 END)
             + (CASE WHEN o.destination_province = ${order.destinationProvince} THEN 2 ELSE 0 END)
             + (CASE WHEN ${order.weightKg}::numeric IS NOT NULL AND o.weight_kg
                        BETWEEN ${order.weightKg}::numeric * 0.7 AND ${order.weightKg}::numeric * 1.3
                     THEN 1 ELSE 0 END)
             + (CASE WHEN ${order.volumeCbm}::numeric IS NOT NULL AND o.volume_cbm
                        BETWEEN ${order.volumeCbm}::numeric * 0.7 AND ${order.volumeCbm}::numeric * 1.3
                     THEN 1 ELSE 0 END)
             + (CASE WHEN ${order.packageCount}::int IS NOT NULL AND o.package_count
                        BETWEEN ${order.packageCount}::int * 0.7 AND ${order.packageCount}::int * 1.3
                     THEN 1 ELSE 0 END)
             -- Kích thước so bằng THỂ TÍCH BAO NGOÀI: cùng khối 2x1x1 và 1x2x1 là
             -- một bài toán xếp hàng như nhau, so từng cạnh sẽ trượt oan.
             + (CASE WHEN ${dimVolume}::numeric IS NOT NULL
                       AND o.dim_l_m * o.dim_w_m * o.dim_h_m
                        BETWEEN ${dimVolume}::numeric * 0.7 AND ${dimVolume}::numeric * 1.3
                     THEN 1 ELSE 0 END)
             -- ::text bắt buộc: tham số NULL trần thì Postgres không suy được kiểu
             -- và ném 42P18 could not determine data type of parameter.
             + (CASE WHEN o.container_type = ${order.containerType}::text THEN 1 ELSE 0 END)
             ) AS "matchScore"
      FROM orders o
      WHERE o.service_id = ${order.serviceId}
        AND o.id <> ${orderId}
        AND o.final_amount IS NOT NULL
        AND o.status = ANY(${REVENUE_STATUSES}::text[])
      ORDER BY "matchScore" DESC, o.closed_at DESC
      LIMIT 5`;
  }
}
