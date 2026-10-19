import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { DeptState, NotifType, OrderStatus, Role } from '@/common/enums';
import { PrismaService, Tx } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { tuChotDonBeeLogs } from './tu-chot-don-bee-logs';
import { assertDeptWorkable, assertTransition } from '../orders/order-state.helper';
import { AssignDto, PassDto, QuoteDto, TransferDto } from './dto/quote.dto';
import { runTransfer } from './transfer.helper';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly customerNotify: CustomerNotifyService,
  ) {}

  /** Chỉ người của chính phòng đó (hoặc Admin) mới thao tác được trên dòng phòng đó. */
  private assertOwnDepartment(user: AuthenticatedUser, departmentId: number): void {
    if (user.roles.includes(Role.ADMIN)) return;
    if (user.departmentId !== departmentId)
      throw new ForbiddenException('Bạn không thuộc phòng ban này');
  }

  private async row(orderId: number, departmentId: number) {
    const od = await this.prisma.orderDepartment.findUnique({
      where: { orderId_departmentId: { orderId, departmentId } },
    });
    if (!od) throw new NotFoundException('Phòng ban này không được phân phối đơn');
    return od;
  }

  /** Đơn phải nằm trong phạm vi quyền — nếu không thì 404 như mọi chỗ khác. */
  private async assertOrderVisible(orderId: number, user: AuthenticatedUser) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, this.scope.orderWhere(user)] },
      select: { id: true, code: true, status: true, createdBy: true },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn hàng');
    return o;
  }

  async claim(orderId: number, deptId: number, user: AuthenticatedUser): Promise<void> {
    const order = await this.assertOrderVisible(orderId, user);
    assertDeptWorkable(order.status);
    this.assertOwnDepartment(user, deptId);
    const od = await this.row(orderId, deptId);
    if (od.state !== DeptState.PENDING)
      throw new BadRequestException('Đơn này phòng bạn đã tiếp nhận hoặc đã bỏ qua');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDepartment.update({
        where: { orderId_departmentId: { orderId, departmentId: deptId } },
        data: { state: DeptState.CLAIMED, assigneeId: user.id, claimedAt: new Date() },
      });
      await this.activity.log(tx, {
        orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
        action: 'claim', actorId: user.id,
      });
    });
  }

  async assign(orderId: number, deptId: number, dto: AssignDto, user: AuthenticatedUser): Promise<void> {
    const visible = await this.assertOrderVisible(orderId, user);
    assertDeptWorkable(visible.status);
    this.assertOwnDepartment(user, deptId);
    const target = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!target || !target.isActive || target.departmentId !== deptId)
      throw new BadRequestException('Nhân viên không thuộc phòng ban này');
    // Người được giao là người NHẬP BÁO GIÁ — mà chỉ Pricing nhập được báo giá.
    // Giao cho người khác là giao một việc họ không làm được.
    if (!target.roles.includes(Role.STAFF))
      throw new BadRequestException('Chỉ giao được cho Pricing — người được giao sẽ nhập báo giá');

    const od = await this.row(orderId, deptId);
    await this.prisma.$transaction(async (tx) => {
      await tx.orderDepartment.update({
        where: { orderId_departmentId: { orderId, departmentId: deptId } },
        data: {
          assigneeId: dto.assigneeId,
          state: od.state === DeptState.PENDING ? DeptState.CLAIMED : od.state,
          claimedAt: od.claimedAt ?? new Date(),
        },
      });
      await this.activity.log(tx, {
        orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
        action: 'assign', actorId: user.id, detail: { assigneeId: dto.assigneeId },
      });
    });

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId }, select: { code: true },
    });
    await this.notify.push([
      {
        userId: dto.assigneeId, orderId, type: NotifType.ASSIGNED,
        title: `Bạn được gán đơn ${order.code}`,
      },
    ]);
  }

  async pass(orderId: number, deptId: number, dto: PassDto, user: AuthenticatedUser): Promise<void> {
    const order = await this.assertOrderVisible(orderId, user);
    assertDeptWorkable(order.status);
    this.assertOwnDepartment(user, deptId);
    const od = await this.row(orderId, deptId);
    if ([DeptState.WON, DeptState.LOST].includes(od.state as DeptState))
      throw new BadRequestException('Đơn đã qua vòng chọn báo giá, không bỏ qua được nữa');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDepartment.update({
        where: { orderId_departmentId: { orderId, departmentId: deptId } },
        data: { state: DeptState.PASSED, passReason: dto.reason },
      });
      await this.activity.log(tx, {
        orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
        action: 'pass', actorId: user.id, detail: { reason: dto.reason },
      });
      await this.settleCheck(tx, orderId);
    });
    await this.notifyAfterSettle(orderId);
  }

  async transfer(
    orderId: number,
    deptId: number,
    dto: TransferDto,
    user: AuthenticatedUser,
  ): Promise<void> {
    const order = await this.assertOrderVisible(orderId, user);
    assertDeptWorkable(order.status);
    this.assertOwnDepartment(user, deptId);
    const sourceRow = await this.row(orderId, deptId);
    await runTransfer(
      { prisma: this.prisma, activity: this.activity, notify: this.notify },
      orderId, deptId, dto, user,
      { order, sourceRow },
      (tx, id) => this.settleCheck(tx, id),
    );
  }

  /** F3 — gửi/cập nhật báo giá, đẩy bản cũ xuống quote_history. */
  async quote(orderId: number, deptId: number, dto: QuoteDto, user: AuthenticatedUser): Promise<void> {
    const order = await this.assertOrderVisible(orderId, user);
    // QA-31: state của dòng phòng ban KHÔNG nói gì về đơn đã hủy/đã chốt — đơn
    // cancelled vẫn có dòng ở 'pending' nên mọi kiểm tra dưới đây đều lọt.
    assertDeptWorkable(order.status);
    this.assertOwnDepartment(user, deptId);
    const od = await this.row(orderId, deptId);
    if (od.state === DeptState.PASSED)
      throw new BadRequestException('Phòng bạn đã bỏ qua đơn này');
    if ([DeptState.WON, DeptState.LOST].includes(od.state as DeptState))
      throw new BadRequestException('Đơn đã qua vòng chọn báo giá');
    /* Ai NHẬN đơn (hoặc được trưởng phòng GIAO) thì người đó nhập báo giá
       (12/10/2026). Trước đây ai trong phòng cũng gửi được, kể cả khi chưa ai
       nhận — hai người có thể cùng nhập, và không ai biết con số nào là của
       người chịu trách nhiệm. */
    if (od.assigneeId === null)
      throw new ForbiddenException('Đơn chưa ai nhận — bấm "Nhận đơn" ở Hàng đợi phòng ban trước rồi mới nhập báo giá');
    if (od.assigneeId !== user.id)
      throw new ForbiddenException('Đơn này do người khác trong phòng phụ trách báo giá');

    // QA-17: PATCH kiểu "chỉ gửi amount" đang xóa trắng phạm vi/thời gian/hiệu lực
    // của bản báo giá cũ. Vắng mặt khóa = GIỮ NGUYÊN; gửi null tường minh mới là xóa.
    const sent = (k: keyof QuoteDto): boolean => Object.prototype.hasOwnProperty.call(dto, k);

    await this.prisma.$transaction(async (tx) => {
      // Đọc lại trong giao dịch: `od` ở trên nằm ngoài, có thể đã cũ.
      const cur = await tx.orderDepartment.findUniqueOrThrow({
        where: { orderId_departmentId: { orderId, departmentId: deptId } },
        select: { scopeNote: true, leadTime: true, validUntil: true },
      });
      const scopeNote = sent('scopeNote') ? (dto.scopeNote ?? null) : cur.scopeNote;
      const leadTime = sent('leadTime') ? (dto.leadTime ?? null) : cur.leadTime;
      const validUntil = sent('validUntil')
        ? (dto.validUntil ? new Date(dto.validUntil) : null)
        : cur.validUntil;

      // first_quoted_at GIỮ NGUYÊN lần đầu (mốc SLA), last_quoted_at mới là lần gần nhất.
      await tx.$executeRaw`
        UPDATE order_departments SET
          quote_history = CASE WHEN quote_version = 0 THEN quote_history
            ELSE quote_history || jsonb_build_object(
              'version', quote_version, 'amount', amount, 'scope_note', scope_note,
              'lead_time', lead_time, 'valid_until', valid_until,
              'by', assignee_id, 'at', last_quoted_at) END,
          quote_version   = quote_version + 1,
          amount          = ${dto.amount},
          scope_note      = ${scopeNote},
          lead_time       = ${leadTime},
          valid_until     = ${validUntil},
          state           = 'quoted',
          assignee_id     = COALESCE(assignee_id, ${user.id}),
          claimed_at      = COALESCE(claimed_at, now()),
          first_quoted_at = COALESCE(first_quoted_at, now()),
          last_quoted_at  = now()
        WHERE order_id = ${orderId} AND department_id = ${deptId}`;

      await this.activity.log(tx, {
        orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
        action: 'quote', actorId: user.id, detail: { amount: dto.amount },
      });
      await this.settleCheck(tx, orderId);
    });

    await this.notify.push([
      {
        userId: order.createdBy, orderId, type: NotifType.QUOTE_RECEIVED,
        title: `Có báo giá mới cho đơn ${order.code}`,
      },
    ]);
    const daChot = await tuChotDonBeeLogs(
      { prisma: this.prisma, activity: this.activity, notify: this.notify, customerNotify: this.customerNotify },
      orderId, deptId, user.id,
    );
    if (!daChot) await this.notifyAfterSettle(orderId);
  }

  /**
   * Chỗ DUY NHẤT đẩy distributed -> quoting -> awaiting_selection.
   * Nhánh "mọi phòng đều passed" phải nằm TRƯỚC phép tính next, nếu không hàm đã
   * return vì next === status và không ai biết đơn đang bế tắc.
   */
  private async settleCheck(tx: Tx, orderId: number): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (![OrderStatus.DISTRIBUTED, OrderStatus.QUOTING].includes(order.status as OrderStatus))
      return;

    const rows = await tx.orderDepartment.findMany({
      where: { orderId }, select: { state: true },
    });
    if (!rows.length) return;

    const settled = rows.every((r) => r.state === DeptState.QUOTED || r.state === DeptState.PASSED);
    const anyQuote = rows.some((r) => r.state === DeptState.QUOTED);

    if (settled && !anyQuote) return; // bế tắc — thông báo xử lý ở notifyAfterSettle

    const next = settled
      ? OrderStatus.AWAITING_SELECTION
      : anyQuote
        ? OrderStatus.QUOTING
        : (order.status as OrderStatus);
    if (next === order.status) return;

    assertTransition(order.status, next);
    await tx.order.update({ where: { id: orderId }, data: { status: next, updatedAt: new Date() } });
  }

  /** Mọi phòng đều bỏ qua -> không có gì để chọn. Báo sale + Admin xử lý tay. */
  private async notifyAfterSettle(orderId: number): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { code: true, status: true, createdBy: true, departments: { select: { state: true } } },
    });
    const all = order.departments;
    if (!all.length) return;
    if (!all.every((d) => d.state === DeptState.PASSED)) return;

    const admins = await this.notify.admins();
    await this.notify.push(
      [...new Set([order.createdBy, ...admins])].map((userId) => ({
        userId, orderId, type: NotifType.ALL_PASSED,
        title: `Đơn ${order.code}: mọi phòng đều bỏ qua`,
        body: 'Không có báo giá nào để chọn. Cần thêm phòng ngoài cấu hình hoặc hủy đơn.',
      })),
    );
  }
}
