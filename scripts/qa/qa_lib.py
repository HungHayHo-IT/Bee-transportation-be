# -*- coding: utf-8 -*-
"""Bộ khung cho test đối kháng BeeOps. Không phải đường hạnh phúc."""
import json, threading, urllib.request, urllib.error

BASE = 'http://localhost:8087/api'
RESULTS = []   # (suite, name, passed, detail)
_SUITE = ['?']


def suite(name):
    _SUITE[0] = name
    print(f'\n===== {name} =====')


class C:
    """Client giữ cookie riêng cho từng người dùng."""

    def __init__(self, label):
        self.label, self.cookie = label, None

    def __call__(self, method, path, body=None, raw=False, ctype='application/json',
                 rawbody=None):
        data = rawbody if rawbody is not None else (
            json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data is not None:
            req.add_header('Content-Type', ctype)
        if self.cookie:
            req.add_header('Cookie', self.cookie)
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                blob, status = r.read(), r.status
                sc = r.headers.get('Set-Cookie')
                if sc:
                    self.cookie = sc.split(';')[0]
        except urllib.error.HTTPError as e:
            blob, status = e.read(), e.code
        except urllib.error.URLError as e:
            return 0, {'error': str(e)}
        if raw:
            return status, blob
        try:
            return status, json.loads(blob) if blob else {}
        except json.JSONDecodeError:
            return status, {'raw': blob[:200].decode('utf-8', 'replace')}

    def login(self, email, pw):
        st, p = self('POST', '/auth/login', {'email': email, 'password': pw})
        if st != 201:
            raise SystemExit(f'Không đăng nhập được {email}: {st} {p}')
        return p['data']

    def data(self, method, path, body=None):
        st, p = self(method, path, body)
        return p.get('data')


def ok(name, cond, detail=''):
    RESULTS.append((_SUITE[0], name, bool(cond), str(detail)))
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else f'   → {detail}'))
    return bool(cond)


def status_is(name, got, expected):
    exp = expected if isinstance(expected, (list, tuple, set)) else [expected]
    return ok(name, got in exp, f'nhận {got}, mong {list(exp)}')


def parallel(fn, n):
    """Chạy fn(i) trên n luồng, trả list kết quả theo thứ tự."""
    out = [None] * n
    def run(i):
        try:
            out[i] = fn(i)
        except Exception as e:                      # noqa: BLE001
            out[i] = ('EXC', repr(e))
    ts = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    return out


# --------------------------------------------------------------- fixture

ADMIN_PW = '246810'
PW = '135791'
TEMP_PIN = '000000'


def onboard(admin, email, name, roles, dept=None):
    """Tạo (hoặc tái dùng) tài khoản, đổi PIN tạm, trả client đã đăng nhập."""
    st, p = admin('POST', '/users', {
        'email': email, 'fullName': name, 'roles': roles,
        'departmentId': dept, 'tempPassword': TEMP_PIN})
    if st == 201:
        temp, uid = TEMP_PIN, p['data']['id']
    else:
        users = admin.data('GET', '/users')['items']
        uid = next(u['id'] for u in users if u['email'] == email)
        temp = admin.data('POST', f'/users/{uid}/reset-password')['tempPassword']
    c = C(name)
    c.login(email, temp)
    c('POST', '/auth/change-password', {'currentPassword': temp, 'newPassword': PW})
    return uid, c


def build_fixture():
    """Dựng tổ chức chuẩn: 2 phòng cùng phụ trách DOM, phòng C phụ trách CUS."""
    admin = C('admin')
    admin.login('admin@beetransportation.vn', ADMIN_PW)
    svc = {s['code']: s['id'] for s in admin.data('GET', '/services')['items']}

    def dept(name, codes):
        st, p = admin('POST', '/departments',
                      {'name': name, 'serviceIds': [svc[c] for c in codes]})
        if st == 201:
            return p['data']['id']
        did = next(d['id'] for d in admin.data('GET', '/departments')['items'] if d['name'] == name)
        # bộ test khác có thể đã tắt phòng này -> bật lại và ghi lại dịch vụ phụ trách
        admin('PATCH', f'/departments/{did}', {'isActive': True})
        admin('PUT', f'/departments/{did}/services', {'serviceIds': [svc[c] for c in codes]})
        return did

    dA = dept('QA Phòng A', ['DOM'])
    dB = dept('QA Phòng B', ['DOM'])
    dC = dept('QA Phòng C', ['CUS'])

    # Cô lập: tắt mọi phòng KHÔNG thuộc bộ QA, nếu không đơn DOM sẽ được phân phối
    # tới cả phòng của smoke test cũ và mọi phép đếm đều lệch.
    qa = {dA, dB, dC}
    for d in admin.data('GET', '/departments')['items']:
        if d['id'] not in qa and d['isActive']:
            admin('PATCH', f"/departments/{d['id']}", {'isActive': False})

    saleId, sale = onboard(admin, 'qa.sale1@bee.vn', 'QA Sale 1', ['sale'])
    sale2Id, sale2 = onboard(admin, 'qa.sale2@bee.vn', 'QA Sale 2', ['sale'])
    mAId, mA = onboard(admin, 'qa.ma@bee.vn', 'QA Trưởng A', ['manager'], dA)
    mBId, mB = onboard(admin, 'qa.mb@bee.vn', 'QA Trưởng B', ['manager'], dB)
    stAId, stA = onboard(admin, 'qa.sta@bee.vn', 'QA NV A', ['staff'], dA)
    stBId, stB = onboard(admin, 'qa.stb@bee.vn', 'QA NV B', ['staff'], dB)
    leadId, lead = onboard(admin, 'qa.lead@bee.vn', 'QA Lãnh đạo', ['leader'])
    acctId, acct = onboard(admin, 'qa.acct@bee.vn', 'QA Kế toán', ['staff'], dC)

    admin('PATCH', f'/departments/{dA}', {'managerId': mAId})
    admin('PATCH', f'/departments/{dB}', {'managerId': mBId})
    admin('PATCH', f'/departments/{dC}', {'managerId': None})

    return {
        'admin': admin, 'svc': svc, 'dA': dA, 'dB': dB, 'dC': dC,
        'sale': sale, 'saleId': saleId, 'sale2': sale2, 'sale2Id': sale2Id,
        'mA': mA, 'mAId': mAId, 'mB': mB, 'mBId': mBId,
        'stA': stA, 'stAId': stAId, 'stB': stB, 'stBId': stBId,
        'lead': lead, 'leadId': leadId, 'acct': acct, 'acctId': acctId,
    }


_CON_CUA = {}


def _conDauTien(sale, svcId):
    """Dich vu con dau tien mang ma TMS, hoac None neu dich vu khong chia nho.

    Tu migration 049, dich vu da chia nho thi BAT BUOC chon dich vu con - khong
    con loi thoat bang ma TMS cua dich vu cha. Tra loi MOT lan roi nho lai: moi
    bo QA goi mkorder hang chuc lan.
    """
    if svcId not in _CON_CUA:
        st, p = sale('GET', f'/services/{svcId}/children')
        ds = [c for c in p['data']['items'] if c['isActive']] if st == 200 else []
        _CON_CUA[svcId] = ds[0]['id'] if ds else None
    return _CON_CUA[svcId]


def mkorder(sale, svcId, **kw):
    body = {'serviceId': svcId, 'originProvince': 'Hà Nội',
            'destinationProvince': 'Hải Phòng', 'weightKg': 10000}
    con = _conDauTien(sale, svcId)
    if con is not None:
        body['serviceChildId'] = con
    body.update(kw)
    st, p = sale('POST', '/orders', body)
    if st != 201:
        raise SystemExit(f'Không tạo được đơn: {st} {p}')
    return p['data']


def report():
    bad = [r for r in RESULTS if not r[2]]
    print('\n' + '=' * 66)
    print(f'TỔNG: {len(RESULTS)} kiểm tra · {len(RESULTS) - len(bad)} đạt · {len(bad)} KHÔNG ĐẠT')
    if bad:
        print('-' * 66)
        for s, n, _p, d in bad:
            print(f'  [{s}] {n}\n      {d}')
    return len(bad)
