import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderStatus } from '@/common/enums';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ServiceDataValidator } from '../services/service-data.validator';
import { OrderFilterDto } from './dto/order-filter.dto';
import { OrderDetailDto, OrderListItemDto, TimelineItemDto } from './dto/order-response.dto';
import { missingOrderInfo } from './order-completeness.helper';
import { ORDER_DETAIL_INCLUDE, ORDER_LIST_INCLUDE, toDetail, toListItem } from './orders.mapper';
import { customerDisplayName } from '@/common/customer-display-name';

/**
 * `service_data` lưu đúng kiểu JSON (số là number, cờ là boolean), còn query string
 * chỉ có chuỗi. Kiểu của trường nằm trong `service_fields` — một truy vấn nữa, trong
 * khi buildWhere() là hàm đồng bộ và còn được orders-export dùng lại.
 *
 * Nên so với MỌI cách đọc hợp lệ của chuỗi đó thay vì đoán lấy một. Đoán sai là im
 * lặng trả 0 dòng: mã HS "9999.99" là text, nhưng đọc như số thì không khớp gì cả.
 */
function jsonCandidates(raw: string): (string | number | boolean)[] {
  const out: (string | number | boolean)[] = [raw];
  if (raw === 'true' || raw === 'false') out.push(raw === 'true');
  const asNumber = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(asNumber)) out.push(asNumber);
  return out;
}

/** Toàn bộ đường ĐỌC của đơn hàng. Mọi truy vấn đều AND với scope.orderWhere(). */
@Injectable()
export class OrdersQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly serviceData: ServiceDataValidator,
  ) {}

  buildWhere(f: OrderFilterDto, user: AuthenticatedUser): Prisma.OrderWhereInput {
    // Danh sách và kanban là đường ĐỌC — dùng phạm vi đọc, xem orderReadWhere.
    const and: Prisma.OrderWhereInput[] = [this.scope.orderReadWhere(user)];
    if (f.status) and.push({ status: f.status });
    if (f.serviceId) and.push({ serviceId: f.serviceId });
    if (f.customerId) and.push({ customerId: f.customerId });
    if (f.createdBy) and.push({ createdBy: f.createdBy });
    if (f.originProvince) and.push({ originProvince: f.originProvince });
    if (f.destinationProvince) and.push({ destinationProvince: f.destinationProvince });
    if (f.departmentId) and.push({ departments: { some: { departmentId: f.departmentId } } });
    if (f.assigneeId) and.push({ departments: { some: { assigneeId: f.assigneeId } } });
    for (const pair of f.sf ?? []) {
      const at = pair.indexOf(':');
      const path = [pair.slice(0, at)];
      and.push({
        OR: jsonCandidates(pair.slice(at + 1)).map((value) => ({
          serviceData: { path, equals: value },
        })),
      });
    }
    if (f.q)
      and.push({
        OR: [
          { code: { contains: f.q, mode: 'insensitive' } },
          { customer: { companyName: { contains: f.q, mode: 'insensitive' } } },
          // Khách từ website chỉ có tên người liên hệ — không khớp cột này
          // thì gõ đúng tên khách vẫn ra danh sách rỗng.
          { customer: { contactName: { contains: f.q, mode: 'insensitive' } } },
        ],
      });

    const field =
      f.dateField === 'closed' ? 'closedAt' : f.dateField === 'completed' ? 'completedAt' : 'createdAt';
    if (f.fromDate || f.toDate)
      and.push({
        [field]: {
          ...(f.fromDate ? { gte: new Date(f.fromDate) } : {}),
          ...(f.toDate ? { lte: new Date(`${f.toDate}T23:59:59.999Z`) } : {}),
        },
      } as Prisma.OrderWhereInput);

    return { AND: and };
  }

  async list(f: OrderFilterDto, user: AuthenticatedUser): Promise<PageResult<OrderListItemDto>> {
    const where = this.buildWhere(f, user);
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { [f.sortBy ?? 'createdAt']: f.sortOrder },
        skip: f.skip,
        take: f.limit,
      }),
    ]);
    return { items: rows.map((r) => toListItem(r, user)), total, page: f.page, limit: f.limit };
  }

  async kanban(
    f: OrderFilterDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, OrderListItemDto[]>> {
    const rows = await this.prisma.order.findMany({
      where: this.buildWhere(f, user),
      include: ORDER_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    const out: Record<string, OrderListItemDto[]> = {};
    for (const r of rows) {
      const col = (out[r.status] ??= []);
      if (col.length < 50) col.push(toListItem(r, user));
    }
    return out;
  }

  /** Ngoài phạm vi quyền -> 404 chứ không 403: 403 là gián tiếp xác nhận đơn tồn tại. */
  async findScoped(id: number, user: AuthenticatedUser) {
    const order = await this.prisma.order.findFirst({
      where: { AND: [{ id }, this.scope.orderWhere(user)] },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  /**
   * Như findScoped nhưng theo phạm vi ĐỌC (orderReadWhere). Chỉ dùng cho màn
   * xem; mọi thao tác ghi phải đi qua findScoped để không ai mượn quyền xem làm
   * quyền sửa.
   */
  async findReadable(id: number, user: AuthenticatedUser) {
    const order = await this.prisma.order.findFirst({
      where: { AND: [{ id }, this.scope.orderReadWhere(user)] },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  async detail(id: number, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const order = await this.findReadable(id, user);
    return { ...toDetail(order, user), missingInfo: await this.missingInfoOf(order) };
  }

  /**
   * Trả lời "đơn này còn thiếu gì" bằng ĐÚNG hàm mà create() và promoteIfComplete()
   * dùng — admin in thẳng mảng này chứ không tự chấm lại, hai bản chấm là hai bản
   * sẽ lệch nhau.
   *
   * Thoát sớm khi đơn không ở awaiting_info: câu trả lời khi đó luôn là rỗng, không
   * đáng để mọi lần mở chi tiết đơn phải gánh thêm một truy vấn service_fields.
   */
  private async missingInfoOf(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>,
  ): Promise<string[]> {
    if (order.status !== OrderStatus.AWAITING_INFO) return [];
    return missingOrderInfo({
      // Chỗ chấm THỨ BA của cùng một luật — lệch với create() hoặc với
      // promoteIfComplete() là banner bảo nhân viên điền một thứ mà hệ thống
      // không đòi, hoặc im lặng về thứ đang chặn đơn.
      serviceChildId: order.serviceChildId,
      coDichVuCon: (order.service._count?.children ?? 0) > 0,
      customerName: customerDisplayName(order.customer),
      phone: order.customer?.phone ?? null,
      serviceId: order.serviceId,
      originProvince: order.originProvince,
      destinationProvince: order.destinationProvince,
      serviceData: (order.serviceData ?? {}) as Record<string, unknown>,
      requiredFields: await this.serviceData.requiredFieldsOf(order.serviceId),
      // Phải truyền cờ ở ĐÂY nữa. Thiếu nó thì banner vẫn bảo nhân viên điền
      // "Điểm đến" trong khi ô đó đã bị ẩn và backend cũng không còn đòi — họ đi
      // tìm một ô không tồn tại.
      hasDomesticDestination: order.service.hasDomesticDestination,
    });
  }

  /** activity_log không có trần: dòng thời gian một đơn dài dần theo mọi thao tác. */
  async timeline(
    id: number,
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<PageResult<TimelineItemDto>> {
    await this.findReadable(id, user);
    const where = { orderId: id };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((a) => ({
        createdAt: a.createdAt,
        action: a.action,
        actorName: a.actor?.fullName ?? null,
        detail: a.detail,
      })),
      total,
      page,
      limit,
    };
  }

  /** Hàng đợi "Chưa định tuyến" cho Admin. */
  async unrouted(user: AuthenticatedUser): Promise<OrderListItemDto[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: OrderStatus.NEW, departments: { none: {} } },
      include: ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => toListItem(r, user));
  }
}
