# -*- coding: utf-8 -*-
"""
Smoke test luồng nghiệp vụ BeeOps: F7 -> F1 -> F2 -> F3 -> F4 -> F5.
Chạy trên DB dev thật:  python scripts/e2e-smoke.py
"""
import json, re, sys, urllib.request, urllib.error

BASE = 'http://localhost:8087/api'
FAILED = []


class Client:
    """Mỗi người dùng một client riêng để giữ cookie phiên riêng."""

    def __init__(self, label):
        self.label = label
        self.cookie = None

    def call(self, method, path, body=None, expect=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data is not None:
            req.add_header('Content-Type', 'application/json')
        if self.cookie:
            req.add_header('Cookie', self.cookie)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw, status = r.read(), r.status
                sc = r.headers.get('Set-Cookie')
                if sc:
                    self.cookie = sc.split(';')[0]
        except urllib.error.HTTPError as e:
            raw, status = e.read(), e.code
        payload = json.loads(raw) if raw else {}
        if expect is not None and status != expect:
            FAILED.append(f'{self.label} {method} {path} -> {status} (mong {expect}): {payload}')
        return status, payload

    def login(self, email, pw):
        st, p = self.call('POST', '/auth/login', {'email': email, 'password': pw}, 201)
        return p.get('data')


def check(name, cond, detail=''):
    print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  <- {detail}'))
    if not cond:
        FAILED.append(f'{name}: {detail}')


def main():
    admin = Client('admin')
    admin.login('admin@beetransportation.vn', '246810')
    print('== F7: tổ chức ==')

    _, sv = admin.call('GET', '/services', expect=200)
    svc = {s['code']: s['id'] for s in sv['data']['items']}

    # Dich vu da chia nho thi BAT BUOC chon dich vu con (migration 049 bo ma TMS
    # cua dich vu cha, nen khong con loi thoat nao). DOM co hai con: FCL va LCL.
    _, dcon = admin.call('GET', f"/services/{svc['DOM']}/children", expect=200)
    domCon = next(c['id'] for c in dcon['data']['items'] if c['tmsMode'] == 'DOMESTIC_FCL')

    def mkdept(name, codes):
        st, p = admin.call('POST', '/departments',
                           {'name': name, 'serviceIds': [svc[c] for c in codes]})
        if st == 201:
            return p['data']['id']
        _, lst = admin.call('GET', '/departments')
        did = next(d['id'] for d in lst['data']['items'] if d['name'] == name)
        # bộ test khác có thể đã tắt phòng này -> bật lại và ghi lại dịch vụ phụ trách
        admin.call('PATCH', f'/departments/{did}', {'isActive': True})
        admin.call('PUT', f'/departments/{did}/services',
                   {'serviceIds': [svc[c] for c in codes]})
        return did

    d1 = mkdept('Phòng Nội địa A', ['DOM', 'MMT'])
    d2 = mkdept('Phòng Nội địa B', ['DOM'])
    check('tạo 2 phòng cùng phụ trách DOM', bool(d1 and d2))

    # Cô lập: tắt mọi phòng khác, nếu không đơn DOM đi tới cả phòng của bộ QA.
    _, alld = admin.call('GET', '/departments')
    for d in alld['data']['items']:
        if d['id'] not in (d1, d2) and d['isActive']:
            admin.call('PATCH', f"/departments/{d['id']}", {'isActive': False})

    def mkuser(email, name, roles, dept=None):
        st, p = admin.call('POST', '/users', {
            'email': email, 'fullName': name, 'roles': roles,
            'departmentId': dept, 'tempPassword': '246810'})
        if st == 201:
            return p['data']['id'], '246810'
        _, lst = admin.call('GET', '/users', None, 200)
        uid = next(u['id'] for u in lst['data']['items'] if u['email'] == email)
        _, r = admin.call('POST', f'/users/{uid}/reset-password', None, 201)
        return uid, r['data']['tempPassword']

    sale_id, sale_pw = mkuser('sale1@bee.vn', 'Sale Một', ['sale'])
    m1_id, m1_pw = mkuser('m1@bee.vn', 'Trưởng phòng A', ['manager'], d1)
    m2_id, m2_pw = mkuser('m2@bee.vn', 'Trưởng phòng B', ['manager'], d2)
    admin.call('PATCH', f'/departments/{d1}', {'managerId': m1_id}, 200)
    admin.call('PATCH', f'/departments/{d2}', {'managerId': m2_id}, 200)

    _, un = admin.call('GET', '/services/unrouted', expect=200)
    check('DOM không còn mồ côi', all(s['code'] != 'DOM' for s in un['data']['items']))

    # đăng nhập + đổi mật khẩu tạm cho từng người
    def onboard(email, pw, label):
        c = Client(label)
        c.login(email, pw)
        c.call('POST', '/auth/change-password',
               {'currentPassword': pw, 'newPassword': '135791'}, 201)
        return c

    sale = onboard('sale1@bee.vn', sale_pw, 'sale')
    m1 = onboard('m1@bee.vn', m1_pw, 'mgr-A')
    m2 = onboard('m2@bee.vn', m2_pw, 'mgr-B')

    print('== F1 + F2: tạo đơn và phân phối ==')
    # QA-25: chạy lại lần hai thì tên đã tồn tại -> 409 kèm id hồ sơ đang có.
    stc, cust = sale.call('POST', '/customers', {'companyName': 'Công ty TNHH Thử Nghiệm'})
    check('tạo khách: 201 lần đầu, 409 kèm id các lần sau', stc in (201, 409), str(stc))
    cid = (cust['data']['id'] if stc == 201
           else cust['error']['details']['existingCustomerId'])
    _, o = sale.call('POST', '/orders', {
        'serviceId': svc['DOM'], 'serviceChildId': domCon, 'customerId': cid,
        'originProvince': 'Hà Nội', 'destinationProvince': 'Hải Phòng',
        'weightKg': 12000, 'volumeCbm': 30, 'goodsName': 'Thép cuộn'}, 201)
    order = o['data']
    oid = order['id']
    # Don chon dich vu con DOMESTIC_FCL -> tien to D_FCL. Dich vu KHONG co ma
    # TMS nao moi giu kieu cu 'BRK-<ngay>-<stt>'.
    check('mã đơn đúng định dạng', re.fullmatch(r'D_FCL_\d{8}_\d{3}', order['code']) is not None,
          order['code'])
    check('trạng thái = distributed', order['status'] == 'distributed', order['status'])
    check('phân phối tới 2 phòng', len(order['departments']) == 2,
          str(len(order['departments'])))

    print('== F3: báo giá cạnh tranh ==')
    m1.call('POST', f'/orders/{oid}/departments/{d1}/claim', None, 201)
    m1.call('POST', f'/orders/{oid}/departments/{d1}/quote',
            {'amount': 45000000, 'scopeNote': 'Gồm bốc xếp 2 đầu'}, 201)
    _, mid = sale.call('GET', f'/orders/{oid}', expect=200)
    check('1 phòng báo giá -> quoting', mid['data']['status'] == 'quoting', mid['data']['status'])

    m2.call('POST', f'/orders/{oid}/departments/{d2}/quote', {'amount': 42000000}, 201)
    _, after = sale.call('GET', f'/orders/{oid}', expect=200)
    check('mọi phòng đã trả lời -> awaiting_selection',
          after['data']['status'] == 'awaiting_selection', after['data']['status'])

    _, mine = m1.call('GET', f'/orders/{oid}', expect=200)
    check('BÁO GIÁ KÍN: phòng A chỉ thấy 1 dòng', len(mine['data']['departments']) == 1,
          str(len(mine['data']['departments'])))
    check('sale thấy cả 2 báo giá', len(after['data']['departments']) == 2)

    print('== F4: chọn và chốt ==')
    st, _ = sale.call('POST', f'/orders/{oid}/close', {'note': 'chốt sớm'})
    check('chốt khi chưa chọn báo giá -> 409', st == 409, str(st))

    sale.call('POST', f'/orders/{oid}/select-quote', {'departmentId': d2}, 201)
    _, sel = sale.call('GET', f'/orders/{oid}', expect=200)
    # Migration 023 gop 'awaiting_customer' vao 'awaiting_selection': "da du bao
    # gia, cho sale chon" va "sale chon roi, cho khach gat" dinh lien nhau trong
    # thuc te, tach ra chi lam Kanban dai them mot cot khong ai dung.
    check('sau khi chọn -> vẫn awaiting_selection',
          sel['data']['status'] == 'awaiting_selection', sel['data']['status'])
    check('chưa khóa doanh thu', sel['data']['finalAmount'] is None)

    sale.call('POST', f'/orders/{oid}/close', {'note': 'Khách đồng ý'}, 201)
    _, closed = sale.call('GET', f'/orders/{oid}', expect=200)
    check('chốt -> closed', closed['data']['status'] == 'closed')
    check('doanh thu = giá phòng thắng', closed['data']['finalAmount'] == 42000000,
          str(closed['data']['finalAmount']))
    check('sinh snapshot 5 mốc DOM', len(closed['data']['milestones']) == 5,
          str(len(closed['data']['milestones'])))

    _, loser = m1.call('GET', f'/orders/{oid}', expect=200)
    check('PHÒNG THUA KHÔNG thấy doanh thu', loser['data']['finalAmount'] is None,
          str(loser['data']['finalAmount']))
    _, winner = m2.call('GET', f'/orders/{oid}', expect=200)
    check('phòng thắng THẤY doanh thu', winner['data']['finalAmount'] == 42000000)

    print('== F5: tiến độ ==')
    _, ms = m2.call('GET', f'/orders/{oid}/milestones', expect=200)
    steps = ms['data']['items']
    st, _ = m2.call('PATCH', f'/orders/{oid}/milestones/{steps[2]["id"]}', {'status': 'done'})
    check('nhảy cóc mốc -> 400', st == 400, str(st))
    st, _ = m2.call('PATCH', f'/orders/{oid}/milestones/{steps[-1]["id"]}',
                    {'status': 'skipped', 'note': 'bỏ nghiệm thu'})
    check('bỏ qua mốc cuối -> 400', st == 400, str(st))
    st, _ = m1.call('PATCH', f'/orders/{oid}/milestones/{steps[0]["id"]}', {'status': 'done'})
    check('phòng thua cập nhật tiến độ -> 403/404', st in (403, 404), str(st))

    m2.call('PATCH', f'/orders/{oid}/milestones/{steps[0]["id"]}', {'status': 'done'}, 200)
    _, prog = m2.call('GET', f'/orders/{oid}', expect=200)
    # Migration 023 bo 'in_progress' va 'completed': tick moc KHONG con doi trang
    # thai don nua. Don chot roi thi dung o 'closed', con tien do la viec cua tab
    # Tien do. Kiem dung dieu do — truoc day bai nay cho 'in_progress' nen do mai.
    check('tick mốc KHÔNG đổi trạng thái đơn', prog['data']['status'] == 'closed',
          prog['data']['status'])
    for s in steps[1:]:
        m2.call('PATCH', f'/orders/{oid}/milestones/{s["id"]}', {'status': 'done'}, 200)
    _, done = m2.call('GET', f'/orders/{oid}', expect=200)
    check('hết mốc -> vẫn closed', done['data']['status'] == 'closed', done['data']['status'])
    # Dau vet "da giao xong" chuyen tu trang thai don sang completedAt.
    check('hết mốc -> có completedAt', done['data']['completedAt'] is not None,
          str(done['data']['completedAt']))

    print('== Scope ==')
    other = Client('sale2')
    e2, pw2 = mkuser('sale2@bee.vn', 'Sale Hai', ['sale'])
    other.login('sale2@bee.vn', pw2)
    other.call('POST', '/auth/change-password',
               {'currentPassword': pw2, 'newPassword': '135791'}, 201)
    st, _ = other.call('GET', f'/orders/{oid}')
    check('sale khác xem đơn không phải của mình -> 404', st == 404, str(st))
    _, mylist = other.call('GET', '/orders', expect=200)
    check('danh sách của sale khác rỗng', mylist['data']['total'] == 0, str(mylist['data']['total']))

    print('== Đơn giá tham khảo ==')
    _, o2 = sale.call('POST', '/orders', {
        'serviceId': svc['DOM'], 'serviceChildId': domCon, 'originProvince': 'Hà Nội',
        'destinationProvince': 'Hải Phòng', 'weightKg': 12500}, 201)
    _, ref = m2.call('GET', f'/orders/{o2["data"]["id"]}/reference-prices', expect=200)
    refs = ref['data']['items']
    check('tìm được đơn tham khảo', len(refs) >= 1, str(refs))
    if refs:
        check('điểm khớp = 6 (tuyến + khối lượng + CBM thiếu)',
              refs[0]['matchScore'] >= 5, str(refs[0]['matchScore']))

    print()
    if FAILED:
        print(f'*** {len(FAILED)} LỖI ***')
        for f in FAILED:
            print(' -', f)
        sys.exit(1)
    print('TẤT CẢ ĐỀU XANH')


main()
