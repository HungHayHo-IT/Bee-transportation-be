# -*- coding: utf-8 -*-
"""
Smoke test bình luận + file + xuất Excel/PDF + audit log.
Chạy SAU e2e-smoke.py.  PYTHONIOENCODING=utf-8 python scripts/e2e-collab.py
"""
import json, sys, urllib.request, urllib.error, uuid

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
        return self._send(req, expect, raw, method, path)

    def upload(self, path, filename, mime, content, expect=None):
        boundary = '----beeops' + uuid.uuid4().hex
        body = b''.join([
            f'--{boundary}\r\n'.encode(),
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
            f'Content-Type: {mime}\r\n\r\n'.encode(),
            content, b'\r\n', f'--{boundary}--\r\n'.encode(),
        ])
        req = urllib.request.Request(BASE + path, data=body, method='POST')
        req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
        if self.cookie:
            req.add_header('Cookie', self.cookie)
        return self._send(req, expect, False, 'POST', path)

    def _send(self, req, expect, raw, method, path):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                blob, status, ctype = r.read(), r.status, r.headers.get('Content-Type', '')
                sc = r.headers.get('Set-Cookie')
                if sc:
                    self.cookie = sc.split(';')[0]
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


PNG = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
    '890000000a49444154789c6300010000050001' + '0d0a2db4' + '0000000049454e44ae426082')


def main():
    admin = Client('admin'); admin.login('admin@beetransportation.vn', '246810')
    sale = Client('sale'); sale.login('sale1@bee.vn', '135791')
    m1 = Client('mgr-A'); m1.login('m1@bee.vn', '135791')
    m2 = Client('mgr-B'); m2.login('m2@bee.vn', '135791')

    _, lst = sale.call('GET', '/orders?limit=50', expect=200)
    oid = lst['data']['items'][-1]['id']
    _, det = sale.call('GET', f'/orders/{oid}', expect=200)
    # departments được sắp theo GIÁ tăng dần, không phải theo id -> tra theo tên.
    _, dl = admin.call('GET', '/departments', expect=200)
    by_name = {d['name']: d['id'] for d in dl['data']['items']}
    d1 = by_name['Phòng Nội địa A']   # m1 quản lý
    d2 = by_name['Phòng Nội địa B']   # m2 quản lý
    print(f'== dùng đơn {det["data"]["code"]} (A={d1}, B={d2}) ==')

    print('== bình luận ==')
    sale.call('POST', f'/orders/{oid}/comments', {'body': 'Luồng chung cho cả hai phòng'}, 201)
    sale.call('POST', f'/orders/{oid}/comments',
              {'body': 'Riêng phòng A: giảm giá được không?', 'departmentId': d1}, 201)
    sale.call('POST', f'/orders/{oid}/comments',
              {'body': 'Riêng phòng B: bạn thắng rồi', 'departmentId': d2}, 201)

    _, cs = sale.call('GET', f'/orders/{oid}/comments', expect=200)
    check('sale thấy cả 3 luồng', len(cs['data']['items']) == 3, str(len(cs['data']['items'])))

    _, c1 = m1.call('GET', f'/orders/{oid}/comments', expect=200)
    bodies = [c['body'] for c in c1['data']['items']]
    check('phòng A thấy luồng chung + luồng mình (2)', len(bodies) == 2, str(bodies))
    check('phòng A KHÔNG thấy luồng phòng B',
          all('phòng B' not in b for b in bodies), str(bodies))

    st, _ = m1.call('POST', f'/orders/{oid}/comments',
                    {'body': 'chen vào luồng phòng khác', 'departmentId': d2})
    check('phòng A viết vào luồng phòng B -> 400', st == 400, str(st))

    st, ok = m1.call('POST', f'/orders/{oid}/comments', {'body': 'Phòng A trả lời'})
    check('phòng A viết vào luồng mình -> 201', st == 201, str(st))

    print('== file đính kèm ==')
    st, up = sale.upload(f'/orders/{oid}/files', 'chung-tu.png', 'image/png', PNG, 201)
    fid = up['data']['id'] if st == 201 else None
    check('tải file lên', fid is not None, json.dumps(up)[:200])
    check('tên file trên đĩa là UUID, không phải tên gốc',
          fid and up['data']['name'] == 'chung-tu.png' and fid not in 'chung-tu.png')

    st, bad = sale.upload(f'/orders/{oid}/files', 'virus.exe', 'application/x-msdownload', b'MZ')
    check('chặn MIME lạ -> 400', st == 400, str(st))

    _, fl = sale.call('GET', f'/orders/{oid}/files', expect=200)
    check('liệt kê file', len(fl['data']['items']) >= 1, str(len(fl['data']['items'])))

    if fid:
        st, blob, ctype = sale.call('GET', f'/files/{oid}/{fid}', expect=200, raw=True)
        check('tải file về đúng nội dung', blob == PNG and 'image/png' in ctype,
              f'{len(blob)}B {ctype}')

        other = Client('sale2'); other.login('sale2@bee.vn', '135791')
        st, _, _ = other.call('GET', f'/files/{oid}/{fid}', raw=True)
        check('người ngoài phạm vi tải file -> 404', st == 404, str(st))

        st, _ = m1.call('DELETE', f'/orders/{oid}/files/{fid}')
        check('người không tải lên mà xóa -> 403', st == 403, str(st))
        st, _ = sale.call('DELETE', f'/orders/{oid}/files/{fid}')
        check('người tải lên xóa được -> 200', st == 200, str(st))

    print('== xuất Excel / PDF ==')
    st, blob, ctype = admin.call('GET', '/orders/export', expect=200, raw=True)
    check('Excel đơn hàng', blob[:2] == b'PK' and 'spreadsheet' in ctype, f'{blob[:4]!r}')

    # 'completed' khong con la trang thai hop le (migration 023) — loc theo no
    # thi API tra 400 va ca bo test chet o day. Don da chot nam o 'closed'.
    _, closed = admin.call('GET', '/orders?status=closed', expect=200)
    if closed['data']['items']:
        cid = closed['data']['items'][0]['id']
        st, pdf, ctype = admin.call('GET', f'/orders/{cid}/confirmation.pdf', expect=200, raw=True)
        check('PDF phiếu xác nhận', pdf[:4] == b'%PDF' and 'pdf' in ctype, f'{pdf[:6]!r}')
        check('PDF có nội dung', len(pdf) > 2000, str(len(pdf)))
        st, _, _ = m2.call('GET', f'/orders/{cid}/confirmation.pdf', raw=True)
        check('trưởng phòng không được in phiếu -> 403', st == 403, str(st))

    print('== audit log ==')
    _, al = admin.call('GET', '/activity?limit=5', expect=200)
    check('audit log có bản ghi', al['data']['total'] > 0, str(al['data']['total']))
    actions = {a['action'] for a in al['data']['items']}
    check('ghi được hành động', len(actions) > 0, str(actions))
    st, _ = sale.call('GET', '/activity')
    check('sale xem audit log -> 403', st == 403, str(st))

    print()
    if FAILED:
        print(f'*** {len(FAILED)} LỖI ***')
        for f in FAILED:
            print(' -', f)
        sys.exit(1)
    print('TẤT CẢ ĐỀU XANH')


main()
