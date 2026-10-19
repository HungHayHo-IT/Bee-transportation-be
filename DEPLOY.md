# BeeOps — Triển khai BE + DB trên VM

Một VM, ba container: **PostgreSQL · API · Caddy** (reverse proxy + HTTPS tự động).
Không Kubernetes, không cloud service nào khác.

| | |
|---|---|
| **Cấu hình VM tối thiểu** | 2 vCPU · 4 GB RAM · 40 GB SSD |
| **Hệ điều hành** | Ubuntu 22.04 / 24.04 LTS |
| **Cần mở ra Internet** | 80, 443 (và 22 giới hạn theo IP) |
| **Thư mục cài đặt** | `/srv/beeops` |

---

## 1. Chuẩn bị VM

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone Asia/Ho_Chi_Minh      # quan trọng, xem §7

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
docker --version && docker compose version
```

**Tường lửa** — chỉ mở đúng ba cổng:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <IP-CUA-BAN> to any port 22 proto tcp   # SSH giới hạn IP
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable && sudo ufw status
```

PostgreSQL **không** mở ra ngoài — compose không publish cổng 5432, API nối qua
mạng nội bộ của Docker.

---

## 2. Lấy mã nguồn

```bash
sudo mkdir -p /srv/beeops && sudo chown "$USER":"$USER" /srv/beeops
git clone https://github.com/VietmindSolution/bee-transportation-be.git /srv/beeops
cd /srv/beeops
```

---

## 3. Tạo file `.env`

```bash
cp .env.example .env
# Sinh secret thật — ĐỪNG dùng giá trị mẫu
echo "JWT_SECRET=$(openssl rand -hex 32)"     >> .env
echo "COOKIE_SECRET=$(openssl rand -hex 32)"  >> .env
echo "DB_PASSWORD=$(openssl rand -hex 24)"    >> .env
nano .env    # xóa các dòng cũ trùng key, sửa phần còn lại
```

Bắt buộc sửa đúng cho môi trường thật:

```bash
NODE_ENV=production
PORT=8087
TZ=Asia/Ho_Chi_Minh

POSTGRES_DB=beeops
POSTGRES_USER=beeops
DB_PASSWORD=<chuỗi vừa sinh>

# host là "db" — tên service trong compose, KHÔNG phải localhost.
# Chốt cứng timezone ở đây là chắc nhất: nó áp cho từng connection trong pool.
DATABASE_URL=postgresql://beeops:<DB_PASSWORD>@db:5432/beeops?schema=public&connection_limit=20&options=-c%20timezone%3DAsia%2FHo_Chi_Minh

JWT_SECRET=<chuỗi vừa sinh>
COOKIE_SECRET=<chuỗi vừa sinh>
JWT_EXPIRES_IN=12h
COOKIE_SECURE=true                       # BẮT BUỘC true khi đã có HTTPS

# Chỉ ảnh hưởng CORS trên TRÌNH DUYỆT — Postman/curl không đọc tới nó, và
# Swagger ở /api/docs là same-origin nên chạy được bất kể giá trị này.
# Khi dựng FE thật, đổi thành domain của FE (nhiều domain thì ngăn bằng dấu phẩy).
FRONTEND_ORIGIN=https://bee-trans-api.ketnoivantai.com

SMTP_HOST=<smtp công ty>
# 587 = STARTTLS, 465 = TLS ngầm. Dùng 465 mà vẫn khai 587 thì kết nối treo rồi
# quá hạn, và màn hình chỉ báo "không gửi được email" — không nói lý do.
SMTP_PORT=587
SMTP_USER=<tài khoản>
SMTP_PASS=<mật khẩu>
SMTP_FROM=BeeOps <no-reply@beetransportation.vn>

# Trang ký điện tử bên landing — gốc của đường dẫn gửi cho khách, KHÔNG kèm mã.
# THIẾU DÒNG NÀY THÌ TÍNH NĂNG KÝ CHẾT HẲN: API vẫn khởi động bình thường (biến
# này là tuỳ chọn), nhưng bấm "Gửi cho khách ký" sẽ hỏng. Đã mất công thật trên
# production — và trước bản sửa ngày 02/10 thì nó còn báo nhầm thành "không gửi
# được email", kéo người đi sửa sang đào SMTP.
SIGN_PAGE_URL=https://beetransportation.vietmind.com.vn/vi-vn/ky

UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=20
```

```bash
chmod 600 .env      # chỉ chủ sở hữu đọc được
```

> `DB_PASSWORD` xuất hiện hai lần: một lần cho container Postgres, một lần nhúng
> trong `DATABASE_URL`. Đổi mật khẩu thì phải sửa cả hai.

---

## 4. Trỏ tên miền và sửa Caddyfile

`deploy/Caddyfile` đã đặt sẵn `bee-trans-api.ketnoivantai.com`. Dùng tên miền
khác thì sửa hostname ở dòng đầu khối:

```bash
nano deploy/Caddyfile
```

Tạo bản ghi **A**: `bee-trans-api.ketnoivantai.com → <IP công khai của VM>`.

**Đợi DNS phân giải xong rồi mới khởi động Caddy.** Caddy xin chứng chỉ ngay lúc
khởi động; DNS chưa trỏ thì Let's Encrypt từ chối, Caddy vào backoff và phải đợi
mới thử lại — không phải restart là xong ngay.

```bash
dig +short bee-trans-api.ketnoivantai.com     # phải ra đúng IP VM rồi mới đi tiếp
```

Chưa có tên miền thì tạm thay khối đầu bằng `:80 { handle /api/* { reverse_proxy api:8087 } }`
để chạy bằng IP (không có HTTPS — chỉ dùng để thử).

### Đổi sang tên miền mới trên VM đang chạy

**Trước hết xác định VM đang dùng bố cục nào** — quyết định file Caddyfile nào
thật sự đang chạy:

```bash
docker ps --format '{{.Names}}' | grep beeops-proxy && echo "BỐ CỤC A" || echo "BỐ CỤC B"
```

**Bố cục A — container `beeops-proxy` (docker-compose.prod.yml).** File đang chạy
là `deploy/Caddyfile` trong repo, tức sửa ở repo là đủ. Máy chủ KHÔNG có `.git`
(xem §12), nên mã nguồn tới VM bằng CD chứ không phải `git pull`:

```bash
# trên máy dev: merge vào main, CD tự đẩy sang VM
# rồi trên VM:
dig +short bee-trans-api.ketnoivantai.com                    # 1. DNS phải đúng TRƯỚC
docker compose -f docker-compose.prod.yml restart proxy      # 2. nạp Caddyfile mới
docker logs -f beeops-proxy                                  # 3. xem xin cert
curl -fsS https://bee-trans-api.ketnoivantai.com/api/health   # 4. phải trả db: up
```

**Bố cục B — Caddy chạy trực tiếp trên host (docker-compose.vm.yml).** Đây là
mặc định của `ci-deploy.sh`. File đang chạy là `/etc/caddy/Caddyfile` trên máy
chủ; **`deploy/Caddyfile` trong repo không được dùng tới**, sửa nó không có tác
dụng gì. Phải sửa tay trên VM:

```bash
dig +short bee-trans-api.ketnoivantai.com       # 1. DNS phải đúng TRƯỚC
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo nano /etc/caddy/Caddyfile                  # 2. đổi hostname của site BeeOps
caddy validate --config /etc/caddy/Caddyfile    # 3. kiểm TRƯỚC khi nạp
sudo systemctl reload caddy                     # 4. reload, KHÔNG restart
sudo journalctl -u caddy -n 50 --no-pager       # 5. xem xin cert
curl -fsS https://bee-trans-api.ketnoivantai.com/api/health
```

`reload` chứ không `restart`: máy này có thể đang phục vụ site của dự án khác.

Dù bố cục nào, site block chỉ khai báo MỘT hostname, nên sau khi nạp **mọi tên
miền cũ trỏ vào VM này sẽ đứt** — Caddy không tìm được block khớp và từ chối bắt
tay TLS. Muốn giữ song song thì khai báo cả hai, ngăn bằng dấu phẩy:

```
bee-trans-api.ketnoivantai.com, ten-mien-cu.example.com {
```

---

## 4b. Nếu VM ĐÃ CÓ reverse proxy đang chạy

Kiểm tra trước khi làm bất cứ gì:

```bash
ss -tlnp | grep -E ':(80|443)\s'
docker ps --format '{{.Names}}	{{.Ports}}'
```

Nếu 80/443 đã có chủ (nginx, Caddy, Traefik của dự án khác), **đừng dùng
`docker-compose.prod.yml`** — service `proxy` trong đó sẽ tranh cổng và làm gãy
dịch vụ đang chạy. Dùng `docker-compose.vm.yml`: chỉ `db` + `api`, API mở ra
`127.0.0.1:8087`, rồi khai báo thêm một site trong proxy sẵn có.

Với Caddy chạy trực tiếp trên host, thêm vào `/etc/caddy/Caddyfile`:

```
beeops.ten-mien-cua-ban.vn {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:8087
	}
	handle {
		respond "BeeOps API đang chạy." 200
	}
	@uploads path /uploads/*
	respond @uploads 404
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		-Server
	}
}
```

Rồi nạp lại cấu hình — **`reload` chứ không `restart`**, để không ngắt các site
đang phục vụ:

```bash
caddy validate --config /etc/caddy/Caddyfile      # kiểm tra TRƯỚC
systemctl reload caddy
systemctl status caddy --no-pager | head -5
```

Từ đây, mọi lệnh trong tài liệu này thay `-f docker-compose.prod.yml` bằng
`-f docker-compose.vm.yml`.

---

## 5. Khởi động

```bash
cd /srv/beeops
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Lần build đầu mất 3–5 phút. Chờ `db` và `api` đều `healthy`.

### Nạp schema và danh mục (chỉ làm một lần)

Schema nằm ở **hai** file chạy liên tiếp — tách đôi thuần túy vì độ dài, thiếu file
thứ hai là thiếu hẳn bảng báo giá và mốc tiến độ:

```bash
for f in db/schema.sql db/schema-flow.sql db/seed.sql \
         db/migrations/003-service-fields-seed.sql; do
  docker compose -f docker-compose.prod.yml exec -T db \
    psql -U beeops -d beeops -v ON_ERROR_STOP=1 < "$f"
done
```

`003-service-fields-seed.sql` nạp bộ ô nhập riêng mặc định của 10 dịch vụ; bỏ qua thì
form tạo đơn chỉ còn khối thông số hàng hóa chung.

Kiểm tra:

```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U beeops -d beeops -c "\dt"                       # phải có 10 bảng
docker compose -f docker-compose.prod.yml exec db \
  psql -U beeops -d beeops -c "SELECT current_setting('TimeZone'), current_date;"
curl -fsS https://bee-trans-api.ketnoivantai.com/api/health
```

---

## 6. Việc BẮT BUỘC ngay sau khi chạy được

**1. Đổi mật khẩu Admin.** Tài khoản khởi tạo là
`admin@beetransportation.vn` / `123456` — mật khẩu này nằm công khai trong
`db/seed.sql` và trong tài liệu này.

```bash
curl -X POST https://bee-trans-api.ketnoivantai.com/api/auth/login \
  -H 'Content-Type: application/json' -c /tmp/c.txt \
  -d '{"email":"admin@beetransportation.vn","password":"BeeOps@2026"}'

curl -X POST https://bee-trans-api.ketnoivantai.com/api/auth/change-password \
  -H 'Content-Type: application/json' -b /tmp/c.txt \
  -d '{"currentPassword":"123456","newPassword":"<mật khẩu mạnh>"}'
rm /tmp/c.txt
```

**2. Tắt Swagger nếu không muốn phơi mô tả API.** Mặc định `/api/docs` mở cho mọi
người. Chặn ở Caddy:

```
@docs path /api/docs*
respond @docs 404
```

**3. Dựng tổ chức** theo thứ tự: phòng ban → nhân viên → ma trận định tuyến
(phòng nào phụ trách dịch vụ nào). Chưa cấu hình định tuyến thì mọi đơn rơi vào
hàng đợi "Chưa định tuyến".

```bash
curl -s https://.../api/services/unrouted -b cookie   # phải trả về rỗng
```

**4. Bật sao lưu** — xem §8.

---

## 7. Múi giờ — chỗ sai thì hỏng mã đơn

`current_date` của PostgreSQL quyết định ngày trong mã đơn `DOM-20260821-003`,
cột `orders.order_day`, và mốc chia kỳ của dashboard.

Container mặc định chạy **UTC**. Để nguyên thì đơn tạo lúc **00:00–07:00 giờ Việt
Nam mang mã của hôm trước**, và doanh thu lệch ở ranh giới cuối tháng. Lỗi chỉ
xuất hiện 7 giờ mỗi ngày nên rất khó phát hiện.

Đã đặt ở **ba** chỗ, giữ nguyên cả ba:

| Chỗ | Giá trị |
|---|---|
| `docker-compose.prod.yml` → db | `TZ` và `PGTZ` = `Asia/Ho_Chi_Minh` |
| `docker-compose.prod.yml` → api | `TZ=Asia/Ho_Chi_Minh` |
| `DATABASE_URL` | `options=-c timezone=Asia/Ho_Chi_Minh` |

Kiểm tra sau mỗi lần đổi hạ tầng:

```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U beeops -d beeops -tAc "SELECT current_setting('TimeZone'), current_date"
```

---

## 8. Sao lưu

```bash
sudo mkdir -p /srv/backup/beeops && sudo chown "$USER":"$USER" /srv/backup/beeops
crontab -e
```

```cron
0 2 * * * cd /srv/beeops && ./deploy/backup.sh >> /var/log/beeops-backup.log 2>&1
```

Dùng `docker-compose.vm.yml` (VM đã có proxy sẵn — xem §4b) thì thêm biến vào dòng cron:

```cron
0 2 * * * cd /srv/beeops && COMPOSE_FILE=docker-compose.vm.yml ./deploy/backup.sh >> /var/log/beeops-backup.log 2>&1
```

Nếu clone từ Windows, bit thực thi có thể mất — `chmod +x deploy/*.sh` một lần.

Script sao lưu **cả DB lẫn thư mục `uploads`** — mất file đính kèm cũng nghiêm
trọng như mất dữ liệu, vì DB chỉ giữ metadata còn file nằm trên đĩa.

### Diễn tập khôi phục — làm TRƯỚC golive

Backup chưa từng restore là backup chưa tồn tại. Chạy thử trên một VM khác:

```bash
./deploy/restore.sh /srv/backup/beeops/db-2026-08-22-0200.dump
tar xzf /srv/backup/beeops/uploads-2026-08-22-0200.tgz -C /srv/beeops
curl -fsS http://127.0.0.1/api/health
```

Nên đẩy bản sao lưu sang nơi khác (S3, ổ cứng khác, máy khác). Backup nằm cùng
VM với dữ liệu thì hỏng đĩa là mất cả hai.

---

## 9. Vận hành hằng ngày

```bash
cd /srv/beeops

docker compose -f docker-compose.prod.yml ps                  # trạng thái
docker compose -f docker-compose.prod.yml logs -f api         # log API
docker compose -f docker-compose.prod.yml logs --tail=100 db
docker compose -f docker-compose.prod.yml restart api
```

### Cập nhật phiên bản

```bash
cd /srv/beeops
./deploy/backup.sh                                   # sao lưu TRƯỚC
git pull
docker compose -f docker-compose.prod.yml up -d --build api
docker compose -f docker-compose.prod.yml logs -f api
```

Nếu bản mới đổi schema, chạy file migration SQL kèm theo **trước** khi khởi động
API mới. Dữ liệu và ảnh không mất vì nằm trong volume `pgdata` và thư mục `uploads`.

### Quay lui

```bash
git checkout <commit-cũ>
docker compose -f docker-compose.prod.yml up -d --build api
```

---

## 10. Golive

Đặc tả chốt: **không nhập dữ liệu cũ**. Đơn đang chạy hoàn tất theo cách cũ, hệ
thống bắt đầu với đơn mới.

Danh sách kiểm tra trước khi mở cho người dùng:

- [ ] `curl https://.../api/health` trả `db: up`
- [ ] `current_setting('TimeZone')` = `Asia/Ho_Chi_Minh`
- [ ] Đã đổi mật khẩu Admin
- [ ] `JWT_SECRET`, `COOKIE_SECRET`, `DB_PASSWORD` đều là chuỗi ngẫu nhiên, không phải giá trị mẫu
- [ ] `COOKIE_SECURE=true` và trang chạy HTTPS
- [ ] `FRONTEND_ORIGIN` đúng tên miền thật (sai thì trình duyệt chặn CORS, không đăng nhập được).
      Nhiều tên miền thì ngăn cách bằng dấu phẩy, không có khoảng trắng thừa.
- [ ] SMTP thật — thử tạo một đơn và xác nhận email tới nơi
- [ ] `GET /api/services/unrouted` trả rỗng
- [ ] Đã tạo đủ phòng ban, nhân viên, ma trận định tuyến
- [ ] Cron sao lưu chạy, và **đã diễn tập khôi phục thành công**
- [ ] `ufw status` chỉ mở 22 (giới hạn IP), 80, 443
- [ ] `chmod 600 .env`
- [ ] Đã cân nhắc chặn `/api/docs`

---

## 11. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| API `unhealthy`, log `Can't reach database` | Sai `DATABASE_URL` — host phải là `db`, không phải `localhost` |
| Đăng nhập được nhưng request sau trả 401 | `COOKIE_SECURE=true` mà truy cập qua HTTP, trình duyệt không gửi cookie |
| Trình duyệt báo lỗi CORS | `FRONTEND_ORIGIN` không khớp chính xác tên miền (kể cả `https://` và cổng). Nhiều origin thì ngăn cách bằng dấu phẩy |
| Mã đơn sai ngày | Múi giờ — xem §7 |
| Caddy không xin được chứng chỉ | DNS chưa trỏ đúng, hoặc cổng 80/443 bị tường lửa chặn |
| Log đầy `getaddrinfo smtp...` | SMTP sai hoặc VM bị chặn cổng 587 ra ngoài |
| Tạo đơn trả 500 khi nhiều người bấm cùng lúc | Tăng `connection_limit` trong `DATABASE_URL` |
| Đĩa đầy | `docker system prune -af` và kiểm tra `/srv/backup` |

Xem lỗi gần nhất:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 api | grep -i error
```

---

## 12. CI/CD

**CI** (`.github/workflows/ci.yml`) chạy trên mọi push và pull request vào `main`:
lint → kiểm tra kiểu → giới hạn 300 dòng/file → unit test → build → dựng PostgreSQL
thật, nạp `schema.sql` + `seed.sql`, khởi động API rồi chạy cả ba bộ smoke test
nghiệp vụ. Container Postgres của CI đặt `TZ=Asia/Ho_Chi_Minh` giống máy chủ thật —
để UTC thì test múi giờ sẽ xanh ở CI nhưng đỏ ngoài production.

**CD** (`.github/workflows/deploy.yml`) chạy sau khi CI xanh: SSH vào máy chủ và gọi
`deploy/ci-deploy.sh`. Script đó sao lưu trước, `git reset --hard origin/main`, build
lại, chờ health check, và **tự quay lui về commit cũ nếu health check không qua**.

### Vì sao máy chủ KHÔNG kéo mã nguồn từ GitHub

Cách thông thường là để máy chủ `git pull`, xác thực bằng **deploy key** (chỉ đọc, chỉ
một repo). Nhưng tổ chức có thể tắt Deploy keys ở cấp policy — khi đó chỉ còn:

| Cách | Vấn đề |
|---|---|
| Khóa SSH cá nhân trên máy chủ | Khóa đó có quyền như chính người dùng, đọc **và ghi** mọi repo họ truy cập được |
| Personal access token | Hết hạn, và CD sẽ đỏ ở `git fetch` mà không rõ lý do |
| GitHub App | Đúng bài nhưng nặng cho một VM |

Nên CD ở đây **gửi thẳng mã nguồn qua chính kết nối SSH** dưới dạng `tar.gz` trên
stdin. Máy chủ không giữ bất kỳ thông tin xác thực nào với GitHub, và không cần
`.git` trong thư mục triển khai.

### Cài đặt một lần

**1. Đưa mã nguồn lên máy chủ lần đầu** (chỉ lần này mới cần tài khoản GitHub — sau
đó CD tự lo):

```bash
mkdir -p /srv/beeops && cd /srv/beeops
# clone bằng token dùng một lần rồi thu hồi, hoặc chép tay bằng scp
```

**2. Khóa để GitHub Actions vào máy chủ:**

```bash
ssh-keygen -t ed25519 -N '' -q -f /root/.ssh/beeops_ci -C 'beeops-github-actions'
chmod +x /srv/beeops/deploy/*.sh
printf 'command="/srv/beeops/deploy/ci-deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding %s\n' "$(cat /root/.ssh/beeops_ci.pub)" >> /root/.ssh/authorized_keys
ssh-keygen -lf /root/.ssh/beeops_ci.pub     # vân tay, đối chiếu với log CI
cat /root/.ssh/beeops_ci                    # copy TOÀN BỘ, kể cả BEGIN/END
rm -f /root/.ssh/beeops_ci                  # xóa khóa riêng sau khi đã copy
```

`command="..."` là phần quan trọng nhất: khóa này **chỉ chạy được đúng script triển
khai**, không mở được shell, không forward port. Máy chủ có thể đang chạy dịch vụ của
dự án khác — đừng cấp SSH toàn quyền cho CI.

**3. Cài rsync** để bản mới không để lại file rác của bản cũ:

```bash
apt-get update -qq && apt-get install -y -qq rsync
```

**4. Khai báo secret** tại repo → Settings → Secrets and variables → Actions:

| Secret | Giá trị |
|---|---|
| `VM_HOST` | IP hoặc tên miền máy chủ |
| `VM_USER` | `root` (hoặc user triển khai) |
| `VM_SSH_KEY` | Nội dung `beeops_ci` vừa copy |
| `VM_PORT` | Cổng SSH, bỏ trống nếu là 22 |

**5. Thử tay trước khi tin vào tự động** — GitHub → Actions → Deploy → Run workflow.

### Những gì CD giữ nguyên trên máy chủ

Gói gửi sang **không chứa** `.env`, `uploads/`, `node_modules/`, `dist/`, `.git/`.
`rsync --delete` cũng loại trừ đúng những thứ đó. Nghĩa là cấu hình và file đính kèm
của máy chủ không bao giờ bị bản triển khai ghi đè.

### Kiểm tra forced command có hiệu lực

Từ máy khác, thử mở shell bằng key CI — phải bị từ chối, chỉ chạy script:

```bash
ssh -i beeops_ci root@<VM_HOST> 'whoami'    # vẫn chạy ci-deploy.sh, không phải whoami
```

### Quay lui thủ công

```bash
cd /srv/beeops && git reset --hard <commit-cũ> && docker compose -f docker-compose.vm.yml up -d --build api
```
