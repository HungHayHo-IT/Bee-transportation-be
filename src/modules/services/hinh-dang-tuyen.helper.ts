/** Hai đầu của tuyến có nằm trong nước không. */
export interface HinhDangTuyen {
  diTrongNuoc: boolean;
  denTrongNuoc: boolean;
}

/** Phần của dịch vụ cha mà hàm dưới cần. */
export interface ChaCoCo {
  hasDomesticOrigin: boolean;
  hasDomesticDestination: boolean;
}

/** Phần của dịch vụ con. `null` ở một cờ = theo dịch vụ cha. */
export interface ConCoCo {
  hasDomesticOrigin: boolean | null;
  hasDomesticDestination: boolean | null;
}

/**
 * Hình dạng tuyến của một đơn: hỏi tỉnh/thành Việt Nam ở đầu nào.
 *
 * DỊCH VỤ CON QUYẾT ĐỊNH, dịch vụ cha chỉ là mặc định. Hàng xuất và hàng nhập
 * nằm cùng một dịch vụ cha nhưng ngược đầu nhau — một cờ ở cha không diễn tả
 * được, và đó đúng là lỗi đang có: mọi đơn xuất khẩu của MMT vẫn đang đòi
 * tỉnh/thành Việt Nam cho điểm ĐẾN.
 *
 * Từng cờ rơi về cha ĐỘC LẬP: một dịch vụ con khai một đầu và bỏ trống đầu kia
 * là hợp lệ, không phải "khai thì khai cả hai".
 */
export function hinhDangTuyen(cha: ChaCoCo, con: ConCoCo | null | undefined): HinhDangTuyen {
  return doc(cha, con);
}

/** Như trên, nhưng tự tìm dịch vụ con đã chọn trong danh sách đang bật. */
export function tuyenCuaDon<T extends ConCoCo & { id: number }>(
  cha: ChaCoCo,
  conDangBat: readonly T[],
  chonCon: number | null | undefined,
): HinhDangTuyen {
  return doc(cha, conDangBat.find((c) => c.id === chonCon) ?? null);
}

function doc(cha: ChaCoCo, con: ConCoCo | null | undefined): HinhDangTuyen {
  return {
    diTrongNuoc: con?.hasDomesticOrigin ?? cha.hasDomesticOrigin,
    denTrongNuoc: con?.hasDomesticDestination ?? cha.hasDomesticDestination,
  };
}

/**
 * Hai đầu suy ra từ MÃ TMS — dùng khi khởi tạo dữ liệu và để đối chiếu.
 *
 * Giữ cùng một chỗ với `hinhDangTuyen` để luật không nằm rải rác: migration
 * điền cột theo đúng bảng này, và test so hai bên với nhau.
 */
export function tuMaTms(tmsMode: string | null | undefined): HinhDangTuyen | null {
  if (!tmsMode) return null;
  if (tmsMode.startsWith('IMPORT')) return { diTrongNuoc: false, denTrongNuoc: true };
  if (tmsMode.startsWith('EXPORT') || tmsMode.startsWith('CBT'))
    return { diTrongNuoc: true, denTrongNuoc: false };
  if (tmsMode.startsWith('DOMESTIC') || tmsMode.startsWith('PORTTRANSFER'))
    return { diTrongNuoc: true, denTrongNuoc: true };
  return null;
}
