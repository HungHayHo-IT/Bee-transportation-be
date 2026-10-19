import { missingOrderInfo, OrderInfoInput } from './order-completeness.helper';

/**
 * Định nghĩa "đơn đã đủ thông tin chưa" phải nằm ở ĐÚNG MỘT chỗ. Admin có bản
 * kiểm riêng để làm mờ nút Lưu, nhưng nếu nó cũng là nơi ĐỊNH NGHĨA luật thì hai
 * bản sẽ lệch nhau sau vài tháng và không ai biết bên nào đúng.
 */
const full = (): OrderInfoInput => ({
  customerName: 'Công ty A',
  phone: '0900000000',
  serviceId: 3,
  originProvince: 'Hà Nội',
  destinationProvince: 'Lào Cai',
  serviceData: { rent_from: '2026-01-01' },
  requiredFields: [{ fieldKey: 'rent_from', label: 'Thuê từ ngày' }],
});

describe('missingOrderInfo — đơn đã đủ để chạy tiếp chưa', () => {
  it('đủ hết thì trả mảng rỗng', () => {
    expect(missingOrderInfo(full())).toEqual([]);
  });

  it.each([
    ['customerName', 'Tên khách hàng'],
    ['phone', 'Số điện thoại'],
    ['originProvince', 'Điểm đi'],
    ['destinationProvince', 'Điểm đến'],
  ])('thiếu %s thì báo "%s"', (key, label) => {
    expect(missingOrderInfo({ ...full(), [key]: null })).toEqual([label]);
  });

  it('thiếu dịch vụ thì báo "Dịch vụ"', () => {
    expect(missingOrderInfo({ ...full(), serviceId: null })).toEqual(['Dịch vụ']);
  });

  /** Chuỗi toàn khoảng trắng là "chưa nhập", không phải "đã nhập". */
  it('chuỗi rỗng và toàn khoảng trắng đều tính là thiếu', () => {
    expect(missingOrderInfo({ ...full(), originProvince: '   ' })).toEqual(['Điểm đi']);
  });

  /** Đây chính là "Thuê từ ngày"/"Loại hình tờ khai" mà form công khai bỏ qua. */
  it('thiếu trường bắt buộc riêng của dịch vụ thì báo theo nhãn của trường đó', () => {
    expect(missingOrderInfo({ ...full(), serviceData: {} })).toEqual(['Thuê từ ngày']);
  });

  it('dịch vụ không có trường bắt buộc nào thì serviceData rỗng vẫn là đủ', () => {
    expect(missingOrderInfo({ ...full(), serviceData: {}, requiredFields: [] })).toEqual([]);
  });

  /**
   * `false` và `0` là GIÁ TRỊ ĐÃ NHẬP, không phải ô trống. Admin từng loại hẳn
   * trường kiểu boolean ra khỏi bản kiểm của mình vì không phân biệt được hai
   * thứ đó — chính chỗ hai bản định nghĩa lệch nhau.
   */
  it('false và 0 trong serviceData là ĐÃ NHẬP, không tính là thiếu', () => {
    expect(missingOrderInfo({
      ...full(),
      serviceData: { insured: false, stop_count: 0 },
      requiredFields: [
        { fieldKey: 'insured', label: 'Có mua bảo hiểm' },
        { fieldKey: 'stop_count', label: 'Số điểm dừng' },
      ],
    })).toEqual([]);
  });

  it('thiếu nhiều trường thì liệt kê hết, giữ thứ tự khai báo', () => {
    expect(missingOrderInfo({
      ...full(), originProvince: null, destinationProvince: null, serviceData: {},
    })).toEqual(['Điểm đi', 'Điểm đến', 'Thuê từ ngày']);
  });
});

/**
 * Dịch vụ xuyên biên giới (CBT) có điểm đến nằm ngoài Việt Nam, nên ô
 * "Tỉnh/thành điểm đến" — vốn là danh sách tỉnh thành trong nước — bị ẩn khỏi
 * form. Nếu hàm này vẫn đòi nó thì đơn CBT từ form công khai KẸT VĨNH VIỄN ở
 * "Cần bổ sung thông tin": nhân viên không thể điền một ô không hiện ra.
 */
describe('dịch vụ không có điểm đến trong nước', () => {
  const xuyenBienGioi = (): OrderInfoInput => ({
    customerName: 'Công ty A',
    phone: '0900000000',
    serviceId: 7,
    originProvince: 'Lạng Sơn',
    destinationProvince: null,
    serviceData: {},
    requiredFields: [],
    hasDomesticDestination: false,
  });

  it('không đòi điểm đến khi dịch vụ đã tắt cờ', () => {
    expect(missingOrderInfo(xuyenBienGioi())).toEqual([]);
  });

  it('vẫn đòi điểm ĐI như thường — chỉ điểm đến được miễn', () => {
    expect(missingOrderInfo({ ...xuyenBienGioi(), originProvince: null })).toEqual(['Điểm đi']);
  });

  /** Mặc định phải là ĐÒI, để mọi dịch vụ hiện có không đổi hành vi. */
  it('không truyền cờ thì vẫn đòi điểm đến như cũ', () => {
    const khongCoCo = { ...xuyenBienGioi() };
    delete khongCoCo.hasDomesticDestination;
    expect(missingOrderInfo(khongCoCo)).toEqual(['Điểm đến']);
  });

  it('bật cờ thì đòi điểm đến', () => {
    expect(missingOrderInfo({ ...xuyenBienGioi(), hasDomesticDestination: true }))
      .toEqual(['Điểm đến']);
  });
});

/**
 * Dich vu con (08/10). Form landing chi hoi dich vu CHA, ma ca bon dich vu van
 * chuyen deu co dich vu con — truoc day create() bat buoc phai co, nen MOI yeu
 * cau tu landing nem loi va khong sinh duoc don nao. Bon yeu cau lien tiep nam
 * im o 'pending' truoc khi ai do mo man Yeu cau bao gia ra xem.
 *
 * Luat bay gio: don van tao, con thieu dich vu con thi la mot dong trong danh
 * sach "can bo sung" — vi khong co no thi don khong mang ma TMS va khong day
 * sang OF1 duoc.
 */
describe('missingOrderInfo — dich vu con', () => {
  it('dich vu co dich vu con ma don chua chon -> bao thieu', () => {
    expect(missingOrderInfo({ ...full(), coDichVuCon: true, serviceChildId: null }))
      .toEqual(['Dịch vụ con']);
  });

  it('da chon roi thi khong bao', () => {
    expect(missingOrderInfo({ ...full(), coDichVuCon: true, serviceChildId: 7 })).toEqual([]);
  });

  /**
   * Dich vu KHONG co dich vu con nao (tu van, hai quan, cho thue thiet bi) thi
   * khong duoc doi: doi la nhung don do ket vinh vien o "cho bo sung" vi khong
   * co dong nao de chon.
   */
  it('dich vu khong co dich vu con thi khong doi', () => {
    expect(missingOrderInfo({ ...full(), coDichVuCon: false, serviceChildId: null })).toEqual([]);
  });

  /**
   * Vang mat = KHONG doi. Nguoc voi hai co hasDomestic*, va co y: quen truyen
   * co nay ma mac dinh la doi thi moi don cua moi dich vu khong co dich vu con
   * deu ket lai — mot cho goi quen la hong ca he thong.
   */
  it('khong truyen co thi khong doi', () => {
    expect(missingOrderInfo({ ...full(), serviceChildId: null })).toEqual([]);
  });
});
