import { Reflector } from '@nestjs/core';
import { TRANG_KEY } from '@/common/permissions/page.decorator';
import { MAC_DINH } from '@/common/permissions/pages';
import { ServiceFieldsController } from './service-fields.controller';

const reflector = new Reflector();

/** Đúng cách PageAccessGuard đọc: handler đè lên class. */
function trangCua(handler: unknown, lop: unknown): string[] | undefined {
  return reflector.getAllAndOverride<string[] | undefined>(TRANG_KEY, [
    handler as never,
    lop as never,
  ]);
}

/**
 * `GET /services/:id/form-schema` KHÔNG phải cửa quản trị.
 *
 * Nó trả bộ ô nhập riêng của một dịch vụ, và form tạo đơn gọi nó ngay sau khi
 * người dùng chọn dịch vụ. Cả lớp `ServiceFieldsController` gắn @Trang('services')
 * — màn "Dịch vụ & mốc tiến độ" bên Quản trị — mà mặc định của màn đó là `none`
 * cho sale. Hệ quả đã gặp thật: Admin sale mở được trang Tạo đơn hàng (ô
 * `createOrder` là Toàn quyền), chọn dịch vụ xong thì giữa form hiện "Vai trò
 * của bạn không có quyền vào trang này", và không có bộ trường nào để điền.
 *
 * Đây đúng là kiểu lỗi mà ma trận hứa một đằng còn API làm một nẻo. Bài này
 * khoá lại: handler phải tự khai các trang có quyền gọi nó.
 */
describe('form-schema mở cho người tạo và xem đơn', () => {
  const trang = trangCua(ServiceFieldsController.prototype.schema, ServiceFieldsController);

  it('không dùng chung @Trang("services") của cả lớp', () => {
    expect(trang).toBeDefined();
    expect(trang).not.toEqual(['services']);
  });

  /* Năm nơi bên admin gọi nó: form tạo đơn, hộp sửa đơn, tab Tổng quan, trang
     chi tiết đơn, và bộ lọc theo trường riêng ở danh sách đơn. */
  it.each(['createOrder', 'orders', 'orderDetail', 'services'])(
    'nhận quyền từ trang %s',
    (khoa) => {
      expect(trang).toContain(khoa);
    },
  );

  /* Chốt lại bằng chính bảng mặc định: mỗi vai trò vào được ít nhất một trong
     các trang trên thì phải gọi được form-schema. Sale là ca đã hỏng thật. */
  it.each(['admin', 'leader', 'manager', 'sale', 'staff'])('vai trò %s gọi được', (vaiTro) => {
    const moDuoc = (trang ?? []).some((khoa) => MAC_DINH[khoa]?.[vaiTro] !== 'none');
    expect(moDuoc).toBe(true);
  });
});
