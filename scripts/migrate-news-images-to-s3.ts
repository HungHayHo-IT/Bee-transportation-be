/**
 * Chuyển ảnh news còn ở đĩa sang S3.
 *
 * Chạy MỘT LẦN sau khi bật S3 và trước khi deploy bản đã xoá code disk. Script:
 *  1. Quét mọi file trong <UPLOAD_DIR>/news/YYYY/MM/*
 *  2. Upload từng file lên S3 với key news/YYYY/MM/<basename>
 *  3. Rewrite URL trong news_articles.body và cover_image_url:
 *       /api/news/images/YYYY/MM/UUID.ext  →  <S3_PUBLIC_URL_BASE>/news/YYYY/MM/UUID.ext
 *  4. Nếu tất cả OK, in gợi ý xoá thư mục uploads/news (không tự xoá).
 *
 * Chạy:
 *   npx ts-node scripts/migrate-news-images-to-s3.ts
 * hoặc trong container:
 *   docker compose exec api node dist/scripts/migrate-news-images-to-s3.js
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readdir, readFile, stat } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến ${name}`);
  return v;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const p = join(dir, it.name);
      if (it.isDirectory()) out.push(...(await walk(p)));
      else if (it.isFile()) out.push(p);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return out;
}

async function main(): Promise<void> {
  const root = resolve(process.env.UPLOAD_DIR ?? './uploads');
  const newsDir = join(root, 'news');
  const bucket = requireEnv('S3_BUCKET');
  const publicBase = requireEnv('S3_PUBLIC_URL_BASE').replace(/\/+$/, '');
  const s3 = new S3Client({
    region: requireEnv('S3_REGION'),
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
  const prisma = new PrismaClient();

  console.log(`Quét ${newsDir}...`);
  const files = await walk(newsDir);
  console.log(`Có ${files.length} file.`);

  const mapping: { oldUrl: string; newUrl: string }[] = [];
  for (const abs of files) {
    const rel = abs.substring(root.length + 1).split(/[\\/]/).join('/'); // news/YYYY/MM/UUID.ext
    const ext = extname(abs).toLowerCase();
    const contentType = MIME[ext];
    if (!contentType) {
      console.warn(`Bỏ qua ${rel}: không nhận mime ${ext}`);
      continue;
    }
    const body = await readFile(abs);
    const st = await stat(abs);
    process.stdout.write(`  → ${rel} (${st.size} bytes)... `);
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: rel, Body: body, ContentType: contentType, ACL: 'public-read',
    }));
    console.log('OK');
    mapping.push({
      oldUrl: `/api/news/images/${rel.replace(/^news\//, '')}`,
      newUrl: `${publicBase}/${rel}`,
    });
  }

  if (mapping.length === 0) {
    console.log('Không có ảnh nào để chuyển. Xong.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Cập nhật ${mapping.length} URL trong DB...`);
  const articles = await prisma.newsArticle.findMany({
    select: { id: true, body: true, coverImageUrl: true },
  });
  let touched = 0;
  for (const a of articles) {
    let body = a.body;
    let cover = a.coverImageUrl;
    for (const { oldUrl, newUrl } of mapping) {
      if (body.includes(oldUrl)) body = body.split(oldUrl).join(newUrl);
      if (cover === oldUrl) cover = newUrl;
    }
    if (body !== a.body || cover !== a.coverImageUrl) {
      await prisma.newsArticle.update({
        where: { id: a.id }, data: { body, coverImageUrl: cover },
      });
      touched++;
    }
  }
  console.log(`Đã cập nhật ${touched}/${articles.length} bài.`);

  console.log('\nXong. Bạn có thể xoá thư mục đĩa sau khi kiểm tra vài bài:');
  console.log(`  rm -rf ${newsDir}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
