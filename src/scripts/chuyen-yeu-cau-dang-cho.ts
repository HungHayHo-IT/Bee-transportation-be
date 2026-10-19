/**
 * Chuyển các yêu cầu báo giá còn kẹt ở `pending` thành đơn hàng.
 *
 * Đường CỨU HỘ, không phải luồng thường: dùng cho những yêu cầu đã rơi vào một
 * lỗi auto-convert nào đó trước khi lỗi được sửa — như lần bốn yêu cầu liên
 * tiếp từ landing đều chết vì luật "phải chọn dịch vụ con".
 *
 * Gọi thẳng QuoteRequestService nên đơn sinh ra đi qua ĐÚNG đường mà một yêu
 * cầu bình thường đi: cùng cách ánh xạ trường, cùng phân phối phòng ban, cùng
 * chấm thiếu thông tin.
 *
 * Chạy trong container API:
 *   docker compose -f docker-compose.vm.yml exec -T api \
 *     node dist/scripts/chuyen-yeu-cau-dang-cho.js          # tất cả
 *   ... node dist/scripts/chuyen-yeu-cau-dang-cho.js 3 4     # chỉ id 3 và 4
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QuoteRequestService } from '../modules/quote-requests/quote-request.service';

async function main(): Promise<void> {
  const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const svc = app.get(QuoteRequestService, { strict: false });
    const kq = await svc.chuyenYeuCauDangCho(ids.length > 0 ? ids : undefined);
    if (kq.length === 0) {
      console.log('Không có yêu cầu nào đang chờ (có dịch vụ) để chuyển.');
      return;
    }
    for (const r of kq)
      console.log(r.orderId !== undefined
        ? `yêu cầu #${r.id} -> đơn id ${r.orderId}`
        : `yêu cầu #${r.id} HỎNG: ${r.loi}`);
    // Thoát khác 0 khi có cái hỏng, để người chạy không lướt qua mất.
    if (kq.some((r) => r.loi !== undefined)) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
