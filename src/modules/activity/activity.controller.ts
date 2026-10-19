import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Trang } from '@/common/permissions/page.decorator';
import { Prisma } from '@prisma/client';
import { ActivityItemDto, ActivityPageDto, ActivityQueryDto } from './activity.dto';

@ApiTags('System')
@Controller('activity')
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('activityLog')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Audit log toàn hệ thống' })
  // Kế thừa từ PaginationDto nhưng không tự vào docs-json — phải khai tay,
  // giống /customers và /news. Thiếu thì client đọc đặc tả không biết
  // endpoint phân trang được, dù nó vẫn nhận tham số.
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiOkResponse({ type: ActivityPageDto })
  async list(@Query() query: ActivityQueryDto): Promise<PageResult<ActivityItemDto>> {
    const where: Prisma.ActivityLogWhereInput = {};
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId !== undefined) where.actorId = query.actorId;
    if (query.orderId !== undefined) where.orderId = query.orderId;

    const [total, rows] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        include: { actor: { select: { fullName: true } }, order: { select: { code: true } } },
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    return {
      items: rows.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        entity: a.entity,
        entityId: a.entityId,
        action: a.action,
        actorId: a.actorId,
        actorName: a.actor?.fullName ?? null,
        orderId: a.orderId,
        orderCode: a.order?.code ?? null,
        detail: a.detail,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
