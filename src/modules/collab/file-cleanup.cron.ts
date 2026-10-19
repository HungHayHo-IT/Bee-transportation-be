import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readdir, stat, unlink } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FileCleanupCron {
  private readonly logger = new Logger(FileCleanupCron.name);
  private readonly root: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  private async walk(dir: string, out: string[] = []): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return out; // thư mục uploads chưa tồn tại
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await this.walk(full, out);
      else out.push(full);
    }
    return out;
  }

  /**
   * Xóa file trên đĩa không còn tham chiếu trong jsonb.
   * CHỈ xóa file cũ hơn 24 giờ: file vừa upload xong mà transaction ghi metadata chưa
   * commit thì chưa có tham chiếu — xóa ngay là mất dữ liệu của người dùng.
   */
  @Cron(process.env.FILE_CLEANUP_CRON ?? '0 3 * * *')
  async cleanupOrphanFiles(): Promise<void> {
    const [orders, milestones] = await Promise.all([
      this.prisma.order.findMany({ select: { files: true } }),
      this.prisma.orderMilestone.findMany({ select: { files: true } }),
    ]);

    const referenced = new Set<string>();
    for (const row of [...orders, ...milestones])
      if (Array.isArray(row.files))
        for (const f of row.files as unknown as { path?: string }[])
          if (f?.path) referenced.add(f.path);

    const onDisk = await this.walk(this.root);
    const cutoff = Date.now() - ONE_DAY_MS;
    let removed = 0;

    for (const abs of onDisk) {
      const rel = relative(this.root, abs).split(sep).join('/');
      if (referenced.has(rel)) continue;
      try {
        const st = await stat(abs);
        if (st.mtimeMs > cutoff) continue; // còn mới, có thể đang được ghi
        await unlink(abs);
        removed++;
      } catch (e) {
        this.logger.warn({ err: e, rel }, 'Không xóa được file mồ côi');
      }
    }
    if (removed) this.logger.log(`Đã xóa ${removed} file mồ côi`);
  }
}
