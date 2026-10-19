import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Một dịch vụ con đang bật, kèm đủ thứ ba nơi gọi cần: luật bắt buộc chọn
 * (`kiemDichVuCon`), tiền tố mã đơn (`tienToCuaDon`) và hình dạng tuyến
 * (`tuyenCuaDon`).
 *
 * Một truy vấn cho cả ba thay vì ba lần hỏi: chúng luôn được gọi cùng nhau
 * trong một lần tạo đơn.
 */
export interface ConDangBatRow {
  id: number;
  serviceId: number;
  tmsMode: string | null;
  hasDomesticOrigin: boolean | null;
  hasDomesticDestination: boolean | null;
}

/** Dịch vụ con ĐANG BẬT của một dịch vụ. Tắt rồi thì không chọn mới được nữa. */
export function conDangBatCua(
  prisma: Pick<PrismaService, 'serviceChild'>,
  serviceId: number,
): Promise<ConDangBatRow[]> {
  return prisma.serviceChild.findMany({
    where: { serviceId, isActive: true },
    select: {
      id: true,
      serviceId: true,
      tmsMode: true,
      hasDomesticOrigin: true,
      hasDomesticDestination: true,
    },
  });
}
