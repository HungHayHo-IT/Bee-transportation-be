import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface ActivityInput {
  orderId?: number | null;
  entity: string;
  entityId: string | number;
  action: string;
  actorId?: number | null;
  detail?: Prisma.InputJsonValue;
}

/**
 * Audit ghi TRONG transaction cùng với thay đổi (khác thông báo — cái đó đi ngoài).
 * Không dùng Prisma middleware tự động: nó không biết AI thao tác và VÌ SAO.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(tx: Tx | null, input: ActivityInput): Promise<void> {
    const client = tx ?? this.prisma;
    await client.activityLog.create({
      data: {
        orderId: input.orderId ?? null,
        entity: input.entity,
        entityId: String(input.entityId),
        action: input.action,
        actorId: input.actorId ?? null,
        detail: input.detail,
      },
    });
  }
}
