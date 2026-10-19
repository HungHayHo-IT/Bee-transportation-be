const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
/** Tên các nhóm ba chữ số, từ phải sang trái. */
const NHOM = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

/**
 * Đọc một nhóm ba chữ số.
 *
 * `daySo` phân biệt nhóm ĐẦU với các nhóm sau: 1.005 đọc là "một nghìn không
 * trăm linh năm" — nhóm sau phải giữ "không trăm" để người nghe không hiểu
 * nhầm thành 1.5 — còn nhóm đầu thì bỏ, vì "không trăm linh năm nghìn" là thừa.
 */
function docNhom(n: number, dayDu: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donVi = n % 10;
  const ra: string[] = [];

  if (tram > 0 || dayDu) ra.push(CHU_SO[tram], 'trăm');

  if (chuc === 0) {
    // "linh" chỉ xuất hiện khi còn hàng đơn vị và phía trước đã có chữ.
    if (donVi > 0 && ra.length > 0) ra.push('linh', CHU_SO[donVi]);
    else if (donVi > 0) ra.push(CHU_SO[donVi]);
  } else if (chuc === 1) {
    ra.push('mười');
    // 15 là "mười lăm", không phải "mười năm" — "năm" ở đó nghe ra đơn vị thời gian.
    if (donVi === 5) ra.push('lăm');
    else if (donVi > 0) ra.push(CHU_SO[donVi]);
  } else {
    ra.push(CHU_SO[chuc], 'mươi');
    // Sau "mươi": 1 thành "mốt", 4 thành "tư", 5 thành "lăm".
    if (donVi === 1) ra.push('mốt');
    else if (donVi === 4) ra.push('tư');
    else if (donVi === 5) ra.push('lăm');
    else if (donVi > 0) ra.push(CHU_SO[donVi]);
  }

  return ra.join(' ');
}

/**
 * Số tiền bằng chữ, để in lên hợp đồng.
 *
 * Hợp đồng ghi tiền hai lần — bằng số và bằng chữ — vì một con số in mờ hay bị
 * thêm một chữ số thì dòng chữ là thứ phân xử. Nên hàm này KHÔNG được đoán:
 * số âm hay không phải số thì trả chuỗi rỗng để nơi gọi bỏ hẳn dòng "bằng chữ",
 * còn hơn in ra một cách đọc sai nằm cạnh con số đúng.
 */
export function docSoTien(soTien: number): string {
  if (!Number.isFinite(soTien) || soTien < 0) return '';

  const n = Math.round(soTien);
  if (n === 0) return 'Không đồng';

  // Cắt thành các nhóm ba chữ số, nhóm nhỏ nhất đứng đầu mảng.
  const nhom: number[] = [];
  for (let con = n; con > 0; con = Math.floor(con / 1000)) nhom.push(con % 1000);
  if (nhom.length > NHOM.length) return '';

  const phan: string[] = [];
  for (let i = nhom.length - 1; i >= 0; i--) {
    // Nhóm rỗng ở giữa thì bỏ qua cả tên nhóm: 1.000.000 là "một triệu",
    // không phải "một triệu không nghìn".
    if (nhom[i] === 0) continue;
    phan.push(docNhom(nhom[i], i < nhom.length - 1), NHOM[i]);
  }

  const chu = phan.join(' ').replace(/\s+/g, ' ').trim();
  return chu.charAt(0).toUpperCase() + chu.slice(1) + ' đồng';
}
