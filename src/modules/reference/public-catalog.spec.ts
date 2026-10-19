import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { TRANG_KEY } from '@/common/permissions/page.decorator';
import { ServicesController } from '../services/services.controller';
import { ReferenceController } from './reference.controller';

const isPublic = (handler: unknown) => Reflect.getMetadata(IS_PUBLIC_KEY, handler as object);

/**
 * JwtAuthGuard chạy toàn cục nên handler nào thiếu @Public() là chặn khách vãng lai.
 * Khách chưa đăng nhập vẫn phải đổ được danh mục vào form gửi yêu cầu báo giá
 * trên landing page / app mobile, nên hai handler này phải mở.
 */
describe('Danh mục cho khách chưa đăng nhập', () => {
  /**
   * Trước đây chính GET /services được mở, nhưng nó trả DTO đầy đủ (SLA, bộ mốc,
   * phòng ban phụ trách) nên mở là lộ chuyện nội bộ. Nay khách đi lối riêng với
   * DTO rút gọn, còn DTO đầy đủ ở lại sau guard.
   */
  it('GET /services/public mở công khai', () => {
    expect(isPublic(ServicesController.prototype.listPublic)).toBe(true);
  });

  /**
   * Còn @Public() trong cửa sổ chuyển tiếp — nhưng người chưa đăng nhập chỉ
   * nhận bản rút gọn, không phải DTO đầy đủ. Ranh giới nằm ở TRƯỜNG trả về,
   * không ở cờ public; luật đó được khoá ở services-transition-window.spec.ts.
   */
  it('GET /services vẫn @Public(), dữ liệu nội bộ chặn bằng cách lọc trường', () => {
    expect(isPublic(ServicesController.prototype.list)).toBe(true);
  });

  it('GET /reference/provinces mở công khai', () => {
    expect(isPublic(ReferenceController.prototype.provinces)).toBe(true);
  });

  /**
   * Chốt ranh giới: 'unrouted' là cảnh báo cấu hình nội bộ (dịch vụ chưa phòng
   * nào nhận), mở ra là lộ lỗ hổng vận hành — nó phải nằm ngoài đợt mở này.
   *
   * Từ 29/09/2026 ai đọc được nó do MA TRẬN PHÂN QUYỀN quyết định chứ không
   * còn là một danh sách vai trò viết cứng, nên test khoá hai điều còn lại và
   * chúng mới là điều quan trọng: endpoint KHÔNG công khai, và nó có khai
   * trang để ma trận với tới được. Thiếu khai trang thì nó rơi vào vùng "không
   * guard nào kiểm", tức là mọi tài khoản đăng nhập đều đọc được.
   */
  it('GET /services/unrouted không công khai và do ma trận phân quyền chặn', () => {
    expect(isPublic(ServicesController.prototype.unrouted)).toBeUndefined();
    const trang = Reflect.getMetadata(TRANG_KEY, ServicesController) as string[] | undefined;
    expect(trang).toEqual(['services']);
  });

  // Các danh mục còn lại của Reference không nằm trong phạm vi mở lần này.
  it.each(['orderStatuses', 'rejectReasons', 'orderSources'] as const)(
    'GET /reference (%s) vẫn yêu cầu đăng nhập',
    (method) => {
      expect(isPublic(ReferenceController.prototype[method])).toBeUndefined();
    },
  );
});
