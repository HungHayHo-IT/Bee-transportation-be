import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RequestRevisionDto, PassDto } from '@/modules/quotes/dto/quote.dto';
import { CancelOrderDto } from './order.dto';

/**
 * QA-32: `@IsString()` một mình coi chuỗi rỗng là hợp lệ, nên `{"reason":""}` và
 * `{"reason":" "}` đi lọt. Với hủy đơn thì đây là hành động không hoàn tác được
 * mà không để lại lý do — nặng hơn ca bỏ qua mà biên bản QA đã nêu.
 */
const CASES = [
  { name: 'PassDto', make: (v: unknown) => plainToInstance(PassDto, { reason: v }) },
  {
    name: 'CancelOrderDto',
    make: (v: unknown) => plainToInstance(CancelOrderDto, { reason: v }),
  },
  {
    name: 'RequestRevisionDto',
    make: (v: unknown) => plainToInstance(RequestRevisionDto, { departmentIds: [1], reason: v }),
  },
];

describe.each(CASES)('$name.reason bắt buộc có nội dung', ({ make }) => {
  it('từ chối chuỗi rỗng', () => {
    expect(validateSync(make(''))).not.toHaveLength(0);
  });

  it('từ chối chuỗi chỉ có khoảng trắng', () => {
    expect(validateSync(make('   '))).not.toHaveLength(0);
  });

  it('từ chối tab và xuống dòng', () => {
    expect(validateSync(make('\t\n '))).not.toHaveLength(0);
  });

  it('nhận lý do thật', () => {
    expect(validateSync(make('Khách đổi ý'))).toHaveLength(0);
  });

  /** Trim ở tầng DTO, nếu không thì DB lưu cả khoảng trắng thừa của người gõ. */
  it('cắt khoảng trắng hai đầu trước khi lưu', () => {
    const dto = make('  Khách đổi ý  ') as { reason: string };
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Khách đổi ý');
  });
});
