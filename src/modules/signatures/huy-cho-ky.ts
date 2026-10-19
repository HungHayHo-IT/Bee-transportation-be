import { Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { TrangThaiKy } from './chu-ky.helper';

const logger = new Logger('HuyChoKy');

/**
 * Huỷ mọi yêu cầu ký đang chờ của một đơn.
 *
 * Gọi khi đơn hoặc báo giá đổi. Không làm vậy thì khách mở đường dẫn cũ ra và
 * ký vào một bản phiếu không còn đúng nữa — một chữ ký trông hợp lệ nhưng
 * không chứng minh được gì, và không ai biết cho tới lúc có tranh chấp.
 *
 * Là HÀM chứ không phải một phương thức của service, vì cả `OrdersService` lẫn
 * `SelectionService` đều phải gọi nó, mà `SignaturesModule` thì đã phụ thuộc
 * `OrdersModule` — tiêm ngược lại là dựng một vòng phụ thuộc chỉ để chạy đúng
 * một câu lệnh ghi. Nó chỉ cần Prisma, nên nhận thẳng Prisma.
 */
export async function huyChoKy(prisma: PrismaService, orderId: number): Promise<number> {
  const { count } = await prisma.orderSignature.updateMany({
    where: { orderId, trangThai: TrangThaiKy.CHO_KY },
    data: { trangThai: TrangThaiKy.HET_HAN, updatedAt: new Date() },
  });
  if (count > 0) {
    logger.log(`Đơn ${orderId} đổi — huỷ ${count} yêu cầu ký đang chờ`);
  }
  return count;
}
