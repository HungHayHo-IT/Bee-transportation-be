import { Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

const logger = new Logger('GuestToken');

/**
 * Token FCM vừa nhận thuộc về người vừa gửi yêu cầu, không phải người đã gửi
 * trước đó trên cùng thiết bị.
 *
 * Máy dùng chung — quầy lễ tân, máy công ty, điện thoại mượn — mà không thu hồi
 * thì hai dòng `quote_requests` cùng giữ một token. Lúc Sale chốt giá đơn của
 * người trước, mã đơn và số tiền của họ bắn về máy đang ở tay người sau.
 *
 * `customer_devices` đã giải đúng bài này bằng UNIQUE trên token cộng với việc
 * đổi chủ khi đăng ký lại (xem `db/migrations/014-customer-devices.sql`). Bảng
 * `quote_requests` không có UNIQUE trên cột này — nhiều dòng giữ cùng một token
 * cùng lúc là hợp lệ về mặt schema — nên phải thu hồi bằng tay.
 *
 * Lọc theo SỐ ĐIỆN THOẠI vì đó là danh tính duy nhất khách vãng lai có (cột
 * `phone` bắt buộc, `email` thì không). Cùng số nghĩa là một người gửi nhiều đơn
 * từ một máy — giữ cả hai. Số do khách tự gõ nên không chắc chắn, nhưng sai lệch
 * về phía an toàn: gõ nhầm số thì MẤT một thông báo, chứ không LỘ một thông báo.
 *
 * Nuốt lỗi có chủ ý: yêu cầu của khách đã ghi xong trước khi hàm này chạy, nên
 * ném ra ngoài là trả 500 cho một yêu cầu thực ra đã lưu thành công.
 */
export async function claimGuestToken(
  prisma: PrismaService,
  id: number,
  fcmToken: string,
  phone: string,
): Promise<void> {
  try {
    await prisma.quoteRequest.updateMany({
      where: { fcmToken, phone: { not: phone }, id: { not: id } },
      data: { fcmToken: null },
    });
  } catch (err) {
    logger.error({ err, id }, 'Thu hồi token vãng lai thất bại');
  }
}
