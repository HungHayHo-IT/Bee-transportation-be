import { Prisma } from '@prisma/client';
import { DiaChiKhachService } from '@/modules/customers/dia-chi-khach.service';
import { dauKhoCang } from '@/modules/tms/tms-payload.helper';

export interface DonCanGhiNho {
  customerId: number | null;
  tmsMode: string | null;
  originAddress: string | null | undefined;
  destinationAddress: string | null | undefined;
}

/**
 * Ghi nhớ địa chỉ của KHÁCH trên một đơn vào danh mục địa chỉ của họ.
 *
 * Chỉ đầu KHÁCH, không phải cả hai: với đơn nhập/xuất thì một đầu là kho/cảng
 * của Bee, và nhét tên cảng vào danh mục địa chỉ của khách là làm bẩn một danh
 * mục rồi đồng bộ cái bẩn ấy sang hệ thống đối tác. Dùng CHÍNH `dauKhoCang`
 * mà payload OF1 dùng, để hai nơi không bao giờ nói khác nhau.
 *
 * Mode chưa khai thì ghi cả hai đầu: đó là đơn nội địa hoặc đơn chưa chọn dịch
 * vụ con, và ở cả hai trường hợp hai đầu đều là địa chỉ khách.
 *
 * KHÔNG ném lỗi ra ngoài: đây là việc phụ của luồng tạo đơn. Hỏng chỗ này mà
 * làm hỏng cả cái đơn thì cái giá đắt hơn hẳn phần thưởng.
 */
export async function ghiNhoDiaChiCuaDon(
  svc: DiaChiKhachService,
  tx: Prisma.TransactionClient,
  don: DonCanGhiNho,
): Promise<void> {
  if (don.customerId === null) return;
  const khoCang = don.tmsMode === null ? null : dauKhoCang(don.tmsMode);
  try {
    if (khoCang !== 'di') await svc.ghiNho(tx, don.customerId, don.originAddress);
    if (khoCang !== 'den') await svc.ghiNho(tx, don.customerId, don.destinationAddress);
  } catch {
    // Đã nuốt trong `ghiNho`; bắt thêm ở đây phòng khi nó đổi về sau.
  }
}
