import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReadStream } from 'fs';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { FileMeta, StorageService } from '@/common/storage/storage.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Role } from '@/common/enums';
import { FileMetaDto } from './dto/comment.dto';

/** Cùng hình dạng với FileMeta nhưng đọc ra từ jsonb nên phải ép kiểu tường minh. */
function asMetas(value: Prisma.JsonValue): FileMeta[] {
  return Array.isArray(value) ? (value as unknown as FileMeta[]) : [];
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
  ) {}

  /** `chiDoc` = đường XEM: dùng phạm vi đọc (orderReadWhere). Đường ghi bỏ trống
   *  để giữ phạm vi cũ — người chỉ được xem không được mượn nó để ghi. */
  private async scopedOrder(orderId: number, user: AuthenticatedUser, chiDoc = false) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, chiDoc ? this.scope.orderReadWhere(user) : this.scope.orderWhere(user)] },
      select: { id: true, code: true, files: true },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn hàng');
    return o;
  }

  /** Chỗ DUY NHẤT biến hình dạng lưu trữ (`by`/`at`) thành hình dạng API. */
  private toDto(m: FileMeta, milestoneId: number | null, names: Map<number, string>): FileMetaDto {
    return {
      id: m.id,
      name: m.name,
      mime: m.mime,
      size: m.size,
      uploadedById: m.by,
      uploadedByName: names.get(m.by) ?? null,
      createdAt: m.at,
      milestoneId,
    };
  }

  private async namesOf(ids: number[]): Promise<Map<number, string>> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Dạng thô (còn `path`) — dùng nội bộ cho tải về / xóa. */
  private async rawList(orderId: number, user: AuthenticatedUser): Promise<FileMeta[]> {
    const order = await this.scopedOrder(orderId, user, true);
    const milestones = await this.prisma.orderMilestone.findMany({
      where: { orderId },
      select: { files: true },
    });
    return [...asMetas(order.files), ...milestones.flatMap((m) => asMetas(m.files))];
  }

  async list(orderId: number, user: AuthenticatedUser): Promise<FileMetaDto[]> {
    const order = await this.scopedOrder(orderId, user, true);
    const milestones = await this.prisma.orderMilestone.findMany({
      where: { orderId },
      select: { id: true, files: true },
    });
    const pairs: [FileMeta, number | null][] = [
      ...asMetas(order.files).map((f): [FileMeta, number | null] => [f, null]),
      ...milestones.flatMap((m) =>
        asMetas(m.files).map((f): [FileMeta, number | null] => [f, m.id]),
      ),
    ];
    const names = await this.namesOf(pairs.map(([f]) => f.by));
    return pairs.map(([f, msId]) => this.toDto(f, msId, names));
  }

  async upload(
    orderId: number,
    file: { filename: string; mimetype: string; buffer: Buffer },
    user: AuthenticatedUser,
    milestoneId?: number,
  ): Promise<FileMetaDto> {
    const order = await this.scopedOrder(orderId, user);
    const meta = await this.storage.save(
      orderId,
      file.filename,
      file.mimetype,
      file.buffer,
      user.id,
    );

    await this.prisma.$transaction(async (tx) => {
      if (milestoneId) {
        const ms = await tx.orderMilestone.findFirst({ where: { id: milestoneId, orderId } });
        if (!ms) throw new NotFoundException('Không tìm thấy mốc tiến độ');
        await tx.orderMilestone.update({
          where: { id: milestoneId },
          data: { files: [...asMetas(ms.files), meta] as unknown as Prisma.InputJsonValue },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { files: [...asMetas(order.files), meta] as unknown as Prisma.InputJsonValue },
        });
      }
      await this.activity.log(tx, {
        orderId, entity: 'files', entityId: meta.id, action: 'upload', actorId: user.id,
        detail: { name: meta.name, size: meta.size, milestoneId: milestoneId ?? null },
      });
    });

    return this.toDto(meta, milestoneId ?? null, new Map([[user.id, user.fullName]]));
  }

  /**
   * Tải về KHÔNG phục vụ tĩnh — kiểm tra scope rồi mới stream. File chứng từ khách
   * hàng không được để ai có link cũng tải.
   */
  async download(
    orderId: number,
    fileId: string,
    user: AuthenticatedUser,
  ): Promise<{ meta: FileMeta; stream: ReadStream }> {
    const all = await this.rawList(orderId, user);
    const meta = all.find((f) => f.id === fileId);
    if (!meta) throw new NotFoundException('Không tìm thấy file');
    return { meta, stream: await this.storage.stream(meta.path) };
  }

  async remove(orderId: number, fileId: string, user: AuthenticatedUser): Promise<void> {
    const order = await this.scopedOrder(orderId, user);
    const onOrder = asMetas(order.files);
    const milestones = await this.prisma.orderMilestone.findMany({
      where: { orderId },
      select: { id: true, files: true },
    });

    const inOrder = onOrder.find((f) => f.id === fileId);
    const holder = milestones.find((m) => asMetas(m.files).some((f) => f.id === fileId));
    const meta = inOrder ?? asMetas(holder?.files ?? []).find((f) => f.id === fileId);
    if (!meta) throw new NotFoundException('Không tìm thấy file');

    if (meta.by !== user.id && !user.roles.includes(Role.ADMIN))
      throw new ForbiddenException('Chỉ người tải lên hoặc Admin mới xóa được file');

    await this.prisma.$transaction(async (tx) => {
      if (inOrder)
        await tx.order.update({
          where: { id: orderId },
          data: {
            files: onOrder.filter((f) => f.id !== fileId) as unknown as Prisma.InputJsonValue,
          },
        });
      else if (holder)
        await tx.orderMilestone.update({
          where: { id: holder.id },
          data: {
            files: asMetas(holder.files).filter(
              (f) => f.id !== fileId,
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      await this.activity.log(tx, {
        orderId, entity: 'files', entityId: fileId, action: 'delete', actorId: user.id,
        detail: { name: meta.name },
      });
    });

    await this.storage.remove(meta.path);
  }
}
