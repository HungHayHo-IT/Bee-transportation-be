import { NotifType } from '@/common/enums';
import { buildNewOrderRows, type NewOrderNotifyRow } from './new-order-notify.helper';

const BASE = {
  orderId: 42,
  orderCode: 'DOM-20260915-01',
  serviceName: 'Vận chuyển nội địa',
  source: null as string | null,
  deptRecipientIds: [] as number[],
  staffIds: [] as number[],
  routed: false,
};

const rowFor = (rows: NewOrderNotifyRow[], userId: number) =>
  rows.filter((r) => r.userId === userId);

describe('buildNewOrderRows — đơn có phòng phụ trách', () => {
  it('người của phòng nhận bản "phân phối tới phòng bạn"', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [5], staffIds: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(5);
    expect(rows[0].title).toBe('Đơn mới DOM-20260915-01');
    expect(rows[0].body).toContain('phòng bạn');
  });

  /**
   * Lý do của cả thay đổi này: trước đây admin hoàn toàn im lặng khi đơn tạo
   * thành công, vì thông báo chỉ đi xuống phòng được định tuyến.
   */
  it('admin ngoài phòng vẫn nhận, với bản tổng quan', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [5], staffIds: [1],
    });
    expect(rows).toHaveLength(2);
    const admin = rowFor(rows, 1)[0];
    expect(admin.title).toBe('Đơn mới DOM-20260915-01');
    expect(admin.body).not.toContain('phòng bạn');
    expect(admin.body).toContain('Vận chuyển nội địa');
  });

  /**
   * Bảng notifications không có ràng buộc UNIQUE nào, nên skipDuplicates của
   * Prisma không gỡ trùng — phải khử ở đây, nếu không người vừa là admin vừa
   * thuộc phòng sẽ nhận hai chuông cho cùng một đơn.
   */
  it('admin kiêm thành viên phòng chỉ nhận ĐÚNG MỘT thông báo', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [7], staffIds: [7],
    });
    expect(rowFor(rows, 7)).toHaveLength(1);
  });

  it('và bản người đó nhận là bản của phòng, không phải bản tổng quan', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [7], staffIds: [7],
    });
    expect(rowFor(rows, 7)[0].body).toContain('phòng bạn');
  });

  it('không userId nào lặp lại dù danh sách đầu vào chồng nhau', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [1, 2, 3], staffIds: [2, 3, 4],
    });
    const ids = rows.map((r) => r.userId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('đơn từ form website thì bản tổng quan ghi rõ nguồn', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, source: 'website', deptRecipientIds: [5], staffIds: [1],
    });
    expect(rowFor(rows, 1)[0].body).toContain('website');
  });

  it('đơn sale nội bộ tạo thì không bịa ra nguồn', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, source: null, deptRecipientIds: [5], staffIds: [1],
    });
    expect(rowFor(rows, 1)[0].body).not.toContain('website');
  });

  it('mọi row đều gắn đúng orderId và loại NEW_ORDER', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [5], staffIds: [1],
    });
    for (const r of rows) {
      expect(r.orderId).toBe(42);
      expect(r.type).toBe(NotifType.NEW_ORDER);
    }
  });
});

describe('buildNewOrderRows — đơn chưa có phòng nào phụ trách', () => {
  it('admin và sale nhận cảnh báo chưa định tuyến', () => {
    const rows = buildNewOrderRows({ ...BASE, routed: false, staffIds: [1, 2] });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.title).toBe('Đơn DOM-20260915-01 chưa định tuyến');
      expect(r.body).toContain('chưa có phòng nào phụ trách');
    }
  });

  /** Cảnh báo cần hành động, không được lẫn với bản "đơn mới" bình thường. */
  it('không ai nhận bản "đơn mới" thường trong ca này', () => {
    const rows = buildNewOrderRows({ ...BASE, routed: false, staffIds: [1] });
    expect(rows.every((r) => r.title.includes('chưa định tuyến'))).toBe(true);
  });

  it('phòng rỗng nhưng vẫn có định tuyến thì không phải ca chưa định tuyến', () => {
    const rows = buildNewOrderRows({
      ...BASE, routed: true, deptRecipientIds: [], staffIds: [1],
    });
    expect(rows[0].title).toBe('Đơn mới DOM-20260915-01');
  });

  it('không có ai để báo thì trả mảng rỗng', () => {
    expect(buildNewOrderRows({ ...BASE, routed: false, staffIds: [] })).toEqual([]);
  });
});

describe('đơn chờ bổ sung thông tin', () => {
  const base = {
    orderId: 77, orderCode: 'RNT-260918-01', serviceName: 'Thuê xe',
    source: 'website', deptRecipientIds: [], staffIds: [1, 2], routed: false,
  };

  /**
   * Không được rơi vào nhánh "chưa định tuyến": dịch vụ VẪN có phòng phụ trách,
   * ta cố ý không phân. Báo sai nguyên nhân thì admin đi sửa cấu hình phòng ban
   * trong khi thứ cần làm là gọi cho khách hỏi điểm đi.
   */
  it('nói đúng nguyên nhân, không đổ cho định tuyến', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi', 'Điểm đến'] });
    expect(rows[0].title).toContain('cần bổ sung thông tin');
    expect(rows[0].title).not.toContain('chưa định tuyến');
  });

  it('liệt kê thẳng những trường còn thiếu', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi', 'Điểm đến'] });
    expect(rows[0].body).toContain('Điểm đi');
    expect(rows[0].body).toContain('Điểm đến');
  });

  it('báo cho admin và sale, mỗi người đúng một bản', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi'] });
    expect(rows.map((r) => r.userId).sort()).toEqual([1, 2]);
  });

  it('không thiếu gì thì giữ nguyên nội dung cũ', () => {
    const rows = buildNewOrderRows({ ...base, routed: true, deptRecipientIds: [9], missingInfo: [] });
    expect(rows[0].title).toBe('Đơn mới RNT-260918-01');
  });
});
