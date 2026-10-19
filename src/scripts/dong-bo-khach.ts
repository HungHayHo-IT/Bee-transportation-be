/**
 * Đồng bộ hồ sơ khách sang OF1-TMS qua `of1/CUSTOMER`.
 *
 * Đơn gửi `customerCode` chưa đồng bộ sẽ bị OF1 từ chối 400 — đây là thứ đang
 * chặn nhiều đơn nhất.
 *
 * CHỈ XEM là mặc định, và cố ý: lời gọi này GHI THẬT vào hệ thống bên kia, mà
 * contract v1.3 nói rõ "chưa hỗ trợ xoá qua API". Đẩy nhầm thì phải nhờ Bee
 * sửa tay.
 *
 * Upsert theo `customerCode` nên chạy lại an toàn: cùng mã là cập nhật, không
 * sinh bản ghi trùng. Mất phản hồi giữa chừng thì cứ chạy lại.
 *
 *   node dist/scripts/dong-bo-khach.js             # chỉ xem, in bảng tổng kết
 *   node dist/scripts/dong-bo-khach.js --ghi --so 2  # đẩy thật 2 khách đầu
 *   node dist/scripts/dong-bo-khach.js --ghi         # đẩy thật tất cả
 *   node dist/scripts/dong-bo-khach.js --ghi --ma CL000123   # đúng một khách
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { Of1Client } from '../modules/tms/of1.client';
import {
  dungPayloadCustomer, thieuGiDeDongBo, type KhachDeDay,
} from '../modules/tms/customer-payload.helper';

function thamSo(ten: string): string | undefined {
  const i = process.argv.indexOf(ten);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const ghi = process.argv.includes('--ghi');
  const gioiHan = Number(thamSo('--so') ?? '0');
  const chiMa = thamSo('--ma');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const of1 = app.get(Of1Client, { strict: false });

    const cauHinh = of1.docCauHinh('CUSTOMER');
    if (!cauHinh) {
      console.error('Thiếu cấu hình OF1 (OF1_TMS_URL / OF1_COMPANY_CODE / OF1_TOKEN).');
      process.exitCode = 1;
      return;
    }

    const tatCa: KhachDeDay[] = await prisma.customer.findMany({
      ...(chiMa === undefined ? {} : { where: { code: chiMa } }),
      select: {
        code: true, companyName: true, contactName: true, email: true,
        taxCode: true, note: true, status: true,
        // Danh muc dia chi (070) — lon dan theo tung don duoc tao.
        addresses: {
          select: { code: true, address: true, contact: true, type: true, isActive: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });

    const daySan: KhachDeDay[] = [];
    const boQua: { ten: string; vi: string }[] = [];
    for (const k of tatCa) {
      const thieu = thieuGiDeDongBo(k);
      if (thieu.length === 0) daySan.push(k);
      else {
        boQua.push({
          ten: k.code ?? k.companyName ?? k.contactName ?? '(không tên)',
          vi: thieu.map((t) => t.nhan).join(', '),
        });
      }
    }

    console.log(`khách trong danh mục : ${tatCa.length}`);
    console.log(`đồng bộ được         : ${daySan.length}`);
    console.log(`bỏ qua               : ${boQua.length}`);
    if (boQua.length > 0) {
      console.log('\n--- bỏ qua (20 dòng đầu) ---');
      for (const x of boQua.slice(0, 20)) console.log(`  ${x.ten}: ${x.vi}`);
      if (boQua.length > 20) console.log(`  … còn ${boQua.length - 20} dòng`);
    }

    const canDay = gioiHan > 0 ? daySan.slice(0, gioiHan) : daySan;
    if (!ghi) {
      console.log('\n--- payload mẫu (3 khách đầu) ---');
      for (const k of canDay.slice(0, 3)) console.log(`  ${JSON.stringify(dungPayloadCustomer(k))}`);
      console.log(`\n(chỉ xem — thêm --ghi để đẩy thật ${canDay.length} khách)`);
      return;
    }

    console.log(`\nĐang đẩy ${canDay.length} khách…`);
    const dem = { nhan: 0, tu_choi: 0, khong_ro: 0 };
    let soCanhBao = 0;
    for (const k of canDay) {
      const kq = await of1.dayKhach(dungPayloadCustomer(k), cauHinh);
      dem[kq.ketQua] += 1;
      if (kq.ketQua !== 'nhan') console.log(`  ${k.code}: ${kq.ketQua} — ${kq.loi ?? ''}`);
      /* In cảnh báo NGAY CẢ KHI nhận: 'S' kèm cảnh báo nghĩa là hồ sơ vào được
         nhưng một phần bị bỏ — thường là địa chỉ không định vị nổi, và đơn
         tham chiếu vào mã địa chỉ đó sau này sẽ bị từ chối. */
      for (const c of kq.canhBao) {
        soCanhBao += 1;
        console.log(`  ${k.code}: ⚠ ${c}`);
      }
    }
    console.log(`\nnhận ${dem.nhan} · từ chối ${dem.tu_choi} · không rõ ${dem.khong_ro}`
      + ` · cảnh báo ${soCanhBao}`);
    if (dem.khong_ro > 0)
      console.log('Không rõ = chưa biết đã vào hay chưa. Upsert nên chạy lại được.');
  } finally {
    await app.close();
  }
}

void main();
