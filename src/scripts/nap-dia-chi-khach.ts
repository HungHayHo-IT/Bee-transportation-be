/**
 * Nạp danh mục địa chỉ khách từ dữ liệu đã có — nguồn cho `addresses[]` của
 * `of1/CUSTOMER` (contract v1.3 mục 3).
 *
 * Vì sao cần: contract nói gửi `addressCode` thì OF1 tự điền địa chỉ đầy đủ,
 * toạ độ và người liên hệ như đơn nhập tay; gửi chữ thì "đơn vẫn được nhận
 * nhưng thiếu thông tin định vị". BeeOps không lưu toạ độ ở đâu cả, nên
 * `addressCode` là cách duy nhất để OF1 biết chỗ lấy hàng nằm ở đâu trên bản
 * đồ.
 *
 * `DiaChiKhachService` vốn chỉ ghi nhớ địa chỉ MỖI KHI tạo/sửa đơn, nên danh
 * mục lớn dần theo việc thật — nhưng nó bắt đầu từ số không, và 697 khách đã
 * đồng bộ sang OF1 trước đó đều không có địa chỉ nào. Script này mồi danh mục
 * một lần từ hai nguồn có sẵn:
 *
 *   1. Dòng "Địa chỉ: ..." trong ghi chú khách — chỗ người ta đã gõ sẵn.
 *   2. Địa chỉ ĐẦU KHÁCH của những đơn đã tạo (đầu kho/cảng thì bỏ, OF1 tự
 *      biết chỗ đó).
 *
 * Dùng thẳng `ghiNho()` chứ không tự viết câu INSERT: luật chống trùng nằm ở
 * cột sinh `addr_key` của CSDL, và một bản sao của luật ấy trong script sẽ
 * lệch khỏi nó.
 *
 *   node dist/scripts/nap-dia-chi-khach.js          # chỉ xem
 *   node dist/scripts/nap-dia-chi-khach.js --ghi    # nạp thật
 *
 * Nạp xong chạy `dong-bo-khach.js --ghi` để đẩy sang OF1.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { DiaChiKhachService } from '../modules/customers/dia-chi-khach.service';
import { diaChiTuGhiChu } from '../modules/tms/customer-payload.helper';
import { dauKhoCang } from '../modules/tms/tms-payload.helper';

async function main(): Promise<void> {
  const ghi = process.argv.includes('--ghi');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const svc = app.get(DiaChiKhachService, { strict: false });

    const khach = await prisma.customer.findMany({
      select: { id: true, code: true, companyName: true, note: true },
      orderBy: { id: 'asc' },
    });
    const don = await prisma.order.findMany({
      where: { customerId: { not: null } },
      select: {
        customerId: true, originAddress: true, destinationAddress: true,
        serviceChild: { select: { tmsMode: true } },
      },
    });

    /* Gom theo khách TRƯỚC khi ghi: một khách có thể có địa chỉ ở cả ghi chú
       lẫn vài đơn, và ghi từng cái một thì mã A01/A02 nhảy theo thứ tự tình
       cờ của vòng lặp. */
    const theoKhach = new Map<number, Set<string>>();
    const them = (id: number | null, dc: string | null | undefined): void => {
      const s = (dc ?? '').replace(/\s+/g, ' ').trim();
      if (id === null || s === '') return;
      const t = theoKhach.get(id) ?? new Set<string>();
      t.add(s);
      theoKhach.set(id, t);
    };

    for (const k of khach) them(k.id, diaChiTuGhiChu(k.note));
    for (const d of don) {
      /* Đầu kho/cảng KHÔNG ghi nhớ: địa chỉ ở đó là của Bee, không phải của
         khách, và nhét vào danh mục khách là mời đơn sau trỏ nhầm. */
      const khoCang = d.serviceChild?.tmsMode ? dauKhoCang(d.serviceChild.tmsMode) : null;
      if (khoCang !== 'di') them(d.customerId, d.originAddress);
      if (khoCang !== 'den') them(d.customerId, d.destinationAddress);
    }

    const tenKhach = new Map(khach.map((k) => [k.id, k.code ?? k.companyName ?? `#${k.id}`]));
    const tong = [...theoKhach.values()].reduce((a, s) => a + s.size, 0);
    console.log(`khách có địa chỉ tìm được : ${theoKhach.size}`);
    console.log(`địa chỉ tìm được          : ${tong}`);

    if (!ghi) {
      console.log('\n--- 15 dòng đầu ---');
      let i = 0;
      for (const [id, ds] of theoKhach) {
        for (const dc of ds) {
          if (i++ >= 15) break;
          console.log(`  ${tenKhach.get(id)}: ${dc}`);
        }
        if (i >= 15) break;
      }
      console.log(`\n(chỉ xem — thêm --ghi để nạp thật ${tong} địa chỉ)`);
      return;
    }

    let moi = 0;
    let daCo = 0;
    let hong = 0;
    for (const [id, ds] of theoKhach) {
      for (const dc of ds) {
        const truoc = await prisma.customerAddress.count({ where: { customerId: id } });
        const ma = await prisma.$transaction((tx) => svc.ghiNho(tx, id, dc));
        if (ma === null) {
          hong++;
          console.log(`  lỗi ${tenKhach.get(id)}: ${dc}`);
          continue;
        }
        const sau = await prisma.customerAddress.count({ where: { customerId: id } });
        if (sau > truoc) moi++;
        else daCo++;
      }
    }
    console.log(`\nĐã nạp ${moi} địa chỉ mới, ${daCo} đã có sẵn, ${hong} lỗi.`);
    console.log('Chạy tiếp: node dist/scripts/dong-bo-khach.js --ghi');
  } finally {
    await app.close();
  }
}

void main();
