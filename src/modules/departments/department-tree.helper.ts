/** Chỉ những gì sơ đồ tổ chức cần vẽ — không email, không điện thoại. */
export interface DeptTreeMember {
  id: number;
  fullName: string;
  roles: string[];
}

export interface DeptTreeInput {
  id: number;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
  /** Phong Sale (076) - khong nhan chuyen phong bao gia. */
  isSales: boolean;
  members: DeptTreeMember[];
}

export interface DeptTreeNode extends DeptTreeInput {
  children: DeptTreeNode[];
}

/**
 * Dựng cây trong bộ nhớ. Số phòng đếm bằng chục nên không cần đệ quy SQL.
 *
 * Phòng có parentId trỏ tới phòng không tồn tại được coi là GỐC. Bỏ nó đi thì
 * cả nhánh biến mất khỏi màn hình mà không ai biết vì sao — mất dữ liệu trong
 * mắt người dùng, tệ hơn nhiều so với một nút hiện sai chỗ.
 */
export function buildTree(rows: readonly DeptTreeInput[]): DeptTreeNode[] {
  const nodes = new Map<number, DeptTreeNode>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  );
  const roots: DeptTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: DeptTreeNode[]): DeptTreeNode[] => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    for (const n of list) sort(n.children);
    return list;
  };
  return sort(roots);
}

/**
 * Gắn `id` vào dưới `parentId` có tạo ra vòng không?
 *
 * Đi ngược chuỗi cha từ parentId lên: gặp lại `id` là vòng. `seen` không phải
 * để tối ưu — nếu DB đã có sẵn một vòng do dữ liệu hỏng, thiếu nó thì hàm chạy
 * mãi không dừng.
 */
export function detectCycle(
  id: number,
  parentId: number,
  parentOf: ReadonlyMap<number, number | null>,
): boolean {
  const seen = new Set<number>();
  let cursor: number | null | undefined = parentId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return false;
}
