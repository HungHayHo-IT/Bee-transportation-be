import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAvatarS3Service, PresignedAvatarUpload } from './customer-avatar-s3.service';
import { CustomerMeDto } from './dto/customer-auth.dto';
import { toCustomerMe } from './customer-me.helper';

/**
 * Ảnh đại diện của khách. Tách khỏi CustomerProfileService cố ý: đây là service
 * duy nhất phụ thuộc S3, gộp vào thì mọi test hồ sơ đều phải dựng thêm một
 * S3Client giả cho một việc chúng không đụng tới.
 *
 * Luồng ba nhịp (giống news): xin URL ký sẵn -> client PUT thẳng lên bucket ->
 * gọi lại đây để lưu. Nhịp cuối nhận KEY chứ không nhận URL, xem
 * CustomerAvatarS3Service.publicUrlForOwnedKey.
 */
@Injectable()
export class CustomerAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: CustomerAvatarS3Service,
  ) {}

  presign(
    customerId: number,
    filename: string,
    contentType: string,
  ): Promise<PresignedAvatarUpload> {
    return this.s3.presignAvatar(customerId, filename, contentType);
  }

  /** `customerId` luôn từ @CurrentCustomer, không bao giờ từ body. */
  async setAvatar(customerId: number, key: string): Promise<CustomerMeDto> {
    const avatarUrl = this.s3.publicUrlForOwnedKey(customerId, key);
    return this.save(customerId, avatarUrl);
  }

  /** Quay về chữ cái đầu của tên — không xoá object trên bucket, xem ghi chú. */
  async clearAvatar(customerId: number): Promise<CustomerMeDto> {
    return this.save(customerId, null);
  }

  /**
   * Chỉ gỡ tham chiếu, KHÔNG xoá object cũ trên S3. Đổi ảnh là chuyện thường
   * xuyên, xoá đồng bộ ở đây nghĩa là request của khách phải chờ một lượt gọi
   * mạng nữa và vẫn hỏng nếu S3 lỗi. Object mồ côi để lifecycle rule của bucket
   * dọn — đó là việc bucket làm tốt hơn API.
   */
  private async save(customerId: number, avatarUrl: string | null): Promise<CustomerMeDto> {
    const c = await this.prisma.customerAccount.update({
      where: { id: customerId },
      data: { avatarUrl },
      include: { identities: { select: { provider: true } } },
    });
    return toCustomerMe(c);
  }
}
