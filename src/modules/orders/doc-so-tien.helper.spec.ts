import { docSoTien } from './doc-so-tien.helper';

describe('docSoTien', () => {
  it('đọc số nhỏ', () => {
    expect(docSoTien(0)).toBe('Không đồng');
    expect(docSoTien(1)).toBe('Một đồng');
    expect(docSoTien(10)).toBe('Mười đồng');
  });

  /* Tiếng Việt đổi cách đọc theo vị trí chứ không ghép máy móc: 5 ở hàng đơn vị
     sau "mươi" đọc là "lăm", 1 sau "mươi" đọc là "mốt", 4 sau "mươi" đọc là
     "tư". Đọc sai mấy chỗ này thì cả tờ hợp đồng trông như máy sinh. */
  it('đọc đúng lăm, mốt, tư', () => {
    expect(docSoTien(15)).toBe('Mười lăm đồng');
    expect(docSoTien(21)).toBe('Hai mươi mốt đồng');
    expect(docSoTien(24)).toBe('Hai mươi tư đồng');
    expect(docSoTien(25)).toBe('Hai mươi lăm đồng');
  });

  it('đọc "linh" khi hàng chục trống', () => {
    expect(docSoTien(105)).toBe('Một trăm linh năm đồng');
    expect(docSoTien(101)).toBe('Một trăm linh một đồng');
  });

  it('đọc "không trăm" ở nhóm giữa, bỏ ở nhóm đầu', () => {
    expect(docSoTien(1000)).toBe('Một nghìn đồng');
    expect(docSoTien(1005)).toBe('Một nghìn không trăm linh năm đồng');
  });

  it('đọc số tiền thật của đơn hàng', () => {
    expect(docSoTien(32_000_000)).toBe('Ba mươi hai triệu đồng');
    expect(docSoTien(45_000_000)).toBe('Bốn mươi lăm triệu đồng');
    expect(docSoTien(1_234_567_890)).toBe(
      'Một tỷ hai trăm ba mươi tư triệu năm trăm sáu mươi bảy nghìn tám trăm chín mươi đồng',
    );
  });

  /* Số lẻ đồng không xuất hiện trong giá cước, nhưng nếu lọt vào thì làm tròn
     còn hơn in ra một chuỗi sai — tờ giấy này là hợp đồng. */
  it('làm tròn phần lẻ', () => {
    expect(docSoTien(1000.4)).toBe('Một nghìn đồng');
    expect(docSoTien(1000.6)).toBe('Một nghìn không trăm linh một đồng');
  });

  it('số âm hoặc không đọc được thì trả chuỗi rỗng, không bịa', () => {
    expect(docSoTien(-5)).toBe('');
    expect(docSoTien(Number.NaN)).toBe('');
  });
});
