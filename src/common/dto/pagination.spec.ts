import { clamp, MAX_PAGE, onePage } from './pagination.dto';

describe('clamp — chuẩn hoá tham số phân trang từ query string', () => {
  /**
   * Ý đồ đã ghi trên cả sáu bản gốc: "số rác thì lấy mặc định thay vì ném 400".
   * Danh sách gõ sai tham số vẫn trả trang đầu, không chặn người dùng.
   */
  it.each([
    ['undefined', undefined, 7],
    ['chuỗi rỗng', '', 7],
    ['không phải số', 'abc', 7],
    ['số 0', '0', 7],
    ['số âm', '-5', 7],
    ['số thực', '1.5', 7],
  ])('%s thì rơi về mặc định', (_label, raw, expected) => {
    expect(clamp(raw as string | undefined, 7, 1, 100)).toBe(expected);
  });

  it('số hợp lệ thì giữ nguyên', () => {
    expect(clamp('3', 7, 1, 100)).toBe(3);
  });

  it('vượt trần thì cắt xuống trần', () => {
    expect(clamp('9999', 7, 1, 100)).toBe(100);
  });

  it('bằng đúng cận dưới thì được chấp nhận', () => {
    expect(clamp('1', 7, 1, 100)).toBe(1);
  });

  /**
   * Trước khi gộp, năm controller truyền Number.MAX_SAFE_INTEGER làm trần cho
   * page, nên skip = (page - 1) * limit vượt kiểu Int của Prisma và bật 500.
   */
  it('MAX_PAGE giữ skip trong tầm Int của Prisma', () => {
    const page = clamp(String(Number.MAX_SAFE_INTEGER), 1, 1, MAX_PAGE);
    expect(page).toBe(MAX_PAGE);
    expect((page - 1) * 100).toBeLessThan(2_147_483_647);
  });
});

describe('onePage', () => {
  it('bọc mảng thành một trang trọn vẹn', () => {
    expect(onePage(['a', 'b'])).toEqual({ items: ['a', 'b'], total: 2, page: 1, limit: 2 });
  });

  it('mảng rỗng cho limit 0, không phải mặc định bịa ra', () => {
    expect(onePage([])).toEqual({ items: [], total: 0, page: 1, limit: 0 });
  });
});

import { ApiProperty } from '@nestjs/swagger';
import { PagedDto } from './pagination.dto';

class WidgetDto {
  @ApiProperty() id!: number;
}

class GadgetDto {
  @ApiProperty() name!: string;
}

describe('PagedDto — nhà máy sinh lớp vỏ phân trang cho Swagger', () => {
  it('lớp sinh ra khởi tạo được và có đúng bốn field', () => {
    class WidgetPageDto extends PagedDto(WidgetDto) {}
    const page = Object.assign(new WidgetPageDto(), {
      items: [{ id: 1 }], total: 1, page: 1, limit: 20,
    });
    expect(Object.keys(page).sort()).toEqual(['items', 'limit', 'page', 'total']);
  });

  /**
   * Swagger lấy TÊN LỚP làm tên schema. Mọi lớp sinh từ cùng một nhà máy mà
   * trùng tên thì các schema đè lên nhau và tài liệu API sai im lặng — không
   * một test nào khác trong repo bắt được chuyện đó.
   */
  it('hai lớp sinh từ hai kiểu khác nhau có tên khác nhau', () => {
    const A = PagedDto(WidgetDto);
    const B = PagedDto(GadgetDto);
    expect(A.name).not.toBe(B.name);
    expect(A.name).toContain('Widget');
    expect(B.name).toContain('Gadget');
  });

  /** Bốn endpoint reference/* trả string[], không phải lớp DTO. */
  it('nhận được kiểu nguyên thuỷ String', () => {
    const S = PagedDto(String);
    expect(typeof S).toBe('function');
    expect(S.name).toContain('String');
  });
});
