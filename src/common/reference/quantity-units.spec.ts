import { chuanDonViTinh, DON_VI_MAC_DINH, QUANTITY_UNITS } from './quantity-units';

/**
 * Đơn vị tính của `quantity` khi đẩy sang OF1-TMS.
 *
 * Gửi một mã ngoài danh mục thì OF1 từ chối NGUYÊN request — mất luôn cả
 * những ô đã khai đúng. Nên mã lạ phải dừng lại ở đây, không đi ra ngoài.
 */
describe('danh muc don vi tinh', () => {
  it('co du 171 don vi Bee cap va khong trung ma', () => {
    expect(QUANTITY_UNITS).toHaveLength(171);
    expect(new Set(QUANTITY_UNITS.map((u) => u.code)).size).toBe(171);
  });

  it('don vi mac dinh nam trong danh muc', () => {
    expect(chuanDonViTinh(DON_VI_MAC_DINH)).toBe(DON_VI_MAC_DINH);
  });

  it('nhan ma co that', () => {
    expect(chuanDonViTinh('PK')).toBe('PK');
    expect(chuanDonViTinh(' KGM ')).toBe('KGM');
  });

  /** Chưa khai và khai sai đều về null — bên gọi tự quyết rơi về đâu. */
  it('ma la, rong hay null deu ra null', () => {
    expect(chuanDonViTinh('KHONG_CO_MA_NAY')).toBeNull();
    expect(chuanDonViTinh('')).toBeNull();
    expect(chuanDonViTinh('   ')).toBeNull();
    expect(chuanDonViTinh(null)).toBeNull();
    expect(chuanDonViTinh(undefined)).toBeNull();
  });

  /** Phân biệt hoa thường: OF1 nhận đúng mã họ cấp, không tự sửa hộ. */
  it('phan biet hoa thuong', () => {
    expect(chuanDonViTinh('pk')).toBeNull();
  });
});
