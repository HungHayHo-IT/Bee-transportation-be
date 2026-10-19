import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DeptState } from '@/common/enums';
import { MAX_PAGE } from '@/common/dto/pagination.dto';

/**
 * Ba trạng thái CÒN nằm trong hàng đợi. `passed`, `won`, `lost` đã rời hàng đợi
 * theo đúng định nghĩa, nên nhận chúng ở đây rồi trả về rỗng là để người gọi tự
 * đoán xem mình lọc sai hay phòng thật sự không có đơn nào.
 */
export const QUEUE_STATES = [DeptState.PENDING, DeptState.CLAIMED, DeptState.QUOTED];

/** Đủ cho hàng đợi một phòng; xem QueueQueryDto.limit về việc vì sao là 200. */
export const QUEUE_MAX_LIMIT = 200;

/**
 * Tham số cho GET /queue.
 *
 * CỐ Ý KHÔNG kế thừa PaginationDto, và đây không phải chỗ để "sửa lại cho đồng
 * bộ": DTO chung mặc định `limit` 20, còn endpoint này trước giờ trả thẳng trọn
 * tập tối đa 200 dòng và app đang dựa vào đúng điều đó để lọc tại máy. Hạ mặc
 * định xuống 20 thì app vẫn parse được, vẫn không có lỗi nào bật lên, chỉ là
 * danh sách thiếu đơn — kiểu hỏng tệ nhất vì không ai biết.
 *
 * Giữ 200 làm mặc định nên phân trang ở đây là thứ client CHỌN dùng, không phải
 * thứ bị áp lên đầu. App cập nhật lúc nào cũng được.
 */
export class QueueQueryDto {
  @ApiPropertyOptional({
    enum: QUEUE_STATES,
    description: 'Lọc theo phần việc của phòng. Bỏ trống = cả ba trạng thái còn trong hàng đợi.',
  })
  @IsOptional()
  @IsIn(QUEUE_STATES)
  status?: DeptState;

  @ApiPropertyOptional({ default: 1, maximum: MAX_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({
    default: QUEUE_MAX_LIMIT,
    maximum: QUEUE_MAX_LIMIT,
    description: 'Mặc định 200 để giữ nguyên hành vi cũ — xem chú thích của DTO.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(QUEUE_MAX_LIMIT)
  limit = QUEUE_MAX_LIMIT;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
