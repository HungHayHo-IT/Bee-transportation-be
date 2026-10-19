import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Đọc và ghi file của luồng ký, TỪ PHÍA MÁY CHỦ.
 *
 * Khác hẳn hai service S3 đang có: chúng cấp đường ký sẵn cho trình duyệt tự
 * tải ảnh lên. Ở đây máy chủ mới là bên ghi — bản PDF chốt và ảnh chữ ký không
 * đi qua tay khách, vì nếu để khách tự đẩy lên thì họ đẩy được file khác.
 *
 * Và KHÔNG có hàm trả đường dẫn công khai. Phiếu xác nhận mang giá và thông tin
 * khách; một URL công khai là ai đoán ra key cũng đọc được. File chỉ ra ngoài
 * qua endpoint có kiểm mã, và chính nó đọc bằng `docFile`.
 */
@Injectable()
export class ChuKyS3Service {
  private readonly logger = new Logger(ChuKyS3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? '';
    const region = config.get<string>('S3_REGION') ?? '';
    const endpoint = config.get<string>('S3_ENDPOINT') ?? '';
    const access = config.get<string>('S3_ACCESS_KEY_ID') ?? '';
    const secret = config.get<string>('S3_SECRET_ACCESS_KEY') ?? '';

    if (this.bucket && region && access && secret) {
      this.client = new S3Client({
        region,
        endpoint: endpoint || undefined,
        forcePathStyle: endpoint ? true : undefined,
        credentials: { accessKeyId: access, secretAccessKey: secret },
      });
    } else {
      this.client = null;
      this.logger.warn('S3 chưa cấu hình — luồng ký điện tử sẽ từ chối');
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async luuFile(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client) throw new BadRequestException('S3 chưa được cấu hình');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async docFile(key: string): Promise<Buffer> {
    if (!this.client) throw new BadRequestException('S3 chưa được cấu hình');
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = res.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body) throw new BadRequestException('Không đọc được file trên S3');
    const chunks: Buffer[] = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
}
