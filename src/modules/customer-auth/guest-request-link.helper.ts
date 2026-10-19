import { Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

const logger = new Logger('GuestRequestLink');

/**
 * Nhận về cho tài khoản những yêu cầu báo giá người đó đã gửi lúc CHƯA đăng
 * nhập.
 *
 * Khách gửi form trên landing page khi chưa có phiên thì `customer_id` để null,
 * nên mã yêu cầu phát cho họ trở thành vô dụng trong app — chỉ dùng được khi
 * đọc qua điện thoại cho nhân viên. Đăng nhập sau bằng đúng email đã khai thì
 * nên thấy lại chúng trong "Yêu cầu của tôi".
 *
 * KHỚP THEO EMAIL, TUYỆT ĐỐI KHÔNG THEO SỐ ĐIỆN THOẠI. Ai cũng gõ được số bất
 * kỳ vào form công khai, và nhà mạng thì tái cấp số cho người khác. Khớp theo
 * số là trao yêu cầu của người lạ cho chủ tài khoản — một kiểu rò dữ liệu mà
 * không ai báo lỗi vì hệ thống "chạy đúng". Email thì khách đã chứng minh
 * quyền kiểm soát bằng OTP lúc đăng ký.
 *
 * Khớp không phân biệt hoa thường: `customer_accounts.email` là citext, nhưng
 * `quote_requests.email` là text thường và lúc lưu chỉ `.trim()` chứ không hạ
 * chữ. Khớp chặt thì người gõ "Linh@Bee.VN" trên form rồi đăng nhập bằng
 * "linh@bee.vn" sẽ không bao giờ nhận lại được yêu cầu của chính mình.
 *
 * Hệ quả cần biết: yêu cầu vừa được gắn sẽ RỜI KHỎI đường tra cứu công khai
 * `GET /quote-requests/lookup` (đường đó cố ý chỉ trả yêu cầu chưa có chủ).
 * Đúng thiết kế — khách đã có `/my/:id` — nhưng app cần tự chuyển sang `/my/*`
 * sau khi đăng nhập, nếu không người dùng thấy như "tra được rồi tự dưng mất".
 */
export async function linkGuestQuoteRequests(
  prisma: PrismaService,
  customerId: number,
  email: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  // Không có email thì không có gì để khớp — đừng quét cả bảng bằng một chuỗi rỗng.
  if (!normalized) return 0;

  try {
    const { count } = await prisma.quoteRequest.updateMany({
      where: {
        customerId: null,
        email: { equals: normalized, mode: 'insensitive' },
      },
      data: { customerId },
    });
    if (count) logger.log(`Gắn ${count} yêu cầu vãng lai vào khách ${customerId}`);
    return count;
  } catch (err) {
    // Việc phụ. DB chập chờn ở đây không được phép làm hỏng việc chính là đăng
    // nhập — khách sẽ không hiểu vì sao mật khẩu đúng mà vào không được.
    logger.warn(`Gắn yêu cầu vãng lai cho khách ${customerId} thất bại: ${(err as Error).message}`);
    return 0;
  }
}
