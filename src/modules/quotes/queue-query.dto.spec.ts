import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DeptState } from '@/common/enums';
import { QueueQueryDto, QUEUE_MAX_LIMIT } from './dto/queue-query.dto';

/**
 * Tầng kiểm tham số của GET /queue. Test ở queue-filter.spec đo phần service
 * khi ĐÃ có DTO hợp lệ; file này đo đúng cái ranh giới trước đó — thứ quyết
 * định request nào bị chặn ở cửa với 400 thay vì chạy vào trong.
 */
const parse = (q: Record<string, unknown>) => {
  const dto = plainToInstance(QueueQueryDto, q, { enableImplicitConversion: false });
  return { dto, errors: validateSync(dto) };
};

const failedFields = (q: Record<string, unknown>) =>
  parse(q).errors.map((e) => e.property);

describe('QueueQueryDto — kiểm tham số GET /queue', () => {
  it('không truyền gì thì mặc định là trang 1, 200 dòng', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(QUEUE_MAX_LIMIT);
    expect(dto.status).toBeUndefined();
  });

  it.each([DeptState.PENDING, DeptState.CLAIMED, DeptState.QUOTED])(
    'nhận status=%s', (state) => {
      expect(failedFields({ status: state })).toHaveLength(0);
    },
  );

  /**
   * Ba trạng thái này đã RỜI hàng đợi theo đúng định nghĩa. Nhận rồi trả về
   * rỗng là để người gọi tự đoán xem mình lọc sai hay phòng thật sự không có
   * đơn nào — hai chuyện khác hẳn nhau.
   */
  it.each([DeptState.PASSED, DeptState.WON, DeptState.LOST])(
    'từ chối status=%s vì nó không thuộc hàng đợi', (state) => {
      expect(failedFields({ status: state })).toContain('status');
    },
  );

  it('từ chối status không phải trạng thái nào', () => {
    expect(failedFields({ status: 'linh-tinh' })).toContain('status');
  });

  /** Trần 200 là trần thật, không phải gợi ý — vượt thì chặn ở cửa. */
  it('từ chối limit vượt trần 200', () => {
    expect(failedFields({ limit: 201 })).toContain('limit');
  });

  it.each([0, -1])('từ chối limit=%s', (limit) => {
    expect(failedFields({ limit })).toContain('limit');
  });

  it.each([0, -5])('từ chối page=%s', (page) => {
    expect(failedFields({ page })).toContain('page');
  });

  /**
   * Query string luôn tới dưới dạng chuỗi. Thiếu @Type(() => Number) thì "2"
   * trượt @IsInt và mọi request có phân trang đều thành 400.
   */
  it('đổi chuỗi trong query string thành số', () => {
    const { dto, errors } = parse({ page: '2', limit: '50' });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('skip tính từ page và limit đã chuyển kiểu', () => {
    expect(parse({ page: '3', limit: '20' }).dto.skip).toBe(40);
  });

  it('từ chối limit không phải số nguyên', () => {
    expect(failedFields({ limit: '2.5' })).toContain('limit');
  });
});
