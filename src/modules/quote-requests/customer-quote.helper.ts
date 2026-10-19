import { NotFoundException } from '@nestjs/common';
import { DeptState, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerQuoteDto } from './dto/quote-request.dto';
import { giaChoKhach } from '../orders/gia-sale.helper';

/**
 * Giá đã chốt, dựng riêng cho KHÁCH HÀNG đang đăng nhập.
 *
 * Nằm ngoài service vì service đã sát mốc 300 dòng của repo, và vì phần đáng
 * đọc ở đây là mấy quyết định "được lộ cái gì" chứ không phải câu truy vấn.
 *
 * Vì sao chỉ đúng MỘT con số — giá của phòng thắng: các phòng ban cạnh tranh
 * giá với nhau là chuyện nội bộ. Cho khách thấy báo giá của phòng thua nghĩa là
 * khách đọc được cơ cấu giá, biết công ty tự đấu với chính mình, và sale mất
 * sạch biên đàm phán. Kể cả phòng đã thua cũng không được lộ.
 *
 * Vì sao "chưa có giá" KHÔNG phải lỗi: khách vừa bấm gửi form xong là rơi đúng
 * vào ca này, và ca đơn đã tạo mà các phòng còn đang báo giá cũng vậy. Ném 404
 * ở đây làm màn hình "Yêu cầu của tôi" đỏ lòm giữa lúc mọi thứ hoàn toàn bình
 * thường. Chỉ "không phải yêu cầu của bạn" mới là lỗi.
 *
 * Vì sao đường tra cứu công khai (`/quote-requests/lookup`) KHÔNG có hàm này:
 * đường đó chỉ cần id đoán được + số điện thoại. Giá đã chốt là thứ đáng tiền,
 * nó chỉ đi qua cửa đăng nhập.
 */
export const QUOTE_NOT_FOUND = 'Không tìm thấy yêu cầu báo giá';

/**
 * Chỉ kéo đúng những cột sẽ đọc. Dùng `select` chứ không `include`: cột nào
 * thêm vào schema sau này cũng không tự động chui vào đây.
 */
export const CUSTOMER_QUOTE_SELECT = {
  id: true,
  convertedToOrderId: true,
  order: {
    select: {
      code: true,
      // Cần status để biết đơn còn sống: cancel() và reject() trong
      // OrdersService KHÔNG dọn order_departments.state, nên dòng 'won' sống
      // sót qua việc huỷ đơn.
      status: true,
      // Đơn landing: khách thấy giá Sale chốt, không thấy giá phòng ban.
      source: true,
      salePrice: true,
      // Lọc ngay trong truy vấn để giá của phòng thua không bao giờ rời khỏi DB,
      // chứ không đọc hết rồi lọc ở tầng JS.
      departments: {
        where: { state: DeptState.WON },
        select: { state: true, amount: true, lastQuotedAt: true },
      },
    },
  },
};

/**
 * Trạng thái đơn mà giá không còn hiệu lực. 'closed' KHÔNG nằm ở đây — đơn đã
 * chốt thì giá vẫn là giá thật, khách có quyền xem lại.
 */
const DEAD_ORDER_STATUSES: string[] = [OrderStatus.CANCELLED];

type WonRow = { state: string; amount: unknown; lastQuotedAt: Date | null };

/** Chưa có giá — trả trạng thái, không ném lỗi. Xem phần đầu file để biết vì sao. */
function pending(id: number): CustomerQuoteDto {
  return { quoteRequestId: id, state: 'pending', amount: null, orderCode: null, quotedAt: null };
}

export async function findCustomerQuote(
  prisma: PrismaService, customerId: number, id: number,
): Promise<CustomerQuoteDto> {
  const row = await prisma.quoteRequest.findFirst({
    // Ràng buộc chủ sở hữu đặt thẳng trong `where`, không lọc sau khi đọc, để
    // không có nhánh nào quên mất nó.
    where: { id, customerId },
    select: CUSTOMER_QUOTE_SELECT,
  }) as { id: number; convertedToOrderId: number | null;
    order: { code: string; status: string; source: string | null; salePrice: unknown;
      departments: WonRow[] } | null } | null;

  // Yêu cầu của người khác và yêu cầu không tồn tại phải ra CÙNG một 404: trả
  // 403 là đã xác nhận "mã này có thật", biến id tăng dần thành máy dò đơn hàng.
  if (!row) throw new NotFoundException(QUOTE_NOT_FOUND);
  if (row.convertedToOrderId === null || !row.order) return pending(row.id);

  // Đơn đã chết thì giá không còn nghĩa lý gì. Phải chặn ở đây vì cancel() và
  // reject() chỉ đổi orders.status, KHÔNG đụng order_departments.state — dòng
  // 'won' cùng số tiền vẫn nằm nguyên trong DB. Chỉ hỏi "có dòng won không"
  // thì khách của một đơn đã huỷ vẫn thấy giá hiện lên như còn hiệu lực, rồi
  // gọi hỏi sale vì sao chưa giao hàng.
  //
  // Vẫn trả orderCode để khách còn cái đối chiếu khi gọi.
  if (DEAD_ORDER_STATUSES.includes(row.order.status))
    return {
      quoteRequestId: row.id, state: 'cancelled',
      amount: null, orderCode: row.order.code, quotedAt: null,
    };

  // Lọc lại ở đây dù `where` đã lọc: đây là chốt chặn cuối cùng trước khi một
  // con số rời hệ thống, và nó rẻ. Sai sót ở `select` không được thành rò rỉ.
  const won = row.order.departments.find((d) => d.state === DeptState.WON);
  const gia = won
    ? giaChoKhach(
        { source: row.order.source, salePrice: row.order.salePrice as number | null },
        won.amount as number | null,
      )
    : null;
  if (!won || gia === null) return pending(row.id);

  return {
    quoteRequestId: row.id,
    state: 'quoted',
    // amount là Decimal(15,0) của Prisma — số VND nguyên, thừa sức nằm gọn trong
    // Number (15 chữ số < 2^53). Trả thẳng object Decimal thì client nhận rác.
    amount: gia,
    orderCode: row.order.code,
    // Không có cột "thời điểm sale chọn phòng" trong schema; lastQuotedAt của
    // phòng thắng là mốc gần nhất lấy được và là con số khách quan tâm: giá này
    // được báo lúc nào.
    quotedAt: won.lastQuotedAt?.toISOString() ?? null,
  };
}
