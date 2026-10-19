import { BadRequestException } from '@nestjs/common';

/** draft = dang soan · active = dang ap dung · archived = da bi thay the. */
export type PriceSessionStatus = 'draft' | 'active' | 'archived';

/**
 * Vong doi mot phien gia — mot chieu, khong quay lui.
 *
 * `draft -> active`: cong bo ban dang soan.
 * `active -> archived`: phien nay da bi mot phien khac thay the.
 *
 * KHONG cho `archived -> active`. Nghe thi tien — "bat lai bang gia cu" —
 * nhung no lam bang gia quay nguoc ve mot ban cu ma khong co dau vet nao noi
 * vi sao, va moi bao gia sau do dung gia cu trong im lang. Muon dung lai gia
 * cu thi CHEP phien do ra mot phien moi: viec do de lai ngay thang, nguoi
 * lam, va mot dong trong danh sach phien.
 *
 * KHONG cho quay ve `draft`: phien da cong bo thi khach da nhin thay gia do.
 */
export function assertChuyenPhien(tu: PriceSessionStatus, den: PriceSessionStatus): void {
  if (den === 'active' && tu !== 'draft') {
    throw new BadRequestException(
      tu === 'active'
        ? 'Phiên này đang áp dụng rồi'
        : 'Phiên đã lưu trữ không bật lại được — hãy chép nó ra một phiên mới',
    );
  }
  if (den === 'archived' && tu !== 'active') {
    throw new BadRequestException('Chỉ phiên đang áp dụng mới lưu trữ được');
  }
  if (den === 'draft') {
    throw new BadRequestException('Không đưa một phiên đã công bố về lại bản nháp');
  }
}

/**
 * Doc mot o gia trong file import.
 *
 * Tra `null` khi khong doc duoc, KHONG tra 0. Mot o de trong hay go nham
 * thanh chu ('lien he', 'thoa thuan') phai lam dong do bao loi; bien no thanh
 * 0 la im lang bao khach gia khong dong.
 *
 * Dau cham va dau phay KHONG duoc coi giong nhau mot cach mu quang, vi cung
 * mot ky tu mang hai nghia tuy may xuat file:
 *
 *   '1.200.000'  -> phan cach hang nghin (Excel tieng Viet)
 *   '1,200,000'  -> phan cach hang nghin (Excel tieng Anh)
 *   '1200000.6'  -> dau thap phan
 *
 * Luat: dau nao di kem DUNG BA chu so phia sau la phan cach hang nghin, bo
 * di. Con lai mot dau di kem mot hoac hai chu so thi do la phan le — bang nay
 * tinh bang dong nen cat xuong. Doan bua ca hai kieu la sai gap nghin lan
 * trong im lang, va khong ai doi chieu tung dong cua mot file import.
 */
export function docGiaTuChuoi(tho: unknown): number | null {
  if (typeof tho === 'number') {
    return Number.isFinite(tho) && tho >= 0 ? Math.floor(tho) : null;
  }
  if (typeof tho !== 'string') return null;

  let sach = tho.replace(/\s/g, '');
  if (sach === '') return null;
  // Bo phan cach hang nghin: lap lai vi '1.200.000' co hai dau chong nhau.
  let truoc = '';
  while (truoc !== sach) {
    truoc = sach;
    sach = sach.replace(/^(\d+)[.,](\d{3})/, '$1$2');
  }
  // Phan le con lai: cat xuong.
  const le = /^(\d+)[.,]\d{1,2}$/.exec(sach);
  if (le) sach = le[1]!;

  if (!/^\d+$/.test(sach)) return null;
  const n = Number(sach);
  return Number.isFinite(n) ? n : null;
}

/**
 * Khoa mot dong gia: (diem di, diem den, DON VI TINH).
 *
 * Dung de bat dong TRUNG NGAY TRONG FILE truoc khi ghi. Rang buoc unique cua
 * DB cung bat duoc, nhung no bat sau khi da ghi mot nua so dong, va thong bao
 * loi cua Postgres khong noi duoc dong thu may trong file.
 *
 * Co DON VI TINH tu 055. Thieu no thi tam dong gia cua MOT tuyen container
 * (20'DC va 40'DC, moi loai bon bac tai) bi coi la tam ban sao cua nhau, va
 * bay gop-dong-trung giu lai dung mot dong - bay dong con lai bien mat ma
 * man import bao "da gop 7 dong trung".
 */
export function khoaTuyen(
  originId: number,
  destinationId: number,
  unitCode: string,
): string {
  return `${originId}>${destinationId}@${unitCode}`;
}

export interface DongGia {
  originId: number;
  destinationId: number;
  unitCode: string;
  price: number;
  note?: string | null;
}

/**
 * Gop nhung dong trung nhau trong mot file import.
 *
 * Lay dong CUOI chu khong phai dong dau: file nguoi ta gui len thuong co dong
 * lap vi dan hai lan hoac sua roi dan lai ca khoi, va ban sua sau cung moi la
 * y dinh that. Tra kem so lan gop de man import noi ra, thay vi lang le bo di
 * mot nua so dong ma nguoi gui tuong da vao het.
 */
export function gopDongTrung<T extends DongGia>(ds: T[]): { ra: T[]; soTrung: number } {
  const theoKhoa = new Map<string, T>();
  let soTrung = 0;
  for (const d of ds) {
    const k = khoaTuyen(d.originId, d.destinationId, d.unitCode);
    if (theoKhoa.has(k)) soTrung += 1;
    theoKhoa.set(k, d);
  }
  return { ra: [...theoKhoa.values()], soTrung };
}
