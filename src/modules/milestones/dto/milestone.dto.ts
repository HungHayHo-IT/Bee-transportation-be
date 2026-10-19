import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MilestoneStatus } from '@/common/enums';

export class UpdateMilestoneDto {
  @ApiProperty({ enum: MilestoneStatus })
  @IsIn(Object.values(MilestoneStatus))
  status!: MilestoneStatus;

  @ApiPropertyOptional({ description: 'BẮT BUỘC khi status = skipped' })
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}
