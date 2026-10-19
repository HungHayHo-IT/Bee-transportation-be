import { chonGiaNiemYet, type DongNiemYet } from './lookup.helper';

const dong = (o: number | null, d: number | null, s: number, gia: number): DongNiemYet =>
  ({ originId: o, destinationId: d, serviceId: s, price: gia });

describe('chon gia niem yet cho mot don', () => {
  /**
   * Khop DUNG cap dia diem la cau tra loi tot nhat, va no phai thang moi cau
   * tra loi khac. Kho DN -> Kho Tam Ky co gia rieng chinh vi hai kho do khac
   * nhau; roi ve gia theo tinh la vut di dung cai ly do nguoi ta khai kho.
   */
  it('uu tien dung cap dia diem', () => {
    const ds = [dong(1, 2, 7, 1500000), dong(null, null, 7, 900000)];
    expect(chonGiaNiemYet(ds, { originId: 1, destinationId: 2, serviceId: 7 })?.price)
      .toBe(1500000);
  });

  /** Dung dich vu moi tinh. Cung tuyen nhung dich vu khac la mot gia khac. */
  it('khong lay gia cua dich vu khac', () => {
    const ds = [dong(1, 2, 7, 1500000)];
    expect(chonGiaNiemYet(ds, { originId: 1, destinationId: 2, serviceId: 9 })).toBeNull();
  });

  /**
   * Chieu di va chieu ve la HAI tuyen. Lay gia chieu nguoc lai nghe nhu tien —
   * nhung cuoc mot chieu thuong lech nhau that (xe chay rong mot chieu), va
   * doan ho la bao khach mot con so khong ai duyet.
   */
  it('khong lay gia cua chieu nguoc lai', () => {
    const ds = [dong(2, 1, 7, 1500000)];
    expect(chonGiaNiemYet(ds, { originId: 1, destinationId: 2, serviceId: 7 })).toBeNull();
  });

  /** Don chua khai dia diem thi khong co gi de tra — tra null, khong doan. */
  it('don chua khai dia diem thi khong co gia', () => {
    const ds = [dong(1, 2, 7, 1500000)];
    expect(chonGiaNiemYet(ds, { originId: null, destinationId: 2, serviceId: 7 })).toBeNull();
    expect(chonGiaNiemYet(ds, { originId: 1, destinationId: null, serviceId: 7 })).toBeNull();
  });

  it('bang gia rong thi khong co gia', () => {
    expect(chonGiaNiemYet([], { originId: 1, destinationId: 2, serviceId: 7 })).toBeNull();
  });
});
