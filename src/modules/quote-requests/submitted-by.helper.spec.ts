import { deriveSubmittedBy } from './submitted-by.helper';

/**
 * Ca quan trọng nhất là hai dòng giữa: trước khi có field này cả hai đều ra
 * `createdById: null` nên Admin/Sale không tách được khách tự gửi với ẩn danh.
 */
describe('deriveSubmittedBy', () => {
  it('nhân viên nội bộ nhập hộ -> staff', () => {
    expect(deriveSubmittedBy(7, null)).toBe('staff');
  });

  it('khách hàng đã đăng nhập tự gửi -> customer', () => {
    expect(deriveSubmittedBy(null, 42)).toBe('customer');
  });

  it('form public không cookie -> anonymous', () => {
    expect(deriveSubmittedBy(null, null)).toBe('anonymous');
  });

  it('có cả hai cookie thì nhân viên thắng', () => {
    expect(deriveSubmittedBy(7, 42)).toBe('staff');
  });
});
