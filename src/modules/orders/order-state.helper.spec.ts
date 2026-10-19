import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@/common/enums';
import { ALLOWED, assertDeptWorkable, assertTransition, statusLabel } from './order-state.helper';

describe('assertTransition', () => {
  it('đơn 1 phòng: distributed -> awaiting_selection phải hợp lệ', () => {
    // Thiếu nhánh này thì settleCheck ném 409 ở ca phổ biến nhất.
    expect(() =>
      assertTransition(OrderStatus.DISTRIBUTED, OrderStatus.AWAITING_SELECTION),
    ).not.toThrow();
  });

  /**
   * Từ migration 023 không còn 'rejected' riêng — khách chê giá cũng về
   * 'cancelled'. Phải huỷ được từ mọi bước có khách trong cuộc, vì khách có thể
   * nói không ngay khi sale vừa chào giá, chưa kịp chọn phòng nào.
   */
  it('huỷ được từ mọi trạng thái có khách trong cuộc', () => {
    for (const from of [
      OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION,
      OrderStatus.CLOSED,
    ])
      expect(() => assertTransition(from, OrderStatus.CANCELLED)).not.toThrow();
  });

  it('chốt phải đi qua "Chờ chốt giá"', () => {
    expect(() => assertTransition(OrderStatus.QUOTING, OrderStatus.CLOSED)).toThrow(
      ConflictException,
    );
    expect(() =>
      assertTransition(OrderStatus.AWAITING_SELECTION, OrderStatus.CLOSED),
    ).not.toThrow();
  });

  /**
   * Vòng đời DỪNG ở 'closed'. Tick mốc tiến độ không còn đẩy đơn đi tiếp — đó
   * chính là điều migration 023 bỏ đi.
   */
  it('closed là bước cuối, chỉ còn đường huỷ', () => {
    expect(ALLOWED[OrderStatus.CLOSED]).toEqual([OrderStatus.CANCELLED]);
  });

  it('cancelled không đi đâu được nữa', () => {
    expect(ALLOWED[OrderStatus.CANCELLED]).toEqual([]);
    expect(() => assertTransition(OrderStatus.CANCELLED, OrderStatus.QUOTING)).toThrow(
      ConflictException,
    );
  });

  it('mọi trạng thái chưa kết thúc đều hủy được', () => {
    for (const to of Object.values(ALLOWED))
      if (to.length) expect(to).toContain(OrderStatus.CANCELLED);
  });

  it('thông điệp lỗi dùng nhãn tiếng Việt', () => {
    expect(() => assertTransition(OrderStatus.CANCELLED, OrderStatus.QUOTING)).toThrow(/Đã hủy/);
  });

  /** Bốn trạng thái đã bỏ không được lẻn về qua bất kỳ nhánh nào. */
  it('không nhánh nào còn trỏ tới 4 trạng thái đã bỏ', () => {
    const goner = ['in_progress', 'completed', 'rejected', 'awaiting_customer'];
    const reachable = Object.values(ALLOWED).flat() as string[];
    for (const g of goner) expect(reachable).not.toContain(g);
    expect(Object.keys(ALLOWED)).toHaveLength(7);
  });
});

describe('assertTransition — thông báo lặp trạng thái (QA-18)', () => {
  it('nói thẳng là đã ở trạng thái đó, không đọc thành "từ X sang X"', () => {
    expect(() => assertTransition(OrderStatus.CANCELLED, OrderStatus.CANCELLED)).toThrow(
      'Đơn đang ở trạng thái "Đã hủy" rồi',
    );
  });

  it('bước chuyển sai thật vẫn nêu cả hai đầu', () => {
    expect(() => assertTransition(OrderStatus.NEW, OrderStatus.CLOSED)).toThrow(
      /từ "Mới tạo" sang "Đã chốt"/,
    );
  });
});

/**
 * QA-31: máy trạng thái chặn đúng close/select trên đơn terminal, nhưng các
 * endpoint của phòng ban không đụng tới status nên báo giá vào đơn đã hủy vẫn ghi
 * thật. Bất biến "terminal là terminal" phải được giữ ở tầng API.
 */
describe('assertDeptWorkable', () => {
  it('cho phép suốt vòng đời báo giá', () => {
    for (const s of [
      OrderStatus.NEW,
      OrderStatus.DISTRIBUTED,
      OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION,
    ])
      expect(() => assertDeptWorkable(s)).not.toThrow();
  });

  it('chặn đơn đã huỷ', () => {
    expect(() => assertDeptWorkable(OrderStatus.CANCELLED)).toThrow(ConflictException);
  });

  /** KHÁC "chưa terminal": đơn đã chốt còn huỷ được nhưng vòng giá đã đóng. */
  it('chặn cả đơn đã chốt, dù nó chưa terminal', () => {
    expect(ALLOWED[OrderStatus.CLOSED].length).toBeGreaterThan(0);
    expect(() => assertDeptWorkable(OrderStatus.CLOSED)).toThrow(ConflictException);
  });

  it('nói rõ trạng thái hiện tại bằng nhãn tiếng Việt', () => {
    expect(() => assertDeptWorkable(OrderStatus.CANCELLED)).toThrow(/Đã hủy/);
  });
});

describe('awaiting_info — đơn từ form khách còn thiếu thông tin', () => {
  it('đi được sang new, distributed và cancelled', () => {
    for (const to of [OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.CANCELLED])
      expect(() => assertTransition(OrderStatus.AWAITING_INFO, to)).not.toThrow();
  });

  /**
   * Bỏ qua bước nhập thông tin là đúng thứ trạng thái này sinh ra để chặn:
   * phòng ban không được nhận một đơn chưa có điểm đi lẫn điểm đến.
   */
  it('KHÔNG đi thẳng sang quoting hay các bước sau', () => {
    for (const to of [
      OrderStatus.QUOTING, OrderStatus.AWAITING_SELECTION, OrderStatus.CLOSED,
    ])
      expect(() => assertTransition(OrderStatus.AWAITING_INFO, to)).toThrow(ConflictException);
  });

  /**
   * Một chiều. Cho quay lại thì người lỡ xoá trống ô điểm đến sẽ kéo đơn đang
   * báo giá dở về hàng chờ, phòng ban mất việc đang làm.
   */
  it('không trạng thái nào quay NGƯỢC về awaiting_info', () => {
    for (const from of Object.keys(ALLOWED) as OrderStatus[])
      expect(ALLOWED[from]).not.toContain(OrderStatus.AWAITING_INFO);
  });

  /** Không nằm trong DEPT_WORKABLE chính là cơ chế chặn phòng ban báo giá. */
  it('phòng ban không thao tác được', () => {
    expect(() => assertDeptWorkable(OrderStatus.AWAITING_INFO)).toThrow(ConflictException);
  });

  it('có nhãn tiếng Việt, không rơi về mã thô', () => {
    expect(statusLabel(OrderStatus.AWAITING_INFO)).toBe('Cần bổ sung thông tin');
  });
});

describe('nhãn của trạng thái gộp', () => {
  it('awaiting_selection đọc là "Chờ chốt giá"', () => {
    expect(statusLabel(OrderStatus.AWAITING_SELECTION)).toBe('Chờ chốt giá');
  });
});
