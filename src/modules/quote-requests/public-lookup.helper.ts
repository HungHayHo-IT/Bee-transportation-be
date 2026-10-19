import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QUOTE_REQUEST_INCLUDE, QuoteRequestRow } from './quote-request.mapper';

/**
 * Tra cứu yêu cầu báo giá cho khách VÃNG LAI.
 *
 * Nằm ngoài service vì hai lẽ: service đã sát mốc 300 dòng của repo, và phần
 * đáng đọc ở đây là mấy quyết định bảo mật bên dưới chứ không phải câu truy vấn.
 *
 * Vì sao phải có HAI tham số: id là số tăng dần, đoán được sạch sẽ — quét từ 1
 * đến n là ra toàn bộ. Số điện thoại là thứ duy nhất chỉ người gửi mới biết
 * mình đã khai gì, nên nó mới là cái khoá thật; id chỉ là chỉ mục.
 *
 * Vì sao MỌI ca hỏng dùng chung một lỗi: id sai, phone sai, id không phải số,
 * hay yêu cầu đã có chủ — trả lời khác nhau dù chỉ một chữ là biến endpoint
 * thành máy dò "id nào có thật". Tất cả đi về đúng một câu.
 *
 * Vì sao chặn yêu cầu đã gắn tài khoản (customerId != null): những yêu cầu đó
 * đã có /quote-requests/my/:id sau khi đăng nhập. Cho tra thêm ở đây nghĩa là
 * ai biết số điện thoại của chủ tài khoản cũng đọc được dữ liệu của họ mà
 * không cần đăng nhập — hạ mức bảo vệ của tài khoản xuống bằng một cái id đoán
 * được. Ràng buộc đặt thẳng trong `where` chứ không lọc sau khi đọc, để không
 * có đường nào quên mất nó.
 */
export const LOOKUP_NOT_FOUND = 'Không tìm thấy yêu cầu báo giá khớp với mã và số điện thoại đã nhập';

/**
 * Gom số điện thoại về dạng so sánh được. Khách gõ lại số theo thói quen của
 * mình ("0977 856 665", "+84977856665") chứ không theo đúng chuỗi form đã lưu;
 * bắt gõ trùng từng ký tự là biến tính năng tra cứu thành trò may rủi.
 *
 * Quy về đầu số nội địa 0… để "+84977…", "84977…" và "0977…" là một. Chỉ bỏ ký
 * tự trình bày, KHÔNG bỏ chữ số nào — 0977 và 0978 vẫn phải là hai người khác nhau.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (digits.startsWith('84') && digits.length > 9) return `0${digits.slice(2)}`;
  return digits;
}

/** id đến từ query string nên có thể là rác; rác cũng chỉ được dẫn tới cùng một 404. */
function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function findGuestQuoteRequest(
  prisma: PrismaService, rawId: string, rawPhone: string,
): Promise<QuoteRequestRow> {
  const id = parseId(rawId);
  const phone = normalizePhone(rawPhone);
  const row = id === null || phone.length === 0
    ? null
    : await prisma.quoteRequest.findFirst({
      where: { id, customerId: null }, include: QUOTE_REQUEST_INCLUDE,
    });
  // So khớp phone ở tầng JS: cột trong DB giữ nguyên chuỗi khách đã gõ, không
  // có dạng chuẩn hoá để đưa vào `where`.
  if (!row || normalizePhone(row.phone) !== phone) throw new NotFoundException(LOOKUP_NOT_FOUND);
  return row;
}
