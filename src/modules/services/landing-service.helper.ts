/**
 * Sinh đường dẫn và mã cho một dịch vụ mới người dùng tự thêm.
 *
 * Mọi thứ ở đây chỉ là GỢI Ý mặc định cho form — người thêm dịch vụ vẫn sửa
 * được trước khi lưu. Nhưng gợi ý phải đúng ngay: đường dẫn là thứ đi vào
 * Google và vào link người ta gửi cho nhau, sửa sau là gãy link cũ.
 */

/** Bảng dấu tiếng Việt, gom theo chữ cái không dấu. */
const DAU: Record<string, string> = {
  a: 'àáạảãâầấậẩẫăằắặẳẵ',
  e: 'èéẹẻẽêềếệểễ',
  i: 'ìíịỉĩ',
  o: 'òóọỏõôồốộổỗơờớợởỡ',
  u: 'ùúụủũưừứựửữ',
  y: 'ỳýỵỷỹ',
  d: 'đ',
};

/** Đổi một ký tự có dấu thành chữ không dấu; không phải chữ tiếng Việt thì giữ nguyên. */
function boDau(ch: string): string {
  const thuong = ch.toLowerCase();
  for (const [goc, co_dau] of Object.entries(DAU)) {
    if (co_dau.includes(thuong)) return goc;
  }
  return thuong;
}

/**
 * Chuẩn hoá thành một đoạn đường dẫn: bỏ dấu, chỉ giữ chữ và số, nối bằng gạch
 * ngang. Trả chuỗi rỗng khi tên không còn chữ nào — thà để trống cho người
 * dùng tự đặt còn hơn bịa ra một đường dẫn vô nghĩa.
 */
export function chuanHoaSlug(ten: string): string {
  return [...ten.trim()]
    .map(boDau)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Khoá ổn định dùng trong khoá nội dung (`services.items.<khoá>.name`).
 *
 * Gạch dưới chứ không gạch ngang, và có tiền tố `them_`: dấu chấm là dấu tách
 * cấp trong khoá nội dung, còn tiền tố giữ cho khoá tự thêm không bao giờ đụng
 * chín khoá viết trong code của landing.
 */
export function khoaTuTen(ten: string): string | null {
  const slug = chuanHoaSlug(ten);
  return slug ? `them_${slug.replace(/-/g, '_')}` : null;
}

/**
 * Mã ba chữ in hoa — tiền tố mã đơn, và là khoá duy nhất của bảng dịch vụ.
 *
 * Lấy chữ cái đầu của ba từ đầu; tên ngắn hơn thì lấy ba chữ cái đầu. Trùng mã
 * đã có thì dò tiếp bằng cách đổi chữ cuối: mã trùng là lỗi 409 ném vào mặt
 * người dùng cho một thứ máy tự đoán hộ được.
 */
export function maTuTen(ten: string, daCo: ReadonlySet<string>): string | null {
  const chu = chuanHoaSlug(ten).replace(/[^a-z]/g, '');
  if (!chu) return null;
  const tu = chuanHoaSlug(ten).split('-').filter((t) => /[a-z]/.test(t));
  const dau = tu.length >= 3 ? tu.slice(0, 3).map((t) => t[0]).join('') : chu.slice(0, 3);
  const goc = dau.padEnd(3, chu[0] ?? 'x').toUpperCase().slice(0, 3);
  if (!daCo.has(goc)) return goc;

  // Dò có thứ tự thay vì ngẫu nhiên: cùng một tên luôn cho cùng một mã, nên
  // thử lại sau khi lỗi mạng không đẻ ra mã thứ hai cho cùng một dịch vụ.
  const hai = goc.slice(0, 2);
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!daCo.has(hai + c)) return hai + c;
  }
  for (const a of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const thu = goc[0] + a + b;
      if (!daCo.has(thu)) return thu;
    }
  }
  return null;
}
