# -*- coding: utf-8 -*-
"""
Smoke test F6 dashboard. Chạy SAU e2e-smoke.py (cần dữ liệu đơn đã chốt).
    PYTHONIOENCODING=utf-8 python scripts/e2e-dashboard.py
"""
import json, sys, urllib.request, urllib.error, urllib.parse

BASE = 'http://localhost:8087/api'
FAILED = []


class Client:
    def __init__(self, label):
        self.label, self.cookie = label, None

    def call(self, method, path, body=None, expect=None, raw=False):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data is not None:
            req.add_header('Content-Type', 'application/json')
        if self.cookie:
            req.add_header('Cookie', self.cookie)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                blob, status = r.read(), r.status
                sc = r.headers.get('Set-Cookie')
                if sc:
                    self.cookie = sc.split(';')[0]
                ctype = r.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            blob, status, ctype = e.read(), e.code, ''
        if expect is not None and status != expect:
            FAILED.append(f'{self.label} {method} {path} -> {status}: {blob[:200]}')
        if raw:
            return status, blob, ctype
        return status, (json.loads(blob) if blob else {})

    def login(self, email, pw):
        return self.call('POST', '/auth/login', {'email': email, 'password': pw}, 201)


def check(name, cond, detail=''):
    print(('  OK   ' if cond else '  FAIL ') + name + ('' if cond else f'  <- {detail}'))
    if not cond:
        FAILED.append(f'{name}: {detail}')


def main():
    admin = Client('admin')
    admin.login('admin@beetransportation.vn', '246810')
    sale = Client('sale'); sale.login('sale1@bee.vn', '135791')
    m1 = Client('mgr-A'); m1.login('m1@bee.vn', '135791')
    m2 = Client('mgr-B'); m2.login('m2@bee.vn', '135791')

    print('== summary ==')
    _, s = admin.call('GET', '/dashboard/summary', expect=200)
    d = s['data']
    check('admin -> tầng company', d['scopeLevel'] == 'company', d['scopeLevel'])
    check('có doanh thu tháng này', d['revenueThisMonth'] == 42000000, str(d['revenueThisMonth']))
    check('winRate = 100 (1 thắng, 0 từ chối)', d['winRate'] == 100.0, str(d['winRate']))

    _, sm = m2.call('GET', '/dashboard/summary', expect=200)
    check('trưởng phòng B -> tầng department', sm['data']['scopeLevel'] == 'department')
    check('phòng THẮNG thấy doanh thu', sm['data']['revenueThisMonth'] == 42000000,
          str(sm['data']['revenueThisMonth']))
    _, sl = m1.call('GET', '/dashboard/summary', expect=200)
    check('phòng THUA doanh thu = 0', sl['data']['revenueThisMonth'] == 0,
          str(sl['data']['revenueThisMonth']))

    print('== revenue ==')
    _, r = admin.call('GET', '/dashboard/revenue?groupBy=month&compare=true', expect=200)
    check('có ít nhất 1 điểm', len(r['data']) >= 1, str(r['data']))
    if r['data']:
        p = r['data'][0]
        check('điểm có revenue + prevRevenue', p['revenue'] == 42000000 and 'prevRevenue' in p,
              json.dumps(p))

    for dim in ['service', 'route', 'customer', 'sale', 'department']:
        _, b = admin.call('GET', f'/dashboard/revenue/by?dimension={dim}', expect=200)
        check(f'lát cắt {dim}', len(b['data']) >= 1, str(b['data']))

    print('== funnel / win-rate ==')
    _, fn = admin.call('GET', '/dashboard/funnel', expect=200)
    steps = {x['status']: x['orderCount'] for x in fn['data']}
    # Migration 023 rut vong doi tu muoi mot xuong BAY trang thai: bo
    # 'in_progress', 'completed', 'rejected', 'awaiting_customer'. Don chot roi
    # thi dung o 'closed' — tien do giao hang la viec cua tab Tien do.
    check('phễu đủ 7 trạng thái', len(fn['data']) == 7, str(len(fn['data'])))
    check('1 đơn closed', steps.get('closed') == 1, str(steps.get('closed')))

    _, wr = admin.call('GET', '/dashboard/win-rate', expect=200)
    check('win rate: 1 thắng / 1 quyết định', wr['data']['won'] == 1 and wr['data']['decided'] == 1,
          json.dumps(wr['data']))

    print('== chỉ số tổng hợp (AggregateReportGuard) ==')
    _, rt = admin.call('GET', '/dashboard/response-time', expect=200)
    check('response-time có 2 phòng', len(rt['data']) == 2, str(len(rt['data'])))
    _, cp = admin.call('GET', '/dashboard/competition', expect=200)
    won = {x['departmentName']: x['won'] for x in cp['data']}
    check('phòng B thắng 1', any(v == 1 for v in won.values()), json.dumps(won))
    _, av = admin.call('GET', '/dashboard/competition/avg-departments', expect=200)
    check('TB phòng/đơn = 2', av['data']['avgDepartmentsPerOrder'] == 2,
          str(av['data']['avgDepartmentsPerOrder']))
    _, wl = admin.call('GET', '/dashboard/workload', expect=200)
    check('workload có byDepartment + byUser',
          'byDepartment' in wl['data'] and 'byUser' in wl['data'])

    st, _ = sale.call('GET', '/dashboard/response-time')
    check('SALE bị chặn khỏi báo cáo tổng hợp -> 403', st == 403, str(st))
    st, _ = m1.call('GET', '/dashboard/response-time')
    check('TRƯỞNG PHÒNG xem được báo cáo tổng hợp -> 200', st == 200, str(st))

    print('== ép hẹp phạm vi ==')
    st, _ = m1.call('GET', '/dashboard/summary?departmentId=999')
    check('trưởng phòng ép sang phòng khác -> 403', st == 403, str(st))
    st, _ = sale.call('GET', '/dashboard/summary?departmentId=1')
    check('sale ép sang cấp phòng -> 403', st == 403, str(st))

    print('== drill + export ==')
    _, dr = admin.call('GET', '/dashboard/drill?revenueOnly=true', expect=200)
    rows = dr['data']['items']
    check('drill trả đơn đã chốt', len(rows) == 1, str(len(rows)))
    if rows:
        check('drill có doanh thu cho admin', rows[0]['finalAmount'] == 42000000)

    _, dl = m1.call('GET', '/dashboard/drill?revenueOnly=true', expect=200)
    lost = dl['data']['items']
    if lost:
        check('drill: phòng THUA không thấy doanh thu', lost[0]['finalAmount'] is None,
              str(lost[0]['finalAmount']))

    st, blob, ctype = admin.call('GET', '/dashboard/export', expect=200, raw=True)
    check('export trả file xlsx', blob[:2] == b'PK' and 'spreadsheet' in ctype,
          f'{blob[:4]!r} {ctype}')
    check('file có kích thước hợp lý', len(blob) > 3000, str(len(blob)))

    print()
    if FAILED:
        print(f'*** {len(FAILED)} LỖI ***')
        for f in FAILED:
            print(' -', f)
        sys.exit(1)
    print('TẤT CẢ ĐỀU XANH')


main()
