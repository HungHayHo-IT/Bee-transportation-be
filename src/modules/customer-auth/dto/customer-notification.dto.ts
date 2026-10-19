import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { CustomerNotifType } from '@/common/enums';

const TYPES = Object.values(CustomerNotifType);

export class CustomerNotificationDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: TYPES }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) body!: string | null;
  @ApiProperty({ type: Number, nullable: true }) orderId!: number | null;
  @ApiProperty({ type: Number, nullable: true }) quoteRequestId!: number | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class MarkCustomerReadDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsInt({ each: true }) @ArrayMaxSize(200)
  ids?: number[];

  @ApiPropertyOptional({ description: 'true = đánh dấu đã đọc toàn bộ' })
  @IsOptional() @IsBoolean()
  all?: boolean;
}

export class SetPushOffDto {
  @ApiProperty({ enum: TYPES, isArray: true })
  @IsArray() @IsIn(TYPES, { each: true }) @ArrayMaxSize(20)
  pushOff!: string[];
}
