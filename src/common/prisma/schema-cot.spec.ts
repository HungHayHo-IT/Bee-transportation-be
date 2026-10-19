import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Moi truong viet hoa lac trong schema.prisma phai co `@map`.
 *
 * CSDL nay dat ten cot bang snake_case, con Prisma dat ten truong bang
 * camelCase — nen mot truong `serviceChildId` khong co `@map` se sinh ra cau
 * SQL hoi cot "serviceChildId", mot cot khong ton tai. Prisma KHONG bao gi
 * luc validate: `prisma validate` chi doc schema, no khong biet CSDL that co
 * cot nao.
 *
 * Da nga mot lan tren production: migration 065 bo cot service_child_id, toi
 * xoa truong do khoi model — roi `prisma format` TU THEM LAI mot quan he
 * `serviceChildId Int?` (vi model ServiceChild van con quan he nguoc). Client
 * sinh ra tu schema do hoi mot cot da bi xoa, va man "Khu vuc & tuyen" tra
 * "Loi he thong" cho moi khu vuc.
 *
 * Bai test nay doc thang schema.prisma vi do la thu `prisma format` sua, va no
 * chay trong moi lan `npm test` — truoc khi kip dong goi len may chu.
 */
/** Kieu co ban cua Prisma — moi thu khac la mot model, tuc la quan he. */
const KIEU_CO_BAN = new Set([
  'Int', 'BigInt', 'Float', 'Decimal', 'String', 'Boolean', 'DateTime', 'Json', 'Bytes',
]);

describe('schema.prisma — truong camelCase phai co @map', () => {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

  it('khong truong nao thieu @map', () => {
    const thieu: string[] = [];
    let model = '';
    for (const raw of schema.split('\n')) {
      const dong = raw.trim();
      const batDau = /^model\s+(\w+)\s*\{/.exec(dong);
      if (batDau) { model = batDau[1]!; continue; }
      if (dong === '}') { model = ''; continue; }
      if (model === '' || dong.startsWith('//') || dong.startsWith('///')) continue;
      if (dong.startsWith('@@')) continue;

      const truong = /^(\w+)\s+(\w+)(\[\])?\??/.exec(dong);
      if (!truong) continue;
      const [, ten, kieu] = truong;
      /* CHI xet kieu co ban. Quan he (kieu la mot model khac) khong phai la
         cot nen khong can @map — nhung khong duoc nhan dang no bang "viet
         hoa": Int, String, DateTime deu viet hoa, va ban dau toi loc nham
         kieu do nen bai test im lang di qua dung cai loi no sinh ra de bat. */
      if (!KIEU_CO_BAN.has(kieu!)) continue;
      if (!/[A-Z]/.test(ten!)) continue;
      if (dong.includes('@map(')) continue;
      thieu.push(`${model}.${ten}`);
    }
    expect(thieu).toEqual([]);
  });
});
