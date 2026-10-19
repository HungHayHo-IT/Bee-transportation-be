import { ALL_ROLES } from '../enums';
import {
  KHOA_TRANG, MAC_DINH, MUC_QUYEN_HOP_LE, MucQuyen, TRANG_PHAN_QUYEN,
} from './pages';

/**
 * Bang mac dinh la BAN SAO THU HAI cua seed trong migration 032 — no ton tai de
 * nut "Dat lai mac dinh" co cho quay ve. Hai noi lech nhau thi bam nut do keo
 * ca cong ty ve mot bo quyen khong ai chon, va khong co gi bao. Mấy test duoi
 * day khoa nhung dieu kiem duoc ma khong phai doc lai file SQL.
 */
describe('bang quyen mac dinh', () => {
  it('phu du moi trang khai trong TRANG_QUYEN', () => {
    expect(Object.keys(MAC_DINH).sort()).toEqual([...KHOA_TRANG].sort());
  });

  it('moi trang co du nam vai tro', () => {
    for (const [trang, m] of Object.entries(MAC_DINH)) {
      expect({ trang, roles: Object.keys(m).sort() })
        .toEqual({ trang, roles: [...ALL_ROLES].sort() });
    }
  });

  it('moi muc deu hop le', () => {
    for (const [trang, m] of Object.entries(MAC_DINH)) {
      for (const [role, level] of Object.entries(m)) {
        expect({ trang, role, hopLe: MUC_QUYEN_HOP_LE.includes(level) })
          .toEqual({ trang, role, hopLe: true });
      }
    }
  });

  /**
   * Quan tri vien khong duoc mat quyen tren chinh man phan quyen, ke ca trong
   * ban mac dinh: bam "Dat lai mac dinh" ma khoa luon duong mo lai quyen thi
   * duong sua con lai la vao thang co so du lieu.
   */
  it('mac dinh khong bao gio khoa quan tri vien khoi man phan quyen', () => {
    expect(MAC_DINH[TRANG_PHAN_QUYEN]?.admin).toBe<MucQuyen>('full');
  });
});
