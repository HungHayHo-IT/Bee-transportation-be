import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface PresignedAvatarUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

/**
 * Whitelist, không blacklist. `image/svg+xml` CỐ Ý không nằm trong danh sách dù
 * là ảnh: SVG là XML chạy được script, nằm trên bucket public thì thành XSS.
 */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SAFE_EXT = /^\.[a-z0-9]{1,8}$/i;
const PREFIX = 'customer-avatars';
/** Đúng hình dạng key do chính service này sinh ra — xem presignAvatar. */
const KEY_SHAPE = /^customer-avatars\/(\d+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/;

/**
 * Ảnh đại diện khách hàng trên S3-compatible storage. Cùng lối với
 * NewsS3Service: API chỉ KÝ một URL, client PUT thẳng byte lên bucket. Avatar là
 * ảnh công khai, cho byte đi xuyên API chỉ tốn băng thông và thời gian request
 * mà không thêm được bất cứ kiểm soát nào.
 *
 * Bật khi đủ 4 biến ACCESS_KEY_ID + SECRET + BUCKET + REGION. THIẾU BIẾN THÌ
 * TẮT, không ném ở constructor: dev máy lẻ không có S3 vẫn phải chạy được app.
 */
@Injectable()
export class CustomerAvatarS3Service {
  private readonly logger = new Logger(CustomerAvatarS3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly publicBase: string;
  private readonly expiresIn: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? '';
    this.region = this.config.get<string>('S3_REGION') ?? '';
    this.endpoint = this.config.get<string>('S3_ENDPOINT') ?? '';
    this.publicBase = (this.config.get<string>('S3_PUBLIC_URL_BASE') ?? '').replace(/\/+$/, '');
    this.expiresIn = Number(this.config.get<number>('S3_PRESIGN_EXPIRES') ?? 300);

    const access = this.config.get<string>('S3_ACCESS_KEY_ID') ?? '';
    const secret = this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? '';
    if (this.bucket && this.region && access && secret) {
      this.client = new S3Client({
        region: this.region,
        endpoint: this.endpoint || undefined,
        // R2 / MinIO bắt buộc path-style; AWS chấp nhận cả hai.
        forcePathStyle: this.endpoint ? true : undefined,
        credentials: { accessKeyId: access, secretAccessKey: secret },
      });
      this.logger.log(`Avatar S3 enabled: bucket=${this.bucket}`);
    } else {
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  private publicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase}/${key}`;
    if (!this.endpoint) return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${key}`;
  }

  /**
   * Key mang sẵn id chủ ảnh (`customer-avatars/<id>/<uuid>`). Nhờ vậy bước lưu
   * URL về sau chỉ cần so id trong key với id trong phiên là biết key có phải
   * của người đang gọi không — không phải tra thêm bảng nào.
   */
  async presignAvatar(
    customerId: number,
    filename: string,
    contentType: string,
  ): Promise<PresignedAvatarUpload> {
    if (!this.client) throw new BadRequestException('S3 chưa được cấu hình — kiểm tra biến S3_* trong .env');
    if (!ALLOWED_MIME.has(contentType))
      throw new BadRequestException(`Ảnh đại diện chỉ nhận JPG/PNG/WEBP/GIF (${contentType || 'trống'})`);

    const ext = extname(filename).toLowerCase();
    const key = `${PREFIX}/${customerId}/${randomUUID()}${SAFE_EXT.test(ext) ? ext : ''}`;

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      // Avatar hiển thị công khai trong app nên object phải đọc được không cần ký.
      ACL: 'public-read',
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: this.expiresIn });

    return {
      key,
      uploadUrl,
      publicUrl: this.publicUrl(key),
      method: 'PUT',
      // Content-Type phải khớp đúng lúc ký, lệch là AWS trả 403
      // SignatureDoesNotMatch. R2 bỏ qua x-amz-acl nên gửi luôn cho đơn giản.
      headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read' },
      expiresIn: this.expiresIn,
    };
  }

  /**
   * Đổi key lấy URL công khai, kèm chốt quyền sở hữu.
   *
   * Vì sao không nhận thẳng URL từ client: URL tự do cho phép khách trỏ avatar
   * sang máy chủ bất kỳ (theo dõi ai đang xem, hoặc đổi nội dung sau khi được
   * duyệt). Server dựng URL từ key của chính mình thì ảnh chắc chắn nằm trong
   * bucket ta kiểm soát.
   */
  publicUrlForOwnedKey(customerId: number, key: string): string {
    const m = KEY_SHAPE.exec(key ?? '');
    if (!m) throw new BadRequestException('Key ảnh không hợp lệ');
    if (Number(m[1]) !== customerId)
      throw new BadRequestException('Key ảnh không thuộc về tài khoản này');
    return this.publicUrl(key);
  }
}
