import { BadRequestException, ConflictException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { DeptState, NotifType, OrderStatus } from '@/common/enums';
import { PrismaService, Tx } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { assertTransition } from '../orders/order-state.helper';
import { TransferDto } from './dto/quote.dto';

export interface TransferDeps {
  prisma: PrismaService;
  activity: ActivityService;
  notify: NotifyService;
}

export interface TransferCtx {
  order: { code: string; status: string };
  sourceRow: { state: string };
}

/**
 * F3 — chuyển đơn sang phòng khác trong một thao tác. Tách khỏi QuotesService
 * cho vừa giới hạn 300 dòng/file; QuotesService.transfer gọi trực tiếp hàm này.
 * Phòng đã chuyển đi vẫn mang state `passed`; ngữ nghĩa "đã chuyển" nằm ở
 * ActivityLog để không phải sửa settleCheck / selection / money-visibility.
 */
export async function runTransfer(
  deps: TransferDeps,
  orderId: number,
  deptId: number,
  dto: TransferDto,
  user: AuthenticatedUser,
  ctx: TransferCtx,
  settle: (tx: Tx, orderId: number) => Promise<void>,
): Promise<void> {
  const { prisma, activity, notify } = deps;
  const { order, sourceRow } = ctx;

  if (dto.toDepartmentId === deptId)
    throw new BadRequestException('Phòng nhận trùng với phòng đang giữ đơn');

  if ([DeptState.WON, DeptState.LOST].includes(sourceRow.state as DeptState))
    throw new BadRequestException('Đơn đã qua vòng chọn báo giá, không chuyển được nữa');

  const target = await prisma.department.findUnique({ where: { id: dto.toDepartmentId } });
  if (!target || !target.isActive)
    throw new BadRequestException('Phòng nhận không tồn tại hoặc đã ngừng hoạt động');
  if (target.isSales)
    throw new BadRequestException('Phòng Sale không tham gia báo giá — chọn phòng khác');
  if (!target.isQuoting)
    throw new BadRequestException('Chỉ Phòng báo giá tham gia báo giá — chọn phòng khác');

  const already = await prisma.orderDepartment.findUnique({
    where: { orderId_departmentId: { orderId, departmentId: dto.toDepartmentId } },
  });
  if (already) throw new ConflictException('Phòng đó đã tham gia đơn này rồi');

  // Còn phải chặn trường hợp một phòng KHÁC đã won/lost (đơn đã chọn xong báo
  // giá) dù dòng nguồn vẫn 'passed'.
  const allRows = await prisma.orderDepartment.findMany({
    where: { orderId }, select: { state: true },
  });
  if (allRows.some((r) => [DeptState.WON, DeptState.LOST].includes(r.state as DeptState)))
    throw new BadRequestException('Đơn đã chọn xong báo giá, không chuyển phòng được nữa');

  await prisma.$transaction(async (tx) => {
    await tx.orderDepartment.update({
      where: { orderId_departmentId: { orderId, departmentId: deptId } },
      data: { state: DeptState.PASSED, passReason: dto.reason },
    });
    await tx.orderDepartment.create({
      data: {
        orderId, departmentId: dto.toDepartmentId,
        state: DeptState.PENDING, isManual: true,
      },
    });

    let next: OrderStatus | null = null;
    if (order.status === OrderStatus.NEW) next = OrderStatus.DISTRIBUTED;
    else if (order.status === OrderStatus.AWAITING_SELECTION) next = OrderStatus.QUOTING;
    if (next) {
      assertTransition(order.status, next);
      await tx.order.update({
        where: { id: orderId }, data: { status: next, updatedAt: new Date() },
      });
    }

    await activity.log(tx, {
      orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
      action: 'transfer', actorId: user.id,
      detail: { fromDepartmentId: deptId, toDepartmentId: dto.toDepartmentId, reason: dto.reason },
    });

    // PHẢI đứng sau create ở trên. Chạy trước thì mọi dòng đều đã 'passed' và
    // settleCheck kết luận sai rằng đơn hết đường đi.
    await settle(tx, orderId);
  });

  await notify.push(
    (await notify.deptRecipients(null, orderId, dto.toDepartmentId)).map((userId) => ({
      userId, orderId, type: NotifType.NEW_ORDER,
      title: `Đơn ${order.code} được chuyển tới phòng bạn`,
    })),
  );
}
