import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SAFE_EXT = /^\.[a-z0-9]{1,8}$/i;

/**
 * S3-compatible storage cho news images. Presigned PUT URL — FE tự PUT thẳng
 * lên bucket, backend không proxy file. Tương thích AWS S3, Cloudflare R2,
 * MinIO, DO Spaces (mọi endpoint tuân thủ S3 API).
 *
 * Kích hoạt khi đủ 4 biến ACCESS_KEY_ID + SECRET + BUCKET + REGION. Endpoint
 * để trống là AWS mặc định; R2/MinIO/DO Spaces cần S3_ENDPOINT.
 */
@Injectable()
export class NewsS3Service {
  private readonly logger = new Logger(NewsS3Service.name);
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
        // R2 / MinIO / các endpoint tuỳ biến bắt buộc dùng path-style thay vì
        // virtual-hosted style; AWS chấp nhận cả hai.
        forcePathStyle: this.endpoint ? true : undefined,
        credentials: { accessKeyId: access, secretAccessKey: secret },
      });
      this.logger.log(`S3 enabled: bucket=${this.bucket} region=${this.region}`);
    } else {
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  private publicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase}/${key}`;
    // AWS convention: https://<bucket>.s3.<region>.amazonaws.com/<key>. Với
    // endpoint tuỳ biến (R2/MinIO) hầu như luôn cần S3_PUBLIC_URL_BASE riêng
    // (subdomain public/CDN), nếu quên set thì URL này chỉ đúng cho AWS.
    if (!this.endpoint) {
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
    return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${key}`;
  }

  /**
   * @param prefix Thư mục đầu key trên bucket. CMS của landing dùng 'cms' để
   * ảnh nội dung không lẫn vào ảnh bài viết — hai thứ có vòng đời khác nhau:
   * ảnh bài viết chết theo bài, ảnh CMS sống cùng trang.
   */
  async presignUpload(
    filename: string,
    contentType: string,
    prefix = 'news',
  ): Promise<PresignedUpload> {
    if (!this.client) throw new BadRequestException('S3 chưa được cấu hình');
    if (!ALLOWED_MIME.has(contentType))
      throw new BadRequestException(`Chỉ nhận ảnh JPG/PNG/WEBP/GIF (${contentType})`);

    const now = new Date();
    const ext = extname(filename).toLowerCase();
    const safeExt = SAFE_EXT.test(ext) ? ext : '';
    const key = [
      prefix,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      `${randomUUID()}${safeExt}`,
    ].join('/');

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      // Cho phép ai cũng đọc được — bài news cần hiển thị công khai trên
      // landing. Bucket phải bật ACL (BucketOwnerPreferred) hoặc mở policy
      // public-read; R2 không hỗ trợ ACL nên dùng bucket public.
      ACL: 'public-read',
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: this.expiresIn });

    return {
      key,
      uploadUrl,
      publicUrl: this.publicUrl(key),
      method: 'PUT',
      // Browser PUT phải giữ Content-Type khớp với lúc ký, nếu không AWS trả
      // 403 SignatureDoesNotMatch. ACL header cũng phải khớp cho AWS; R2 sẽ
      // bỏ qua nên gửi luôn cho đơn giản.
      headers: {
        'Content-Type': contentType,
        'x-amz-acl': 'public-read',
      },
      expiresIn: this.expiresIn,
    };
  }
}
