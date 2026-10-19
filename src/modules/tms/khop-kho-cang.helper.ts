import { normalizeProvince } from '@/common/reference/provinces';
import type { KhoCangOf1 } from './of1.client';

/**
 * Khớp địa điểm của BeeOps với master data kho/cảng của OF1.
 *
 * Hàm THUẦN, không chạm CSDL: đây là chỗ dễ sai nhất của cả vòng đồng bộ —
 * khớp nhầm một dòng là đơn đi tới một cảng khác mà không ai thấy — nên nó
 * phải test được mà không cần dựng máy chủ giả.
 *
 * Luật: chỉ nhận khi có ĐÚNG MỘT ứng viên. Hai cái cùng khớp thì để người
 * nhìn, vì đoán giữa hai cảng là đoán một con số sẽ đi thẳng vào đơn thật.
 */

/** Bỏ dấu, bỏ mọi thứ không phải chữ/số. Giống `fold` của danh mục tỉnh. */
export function khoa(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Những chữ chung chung bị bỏ trước khi so.
 *
 * "CẢNG ĐÀ NẴNG" và "Da Nang Port" là một chỗ; "KCN Đình Vũ" và "Dinh Vu
 * Industrial Zone" cũng vậy. Không bỏ thì không cái nào khớp cái nào, và cả
 * 791 dòng rơi hết vào diện làm tay.
 */
const TU_CHUNG = [
  'cang', 'port', 'kcn', 'khucongnghiep', 'industrialzone', 'industrialpark',
  'kho', 'warehouse', 'depot', 'icd', 'sanbay', 'airport', 'cuakhau', 'borderga',
  'tp', 'thanhpho', 'city', 'tinh', 'province',
];

export function khoaGon(s: string | null | undefined): string {
  let k = khoa(s);
  for (const t of TU_CHUNG) k = k.split(t).join('');
  return k;
}

export interface DiaDiemCanKhop {
  id: number;
  name: string;
  province: string | null;
}

export interface KetQuaKhop {
  /** Khớp chắc chắn — đúng một ứng viên. */
  khop: { diaDiemId: number; locationId: number; ten: string; theo: string }[];
  /** Nhiều ứng viên cùng khớp — để người chọn, KHÔNG đoán. */
  nhapNhang: { diaDiemId: number; ten: string; ungVien: string[] }[];
  /** Không ứng viên nào. */
  khongThay: { diaDiemId: number; ten: string }[];
}

/**
 * @param boQuaDaCo Bỏ qua địa điểm đã có `of1Id` — đồng bộ lại không được ghi
 * đè một mã ai đó đã sửa tay.
 */
export function khopKhoCang(
  diaDiem: readonly DiaDiemCanKhop[],
  of1: readonly KhoCangOf1[],
): KetQuaKhop {
  const ra: KetQuaKhop = { khop: [], nhapNhang: [], khongThay: [] };

  /* Một kho/cảng của OF1 có tới bốn cách gọi (code, shortLabel, label, và
     label đã gọn). Dựng chỉ mục theo TẤT CẢ để tên bên ta trúng cái nào cũng
     được — nhưng vẫn đếm theo locationId, nên trúng hai kiểu của cùng một
     cảng không bị coi là nhập nhằng. */
  const chiMuc = new Map<string, Map<number, KhoCangOf1>>();
  const ghi = (k: string, x: KhoCangOf1): void => {
    if (k === '') return;
    const m = chiMuc.get(k) ?? new Map<number, KhoCangOf1>();
    m.set(x.locationId, x);
    chiMuc.set(k, m);
  };
  for (const x of of1) {
    ghi(khoa(x.code), x);
    ghi(khoa(x.shortLabel), x);
    ghi(khoa(x.label), x);
    ghi(khoaGon(x.label), x);
    ghi(khoaGon(x.shortLabel), x);
  }

  for (const d of diaDiem) {
    const tinh = normalizeProvince(d.province ?? undefined) ?? null;
    const ungVien = new Map<number, KhoCangOf1>();
    let theo = '';
    /* Luat CHAT truoc, va DUNG LAI ngay khi no trung.
       Gop ca hai vao mot ro thi luat long lam loang luat chat: "CANG DA NANG"
       khop dung mot dong theo ten day du (53006), nhung ten rut gon bo chu
       "cang" con "danang" — trung them "Kho Da Nang" va "San Bay Da Nang".
       Ba ung vien thi ham tu choi doan, va mot khop chac chan bi vut di. */
    for (const [k, nhan] of [[khoa(d.name), 'tên'], [khoaGon(d.name), 'tên rút gọn']] as const) {
      const m = chiMuc.get(k);
      if (!m) continue;
      for (const [id, x] of m) ungVien.set(id, x);
      theo = nhan;
      break;
    }

    /* Nhiều ứng viên thì thử lọc thêm bằng TỈNH: hai cảng trùng tên ở hai
       tỉnh là chuyện thường, mà tỉnh thì ta biết chắc. */
    if (ungVien.size > 1 && tinh !== null) {
      const theoTinh = [...ungVien.values()].filter(
        (x) => normalizeProvince(x.stateLabel ?? undefined) === tinh,
      );
      if (theoTinh.length === 1) {
        ra.khop.push({
          diaDiemId: d.id, locationId: theoTinh[0]!.locationId, ten: d.name,
          theo: `${theo} + tỉnh`,
        });
        continue;
      }
    }

    if (ungVien.size === 1) {
      ra.khop.push({
        diaDiemId: d.id, locationId: [...ungVien.values()][0]!.locationId, ten: d.name, theo,
      });
    } else if (ungVien.size > 1) {
      ra.nhapNhang.push({
        diaDiemId: d.id,
        ten: d.name,
        ungVien: [...ungVien.values()].map(
          (x) => `${x.locationId} · ${x.label ?? x.shortLabel ?? x.code ?? ''}`,
        ),
      });
    } else {
      ra.khongThay.push({ diaDiemId: d.id, ten: d.name });
    }
  }
  return ra;
}
