import { buildTree, detectCycle, DeptTreeInput } from './department-tree.helper';

const mk = (id: number, name: string, parentId: number | null): DeptTreeInput => ({
  id, name, parentId, managerId: null, managerName: null, isActive: true, isSales: false, members: [],
});

/** Ban Vận hành (1) > Phòng Nội địa (2) > Tổ Miền Bắc (4); Phòng Quốc tế (3) cùng cấp với 2. */
const ROWS = [mk(2, 'Phòng Nội địa', 1), mk(4, 'Tổ Miền Bắc', 2), mk(1, 'Ban Vận hành', null), mk(3, 'Phòng Quốc tế', 1)];

describe('buildTree', () => {
  it('dựng đúng nhiều tầng dù dữ liệu vào không theo thứ tự', () => {
    const roots = buildTree(ROWS);
    expect(roots.map((r) => r.id)).toEqual([1]);
    expect(roots[0].children.map((c) => c.id)).toEqual([2, 3]);
    expect(roots[0].children[0].children.map((c) => c.id)).toEqual([4]);
  });

  it('xếp các nút cùng cấp theo tên', () => {
    const roots = buildTree([mk(1, 'Ban B', null), mk(2, 'Ban A', null)]);
    expect(roots.map((r) => r.name)).toEqual(['Ban A', 'Ban B']);
  });

  /** Cha bị xoá thì phòng con vẫn phải hiện — biến mất khỏi sơ đồ là mất dữ liệu trong mắt người dùng. */
  it('phòng mồ côi hiện như một gốc thay vì biến mất', () => {
    const roots = buildTree([mk(1, 'Ban Vận hành', null), mk(9, 'Phòng lạc', 404)]);
    expect(roots.map((r) => r.id).sort()).toEqual([1, 9]);
  });

  it('không nhân bản: mỗi phòng xuất hiện đúng một lần', () => {
    const count = (ns: ReturnType<typeof buildTree>): number =>
      ns.reduce((n, x) => n + 1 + count(x.children), 0);
    expect(count(buildTree(ROWS))).toBe(ROWS.length);
  });
});

describe('detectCycle', () => {
  const parentOf = new Map<number, number | null>([[1, null], [2, 1], [4, 2]]);

  it('tự làm cha chính mình là chu trình', () => {
    expect(detectCycle(2, 2, parentOf)).toBe(true);
  });

  it('cho cháu làm cha của ông là chu trình', () => {
    expect(detectCycle(1, 4, parentOf)).toBe(true);
  });

  it('gắn vào một nhánh khác thì không phải chu trình', () => {
    expect(detectCycle(3, 4, parentOf)).toBe(false);
  });

  /** Dữ liệu hỏng sẵn trong DB không được làm treo tiến trình. */
  it('dừng lại khi chuỗi cha đã sẵn vòng lặp', () => {
    const broken = new Map<number, number | null>([[7, 8], [8, 7]]);
    expect(detectCycle(9, 7, broken)).toBe(false);
  });
});
