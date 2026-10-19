import { MucQuyen } from './pages';
import { mucCaoNhat, phuongThucGhi, quyetDinh } from './permission-matrix.helper';

describe('gop muc quyen cua nhieu vai tro', () => {
  /**
   * Mot nguoi co the mang nhieu vai tro. Lay muc CAO NHAT chu khong thap nhat:
   * mot truong phong kiem pricing ma bi tut ve muc thap hon cua mot trong hai
   * vai thi kiem nhiem tro thanh hinh phat, va khong ai hieu vi sao.
   */
  it('lay muc cao nhat trong cac vai tro', () => {
    const bang = new Map([
      ['manager:orders', MucQuyen.XEM],
      ['staff:orders', MucQuyen.DAY_DU],
    ]);
    expect(mucCaoNhat(bang, ['manager', 'staff'], 'orders')).toBe(MucQuyen.DAY_DU);
  });

  /** Khong vai tro nao co dong nao -> khong co quyen. Mac dinh la DONG. */
  it('khong khai gi thi khong co quyen', () => {
    expect(mucCaoNhat(new Map(), ['sale'], 'orders')).toBe(MucQuyen.KHONG);
  });

  it('nguoi khong co vai tro nao thi khong co quyen', () => {
    const bang = new Map([['admin:orders', MucQuyen.DAY_DU]]);
    expect(mucCaoNhat(bang, [], 'orders')).toBe(MucQuyen.KHONG);
  });
});

describe('phuong thuc nao la GHI', () => {
  it('GET va HEAD la doc', () => {
    expect(phuongThucGhi('GET')).toBe(false);
    expect(phuongThucGhi('HEAD')).toBe(false);
    expect(phuongThucGhi('OPTIONS')).toBe(false);
  });

  /**
   * Moi thu con lai la GHI, ke ca phuong thuc la: cach hong an toan la coi
   * nhu ghi va doi muc day du, chu khong phai cho qua.
   */
  it('POST, PATCH, PUT, DELETE va phuong thuc la deu la ghi', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE', 'TRACE']) {
      expect(phuongThucGhi(m)).toBe(true);
    }
  });
});

describe('quyet dinh cho qua hay chan', () => {
  it('khong co quyen thi chan ca doc lan ghi', () => {
    expect(quyetDinh(MucQuyen.KHONG, 'GET')).toBe(false);
    expect(quyetDinh(MucQuyen.KHONG, 'POST')).toBe(false);
  });

  /** Chi xem: doc thi duoc, ghi thi khong. Day la toan bo y nghia cua muc nay. */
  it('chi xem thi doc duoc, ghi thi khong', () => {
    expect(quyetDinh(MucQuyen.XEM, 'GET')).toBe(true);
    expect(quyetDinh(MucQuyen.XEM, 'POST')).toBe(false);
    expect(quyetDinh(MucQuyen.XEM, 'DELETE')).toBe(false);
  });

  /**
   * Bac giua: xem, tao va sua deu duoc, chi XOA la khong.
   *
   * Tao va sua la MOT bac chu khong phai hai: sua duoc mot ban ghi ma khong
   * tao duoc no, hay nguoc lai, la mot cau hinh khong ai dung toi that. Tach
   * doi ra chi de duoc bon chu trong o chon la dung hai o khac nhau ma hanh vi
   * giong het — o lua.
   */
  it('tao va sua thi doc ghi duoc, rieng xoa thi khong', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH']) {
      expect(quyetDinh(MucQuyen.SUA, m)).toBe(true);
    }
    expect(quyetDinh(MucQuyen.SUA, 'DELETE')).toBe(false);
  });

  /** Phuong thuc la van chan o bac nay: cach hong an toan la doi muc cao nhat. */
  it('tao va sua thi chan phuong thuc la', () => {
    expect(quyetDinh(MucQuyen.SUA, 'TRACE')).toBe(false);
  });

  it('toan quyen thi lam gi cung duoc', () => {
    expect(quyetDinh(MucQuyen.DAY_DU, 'GET')).toBe(true);
    expect(quyetDinh(MucQuyen.DAY_DU, 'DELETE')).toBe(true);
  });
});

/**
 * Bon bac xep tu thap len cao: khong < chi xem < tao/sua < toan quyen. Thu tu
 * nay la thu duy nhat quyet dinh nguoi kiem nhiem duoc gi, nen no co test
 * rieng chu khong chi duoc suy ra tu cac test tren.
 */
describe('thu hang bon bac', () => {
  it('gop hai vai tro thi bac cao hon thang', () => {
    const bang = new Map([
      ['sale:orders', MucQuyen.SUA],
      ['staff:orders', MucQuyen.XEM],
    ]);
    expect(mucCaoNhat(bang, ['sale', 'staff'], 'orders')).toBe(MucQuyen.SUA);
  });

  it('toan quyen cao hon tao/sua', () => {
    const bang = new Map([
      ['sale:orders', MucQuyen.SUA],
      ['manager:orders', MucQuyen.DAY_DU],
    ]);
    expect(mucCaoNhat(bang, ['sale', 'manager'], 'orders')).toBe(MucQuyen.DAY_DU);
  });
});

/**
 * Bay da giam mot lan: `@Trang('')` la khai MOT trang ten rong, khac han
 * `@Trang()` la KHONG trang nao. Cai dau tra ra "khong co quyen" va chan dung
 * endpoint ma menu dua vao de biet hien gi.
 */
describe('trang rong khong phai la khong co trang', () => {
  it('trang ten rong tra ve khong co quyen', () => {
    const bang = new Map([['admin:orders', MucQuyen.DAY_DU]]);
    expect(mucCaoNhat(bang, ['admin'], '')).toBe(MucQuyen.KHONG);
  });
});
