import {
  SO_NGAY_SONG, TrangThaiKy, bamToken, duocKy, hetHanLuc, sinhToken, vanConHieuLuc,
} from './chu-ky.helper';

describe('ma mot lan', () => {
  /**
   * Ma phai du dai de khong do duoc bang may. 32 byte ngau nhien in ra hex la
   * 64 ky tu — khong gian do lon hon moi so lan gui ky cong lai nhieu bac.
   */
  it('du dai va moi lan mot khac', () => {
    const a = sinhToken();
    const b = sinhToken();
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a).not.toBe(b);
  });

  /**
   * Luu dang bam, khong luu ma goc: ai doc duoc co so du lieu cung khong ky
   * thay khach duoc — cung mot ly do voi mat khau.
   */
  it('bam ra chuoi co dinh, cung ma thi cung ket qua', () => {
    const t = sinhToken();
    expect(bamToken(t)).toBe(bamToken(t));
    expect(bamToken(t)).not.toBe(t);
    expect(bamToken(t)).toHaveLength(64);
  });

  it('hai ma khac nhau thi bam khac nhau', () => {
    expect(bamToken(sinhToken())).not.toBe(bamToken(sinhToken()));
  });
});

describe('han song cua link ky', () => {
  it('bay ngay ke tu luc gui', () => {
    const luc = new Date('2026-10-01T09:00:00.000Z');
    expect(hetHanLuc(luc).toISOString()).toBe('2026-10-08T09:00:00.000Z');
    expect(SO_NGAY_SONG).toBe(7);
  });

  it('chua toi han thi con hieu luc', () => {
    const han = new Date('2026-10-08T09:00:00.000Z');
    expect(vanConHieuLuc(han, new Date('2026-10-07T23:59:59.000Z'))).toBe(true);
  });

  /** Dung thoi diem het han la het: khong co phut an hue nao ca. */
  it('qua han thi het hieu luc', () => {
    const han = new Date('2026-10-08T09:00:00.000Z');
    expect(vanConHieuLuc(han, han)).toBe(false);
    expect(vanConHieuLuc(han, new Date('2026-10-08T09:00:01.000Z'))).toBe(false);
  });
});

describe('khi nao ky duoc', () => {
  const han = new Date('2026-10-08T09:00:00.000Z');
  const bayGio = new Date('2026-10-02T09:00:00.000Z');

  it('dang cho ky va con han thi ky duoc', () => {
    expect(duocKy(TrangThaiKy.CHO_KY, han, bayGio)).toEqual({ duoc: true });
  });

  /**
   * Ky hai lan la hai ban ghi mau thuan nhau tren cung mot don, va khong ai
   * biet ban nao that. Chan o day chu khong de den luc ghi.
   */
  it('da ky roi thi khong ky lai', () => {
    expect(duocKy(TrangThaiKy.DA_KY, han, bayGio))
      .toEqual({ duoc: false, vi: 'Phiếu này đã được ký rồi' });
  });

  it('da tu choi thi khong ky nua', () => {
    expect(duocKy(TrangThaiKy.TU_CHOI, han, bayGio))
      .toEqual({ duoc: false, vi: 'Phiếu này đã bị từ chối' });
  });

  it('da het han thi khong ky', () => {
    expect(duocKy(TrangThaiKy.HET_HAN, han, bayGio))
      .toEqual({ duoc: false, vi: 'Đường dẫn ký đã hết hạn' });
  });

  /**
   * Trang thai van la 'cho_ky' nhung dong ho da qua han: tra dung cau het han
   * chu khong phai mot loi chung chung. Nguoi dung can biet phai xin link moi.
   */
  it('con cho ky nhung qua han thi bao het han', () => {
    const muon = new Date('2026-10-09T00:00:00.000Z');
    expect(duocKy(TrangThaiKy.CHO_KY, han, muon))
      .toEqual({ duoc: false, vi: 'Đường dẫn ký đã hết hạn' });
  });
});
