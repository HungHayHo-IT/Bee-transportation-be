import { ReferenceController } from '@/modules/reference/reference.controller';

/**
 * Cả 12 endpoint nhóm này cùng một luật: bọc onePage(), total = số phần tử,
 * page = 1. Kiểm bốn endpoint reference/* là đủ đại diện vì chúng đồng bộ và
 * không cần dựng service giả; tám cái còn lại đi qua đúng một hàm onePage().
 */
describe('reference/* trả vỏ phân trang thay vì mảng trần', () => {
  const c = new ReferenceController();

  it('provinces trả vỏ, total khớp số phần tử', () => {
    const res = c.provinces();
    expect(Array.isArray(res)).toBe(false);
    expect(res.page).toBe(1);
    expect(res.total).toBe(res.items.length);
    expect(res.items).toContain('Hà Nội');
  });

  it('order-statuses trả vỏ', () => {
    const res = c.orderStatuses();
    expect(res.total).toBe(res.items.length);
    expect(res.items[0]).toHaveProperty('value');
    expect(res.items[0]).toHaveProperty('label');
  });

  it('reject-reasons trả vỏ', () => {
    const res = c.rejectReasons();
    expect(res.total).toBe(res.items.length);
  });

  it('order-sources trả vỏ', () => {
    const res = c.orderSources();
    expect(res.total).toBe(res.items.length);
  });
});
