import { ApiProperty } from '@nestjs/swagger';
import { PagedDto } from '@/common/dto/pagination.dto';

/**
 * Đơn hàng NHÌN TỪ PHÍA KHÁCH. Cố tình hẹp hơn hẳn DTO bên nhân viên.
 *
 * Không có: báo giá của từng phòng ban, phòng nào thắng, ghi chú nội bộ, tên
 * sale phụ trách. Đây là cửa cho một CÔNG TY KHÁC, nên mặc định là không cho
 * thấy — thêm trường nào thì phải hỏi trường đó có đáng ra ngoài không, chứ
 * không phải bỏ bớt từ bản đầy đủ rồi hy vọng đã bỏ đủ.
 */
export class DonCuaCongTyDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() status!: string;
  @ApiProperty() statusLabel!: string;
  @ApiProperty() serviceName!: string;

  @ApiProperty({ type: String, nullable: true })
  serviceChildName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Pháp nhân / người đứng tên đơn' })
  customerName!: string | null;

  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty({ type: Date, nullable: true }) desiredDate!: Date | null;

  @ApiProperty({
    type: Number, nullable: true,
    description: 'Giá đã chốt. null = đơn chưa chốt, KHÔNG phải miễn phí.',
  })
  finalAmount!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Mốc đã xong gần nhất' })
  latestMilestone!: string | null;

  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) completedAt!: Date | null;
}

export class DonCuaCongTyPageDto extends PagedDto(DonCuaCongTyDto) {}
