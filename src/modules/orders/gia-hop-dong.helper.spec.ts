import { giaHopDong } from './gia-hop-dong.helper';

/** Dựng một đơn tối giản đúng hình dạng mà truy vấn chi tiết trả về. */
const don = (
  finalAmount: number | null,
  departmentId: number | null,
  phong: { departmentId: number; amount: number | null }[],
  source: string | null = 'sale',
  salePrice: number | null = null,
) => ({ finalAmount, departmentId, departments: phong, source, salePrice });

describe('giaHopDong', () => {
  /**
   * ĐÂY LÀ CA ĐÃ HỎNG THẬT trên production.
   *
   * `orders.final_amount` chỉ được ghi lúc CHỐT ĐƠN, mà chốt đơn lại xảy ra SAU
   * khi khách ký. Nên đúng lúc gửi hợp đồng đi, nó vẫn là null — và tờ hợp đồng
   * khách nhận được in dòng "Giá trị hợp đồng: ………" không có số tiền nào.
   *
   * Một hợp đồng vận chuyển không ghi giá thì ký xong cũng không chốt được điều
   * quan trọng nhất. Giá đã có sẵn ở báo giá của phòng thắng — lấy từ đó.
   */
  it('chưa chốt đơn thì lấy giá của phòng thắng', () => {
    expect(giaHopDong(don(null, 4, [
      { departmentId: 4, amount: 32_000_000 },
      { departmentId: 5, amount: null },
    ]))).toBe(32_000_000);
  });

  /* Đơn đã chốt thì final_amount là con số đã khoá — ưu tiên nó, vì sau khi chốt
     báo giá của phòng vẫn có thể bị sửa mà doanh thu thì không được đổi theo. */
  it('đã chốt thì lấy doanh thu đã khoá, không lấy lại từ phòng', () => {
    expect(giaHopDong(don(45_000_000, 4, [
      { departmentId: 4, amount: 32_000_000 },
    ]))).toBe(45_000_000);
  });

  it('chưa chọn phòng thắng thì không có giá', () => {
    expect(giaHopDong(don(null, null, [{ departmentId: 4, amount: 32_000_000 }]))).toBeNull();
  });

  /* Phòng thắng chưa gửi báo giá: KHÔNG được trả 0. Số 0 trên hợp đồng là một
     cam kết miễn phí, còn ô trống thì ai đọc cũng biết là còn thiếu. */
  it('phòng thắng chưa có báo giá thì trả null, không trả 0', () => {
    expect(giaHopDong(don(null, 4, [{ departmentId: 4, amount: null }]))).toBeNull();
  });

  it('không tìm thấy dòng của phòng thắng thì trả null', () => {
    expect(giaHopDong(don(null, 9, [{ departmentId: 4, amount: 32_000_000 }]))).toBeNull();
  });

  /* Đơn landing: giá phòng ban là giá vốn, hợp đồng phải in giá Sale chốt. */
  it('đơn landing in giá Sale chốt, không in giá phòng ban', () => {
    expect(giaHopDong(don(null, 4, [{ departmentId: 4, amount: 15_000_000 }], 'website', 18_000_000)))
      .toBe(18_000_000);
  });

  it('đơn landing Sale chưa nhập giá thì để trống — KHÔNG rơi về giá vốn', () => {
    expect(giaHopDong(don(null, 4, [{ departmentId: 4, amount: 15_000_000 }], 'website', null)))
      .toBeNull();
  });

  /* Mọi đơn đều nhập được giá chốt: đơn Sale tự tạo có giá chốt thì in giá chốt,
     chưa nhập thì vẫn in giá phòng thắng như trước. */
  it('đơn Sale tự tạo có giá chốt thì in giá chốt', () => {
    expect(giaHopDong(don(null, 4, [{ departmentId: 4, amount: 15_000_000 }], 'hotline', 17_000_000)))
      .toBe(17_000_000);
  });

  it('đơn Sale tự tạo chưa nhập giá chốt thì in giá phòng thắng', () => {
    expect(giaHopDong(don(null, 4, [{ departmentId: 4, amount: 15_000_000 }], 'hotline', null)))
      .toBe(15_000_000);
  });
});
