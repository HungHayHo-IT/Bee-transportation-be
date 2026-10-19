/**
 * Điền `of1Id` cho danh mục địa điểm, lấy từ master data kho/cảng của OF1.
 *
 * `of1Id` là id trong hệ thống BÊN KIA — BeeOps không tự sinh ra được, và
 * thiếu nó thì mọi đơn nhập/xuất đều bị chặn (contract v1.3 mục 5.2).
 *
 * CHỈ XEM là mặc định. Khớp tên giữa hai danh mục không bao giờ đúng 100%, nên
 * phải nhìn bảng tổng kết trước khi cho ghi. Khớp nhầm một dòng là đơn đi tới
 * một cảng khác mà không ai thấy.
 *
 * Chạy trong container API:
 *   docker exec -w /app beeops-api node dist/scripts/dong-bo-kho-cang.js        # chỉ xem
 *   docker exec -w /app beeops-api node dist/scripts/dong-bo-kho-cang.js --ghi  # ghi thật
 *
 * Lời gọi `wh-locations` CHỈ ĐỌC: không tạo ra gì bên OF1, chạy lại bao nhiêu
 * lần cũng được.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { Of1Client } from '../modules/tms/of1.client';
import { khopKhoCang } from '../modules/tms/khop-kho-cang.helper';

async function main(): Promise<void> {
  const ghi = process.argv.includes('--ghi');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const of1 = app.get(Of1Client, { strict: false });

    const cauHinh = of1.docCauHinh('wh-locations');
    if (!cauHinh) {
      console.error('Thiếu cấu hình OF1 (OF1_TMS_URL / OF1_COMPANY_CODE / OF1_TOKEN).');
      process.exitCode = 1;
      return;
    }

    const danhSach = await of1.layKhoCang(cauHinh);
    console.log(`OF1 trả về ${danhSach.length} kho/cảng.`);

    /* Chỉ khớp địa điểm CHƯA có mã: đồng bộ lại không được ghi đè một mã ai
       đó đã sửa tay sau khi nhìn tận mắt. */
    const diaDiem = await prisma.location.findMany({
      where: { of1Id: null },
      select: { id: true, name: true, province: true },
      orderBy: { name: 'asc' },
    });
    const daCo = await prisma.location.count({ where: { of1Id: { not: null } } });
    console.log(`BeeOps: ${diaDiem.length} địa điểm chưa có mã, ${daCo} đã có (giữ nguyên).\n`);

    const kq = khopKhoCang(diaDiem, danhSach);
    console.log(`khớp chắc chắn : ${kq.khop.length}`);
    console.log(`nhập nhằng     : ${kq.nhapNhang.length}  (để người chọn)`);
    console.log(`không thấy     : ${kq.khongThay.length}`);

    if (kq.nhapNhang.length > 0) {
      console.log('\n--- nhập nhằng ---');
      for (const x of kq.nhapNhang.slice(0, 30))
        console.log(`  #${x.diaDiemId} ${x.ten}  →  ${x.ungVien.join('  |  ')}`);
      if (kq.nhapNhang.length > 30) console.log(`  … còn ${kq.nhapNhang.length - 30} dòng`);
    }
    if (kq.khongThay.length > 0) {
      console.log('\n--- không thấy (30 dòng đầu) ---');
      for (const x of kq.khongThay.slice(0, 30)) console.log(`  #${x.diaDiemId} ${x.ten}`);
      if (kq.khongThay.length > 30) console.log(`  … còn ${kq.khongThay.length - 30} dòng`);
    }
    if (kq.khop.length > 0) {
      console.log('\n--- khớp (30 dòng đầu) ---');
      for (const x of kq.khop.slice(0, 30))
        console.log(`  #${x.diaDiemId} ${x.ten}  →  ${x.locationId}  (${x.theo})`);
      if (kq.khop.length > 30) console.log(`  … còn ${kq.khop.length - 30} dòng`);
    }

    if (!ghi) {
      console.log('\n(chỉ xem — thêm --ghi để ghi vào danh mục)');
      return;
    }

    /* Ghi từng dòng chứ không `updateMany`: mỗi dòng một giá trị khác nhau.
       Một lỗi không được kéo đổ cả mẻ — ghi được bao nhiêu giữ bấy nhiêu. */
    let xong = 0;
    for (const x of kq.khop) {
      try {
        await prisma.location.update({ where: { id: x.diaDiemId }, data: { of1Id: x.locationId } });
        xong += 1;
      } catch (e) {
        console.error(`  lỗi #${x.diaDiemId} ${x.ten}: ${String(e).slice(0, 120)}`);
      }
    }
    console.log(`\nĐã ghi ${xong}/${kq.khop.length} mã OF1.`);
  } finally {
    await app.close();
  }
}

void main();
