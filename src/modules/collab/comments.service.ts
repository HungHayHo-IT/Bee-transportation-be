import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CommentKind, NotifType, Role } from '@/common/enums';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { canReadAllOrders } from '@/common/scope/can-read-all-orders';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { CommentDto, CreateCommentDto, MentionableUserDto } from './dto/comment.dto';
import { canMention, resolveThreadDepartment } from './mentionable.helper';

/**
 * Mặc định của GET, dùng lại cho trang cuối mà POST trả về — hai bên phải khớp.
 * Export ra để controller dùng làm fallback của `clamp`, tránh hai literal độc
 * lập âm thầm lệch nhau khi chỉ một bên được sửa.
 */
export const COMMENT_PAGE_SIZE = 20;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly notify: NotifyService,
  ) {}

  /** `chiDoc` = đường XEM: dùng phạm vi đọc (orderReadWhere). Đường ghi bỏ trống
   *  để giữ phạm vi cũ — người chỉ được xem không được mượn nó để ghi. */
  private async scopedOrder(orderId: number, user: AuthenticatedUser, chiDoc = false) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, chiDoc ? this.scope.orderReadWhere(user) : this.scope.orderWhere(user)] },
      select: { id: true, code: true, createdBy: true },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn hàng');
    return o;
  }

  /**
   * Cùng một luật với báo giá kín (§6.5): trao đổi giá cả nằm trong bình luận, để lộ
   * luồng của phòng khác cũng là để lộ báo giá.
   *  - toàn công ty / sale phụ trách đơn -> thấy tất cả
   *  - phòng ban -> luồng phòng mình + luồng chung (departmentId IS NULL)
   */
  private threadFilter(
    user: AuthenticatedUser,
    order: { createdBy: number | null },
  ): Prisma.CommentWhereInput {
    if (canReadAllOrders(user) || order.createdBy === user.id) return {};
    return { OR: [{ departmentId: null }, { departmentId: user.departmentId ?? -1 }] };
  }

  async list(
    orderId: number,
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<PageResult<CommentDto>> {
    const order = await this.scopedOrder(orderId, user, true);
    const where = { AND: [{ orderId }, this.threadFilter(user, order)] };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: { user: { select: { fullName: true } }, department: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        kind: c.kind,
        body: c.body,
        departmentId: c.departmentId,
        departmentName: c.department?.name ?? null,
        authorId: c.userId,
        authorName: c.user.fullName,
        mentions: c.mentions,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async create(
    orderId: number,
    dto: CreateCommentDto,
    user: AuthenticatedUser,
  ): Promise<PageResult<CommentDto>> {
    const order = await this.scopedOrder(orderId, user);

    // Người không thuộc toàn công ty / không phải sale phụ trách chỉ viết được vào
    // luồng phòng mình hoặc luồng chung.
    const free = canReadAllOrders(user) || order.createdBy === user.id;
    if (!free && dto.departmentId !== undefined && dto.departmentId !== user.departmentId)
      throw new BadRequestException('Bạn chỉ bình luận được trong luồng phòng mình');

    const departmentId = resolveThreadDepartment(user, order, dto.departmentId);

    // Chỉ @mention được người CÓ QUYỀN xem luồng đó, nếu không thông báo dẫn tới 404.
    const mentions = await this.validMentions(dto.mentions ?? [], orderId, departmentId, order);

    const created = await this.prisma.comment.create({
      data: {
        orderId,
        departmentId,
        userId: user.id,
        kind: CommentKind.COMMENT,
        body: dto.body,
        mentions,
      },
    });

    const targets = new Set(mentions);
    // Người của luồng bên kia cũng cần biết có bình luận mới.
    if (order.createdBy !== null && order.createdBy !== user.id) targets.add(order.createdBy);
    if (departmentId)
      for (const uid of await this.notify.deptRecipients(null, orderId, departmentId))
        if (uid !== user.id) targets.add(uid);
    targets.delete(user.id);

    await this.notify.push(
      [...targets].map((userId) => ({
        userId,
        orderId,
        type: mentions.includes(userId) ? NotifType.MENTION : NotifType.REVISION_REQUESTED,
        title: mentions.includes(userId)
          ? `${user.fullName} nhắc bạn trong đơn ${order.code}`
          : `Bình luận mới trong đơn ${order.code}`,
        body: dto.body.slice(0, 200),
      })),
    );

    void created;

    // Luồng sắp theo thời gian TĂNG DẦN nên bình luận vừa viết nằm ở trang cuối.
    // Trả trang đầu là người viết xong không thấy bình luận của chính mình.
    const limit = COMMENT_PAGE_SIZE;
    const total = await this.prisma.comment.count({
      where: { AND: [{ orderId }, this.threadFilter(user, order)] },
    });
    const lastPage = Math.max(1, Math.ceil(total / limit));
    return this.list(orderId, user, lastPage, limit);
  }

  private async validMentions(
    ids: number[],
    orderId: number,
    departmentId: number | null,
    order: { createdBy: number | null },
  ): Promise<number[]> {
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, roles: true, departmentId: true },
    });
    const ctx = {
      orderCreatedBy: order.createdBy,
      threadDepartmentId: departmentId,
      participatingDeptIds: await this.participatingDeptIds(orderId),
    };
    return users.filter((u) => canMention(u, ctx)).map((u) => u.id);
  }

  private async participatingDeptIds(orderId: number): Promise<Set<number>> {
    const rows = await this.prisma.orderDepartment.findMany({
      where: { orderId },
      select: { departmentId: true },
    });
    return new Set(rows.map((r) => r.departmentId));
  }

  /**
   * Ai gõ @ thì thấy được những người này. Cùng một luật với validMentions, cùng một
   * luồng với create — gợi ý ra người rồi lọc bỏ lúc gửi là lỗi im lặng tệ nhất ở đây.
   */
  async mentionables(
    orderId: number,
    departmentId: number | undefined,
    user: AuthenticatedUser,
  ): Promise<MentionableUserDto[]> {
    const order = await this.scopedOrder(orderId, user);
    const ctx = {
      orderCreatedBy: order.createdBy,
      threadDepartmentId: resolveThreadDepartment(user, order, departmentId),
      participatingDeptIds: await this.participatingDeptIds(orderId),
    };

    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: user.id }, // không tự nhắc mình
        OR: [
          ...(order.createdBy !== null ? [{ id: order.createdBy }] : []),
          { roles: { has: Role.ADMIN } },
          { departmentId: { in: [...ctx.participatingDeptIds] } },
        ],
      },
      select: {
        id: true, fullName: true, roles: true, departmentId: true,
        department: { select: { name: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { fullName: 'asc' }],
    });

    return candidates
      .filter((c) => canMention(c, ctx))
      .map((c) => ({
        id: c.id,
        fullName: c.fullName,
        roles: c.roles,
        departmentName: c.department?.name ?? null,
      }));
  }
}
