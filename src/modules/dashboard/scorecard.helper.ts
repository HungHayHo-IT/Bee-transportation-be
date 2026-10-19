/** Một dòng trong bảng đánh giá nhân viên. */
export interface ScorecardRow {
  userId: number;
  fullName: string;
  /** Số đơn người này tạo (admin sale) hoặc nhận báo giá (pricing). */
  orderCount: number;
  /** Số đơn ĐÃ RA KẾT QUẢ — thắng, hoặc huỷ sau khi đã có báo giá. */
  decidedCount: number;
  closedCount: number;
  /** Tổng tiền đã báo giá — khác doanh thu: báo giá không phải đơn nào cũng thắng. */
  quotedTotal: number;
  revenue: number;
}

/**
 * Tỷ lệ chuyển đổi, phần trăm, một chữ số thập phân.
 *
 * Mẫu số 0 trả `null` chứ KHÔNG trả 0. Người chưa có đơn nào ra kết quả thì
 * tỷ lệ của họ chưa tồn tại; in ra "0%" là nói rằng họ không chốt được đơn
 * nào, trong khi thực tế là chưa có đơn nào để chốt — và hai chuyện đó khác
 * hẳn nhau khi dùng con số này để đánh giá một người.
 */
export function tiLeChuyenDoi(chot: number, daRaKetQua: number): number | null {
  if (daRaKetQua <= 0) return null;
  return Math.round((chot / daRaKetQua) * 1000) / 10;
}

/**
 * Xếp hạng: DOANH THU trước, tỷ lệ chuyển đổi sau.
 *
 * Tỷ lệ dùng một mình thì người có 1 đơn thắng 1 đứng trên người có 40 đơn
 * thắng 30 — 100% so với 75% — và bảng đánh giá nhân viên trở thành phần
 * thưởng cho người nhận ít việc. Doanh thu là thứ công ty thực sự nhận về nên
 * nó đi trước; tỷ lệ là cách đọc chất lượng của khối lượng đó.
 *
 * Người CHƯA CÓ tỷ lệ xếp sau người đã có, không coi như 0%.
 */
export function xepHangTheoDiem<T extends ScorecardRow>(ds: T[]): T[] {
  return [...ds].sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    const ta = tiLeChuyenDoi(a.closedCount, a.decidedCount);
    const tb = tiLeChuyenDoi(b.closedCount, b.decidedCount);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}
