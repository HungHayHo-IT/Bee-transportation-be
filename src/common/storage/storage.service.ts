import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream, ReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

export interface FileMeta {
  id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  by: number;
  at: string;
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const SAFE_EXT = /^\.[a-z0-9]{1,8}$/i;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(this.config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  maxBytes(): number {
    return Number(this.config.get<number>('MAX_FILE_SIZE_MB') ?? 20) * 1024 * 1024;
  }

  /**
   * Tên file trên đĩa sinh bằng UUID, KHÔNG dùng tên người dùng gửi lên (chống path
   * traversal). Tên gốc chỉ lưu trong metadata để hiển thị.
   */
  async save(
    orderId: number,
    original: string,
    mime: string,
    buf: Buffer,
    by: number,
  ): Promise<FileMeta> {
    if (!ALLOWED_MIME.has(mime))
      throw new BadRequestException(`Không nhận loại file này (${mime})`);
    if (buf.length > this.maxBytes())
      throw new BadRequestException(`File vượt quá ${this.maxBytes() / 1024 / 1024}MB`);

    const now = new Date();
    const rel = join(
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(orderId),
    );
    await mkdir(join(this.root, rel), { recursive: true });

    const ext = extname(original).toLowerCase();
    const id = randomUUID();
    const fileName = id + (SAFE_EXT.test(ext) ? ext : '');
    const relPath = join(rel, fileName);
    await writeFile(join(this.root, relPath), buf);

    return {
      id,
      name: original.slice(0, 255),
      path: relPath.split(sep).join('/'),
      mime,
      size: buf.length,
      by,
      at: now.toISOString(),
    };
  }

  /** Chặn thoát khỏi thư mục gốc kể cả khi metadata trong DB bị sửa bậy. */
  private absolute(relPath: string): string {
    const abs = resolve(this.root, relPath);
    if (!abs.startsWith(this.root + sep))
      throw new BadRequestException('Đường dẫn file không hợp lệ');
    return abs;
  }

  async stream(relPath: string): Promise<ReadStream> {
    const abs = this.absolute(relPath);
    try {
      await stat(abs);
    } catch {
      throw new NotFoundException('File không còn trên đĩa');
    }
    return createReadStream(abs);
  }

  async remove(relPath: string): Promise<void> {
    try {
      await unlink(this.absolute(relPath));
    } catch (e) {
      // File đã mất thì thôi — xóa metadata mới là việc chính.
      this.logger.warn({ err: e, relPath }, 'Không xóa được file trên đĩa');
    }
  }
}
