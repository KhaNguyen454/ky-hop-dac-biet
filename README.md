# Kỳ họp đặc biệt – Ai sẽ bị “bãi nhiệm”?

Trò chơi biểu quyết ôn tập **Phần III: Dân chủ xã hội chủ nghĩa và Nhà nước pháp quyền xã hội chủ nghĩa ở Việt Nam** (MLN131 – Chủ nghĩa xã hội khoa học), lớp AI1803.

Cả lớp vào cùng một phòng bằng điện thoại. Người dẫn chiếu màn hình điều khiển lên máy chiếu. Mỗi người chơi là một "đại biểu Quốc hội" và biểu quyết các dự thảo. Hệ thống lưu điểm từng người và có bảng xếp hạng để phát thưởng.

## Cách chơi (khoảng 5 phút)

| Vòng | Ai được trả lời | Điểm |
|---|---|---|
| 6 dự thảo (12 giây/câu): bấm **Tán thành** (đúng) hoặc **Không tán thành** (sai) | Đại biểu còn đương nhiệm | Đúng: +100, cộng tối đa +50 nếu trả lời nhanh. Sai hoặc không bỏ phiếu: **bị bãi nhiệm** |
| Phiên chất vấn (sau dự thảo 4, 20 giây): điền “Dân biết, dân bàn, dân làm, dân …” | Chỉ đại biểu đã bị bãi nhiệm | 3 người đúng nhanh nhất được **tái cử** (+50) |
| Phiên bỏ phiếu kín (cuối, 25 giây): chọn đúng 3 quyền | Đại biểu còn đương nhiệm | Đúng đủ 3: +200, cộng tối đa +100 thưởng tốc độ |

**Thứ tự xếp hạng:** điểm cao hơn xếp trước. Nếu bằng điểm thì người còn đương nhiệm xếp trước, sau đó đến người có tổng thời gian trả lời ngắn hơn.

Nếu **mọi đại biểu còn đương nhiệm** đều sai ở cùng một dự thảo thì chính những người đó được giữ ghế (không cộng điểm) để kỳ họp tiếp tục. Người đã bị bãi nhiệm từ các vòng trước vẫn bị bãi nhiệm, chỉ có thể quay lại qua Phiên chất vấn.

## Các trang

- `/`: người chơi. Nhập mã phòng, họ tên, MSSV. Link dạng `/?room=1234` sẽ tự điền mã phòng.
- `/host`: người dẫn. Nhập PIN rồi tạo phòng. Màn hình hiện mã QR, điều khiển từng vòng, kiểm phiếu, bảng xếp hạng trực tiếp và nút tải CSV.
- `/bang-xep-hang?room=1234`: bảng xếp hạng công khai, MSSV được che bớt.
- `/api/health`: kiểm tra nhanh sau khi deploy xem đã kết nối Redis và đã đặt PIN chưa.

## Cấu trúc mã nguồn

```
src/
├─ lib/
│  ├─ content.ts      Nội dung câu hỏi và cách tính điểm (sửa câu hỏi ở đây)
│  ├─ game.ts         Logic thuần: chấm điểm, bãi nhiệm/tái cử, xếp hạng
│  ├─ game.test.ts    Unit test (vitest)
│  ├─ room.ts         Các thao tác: tạo phòng, vào phòng, bỏ phiếu, điều khiển, bảng điểm
│  ├─ store.ts        Lưu trữ: Upstash Redis (khi có biến môi trường), không có thì dùng bộ nhớ tạm
│  ├─ http.ts         Trả lỗi thống nhất, kiểm tra PIN người dẫn
│  └─ client.ts       Phía trình duyệt: gọi API, cập nhật định kỳ, đồng hồ khớp giờ máy chủ
├─ components/ui.tsx  Giao diện dùng chung (bảng điểm, bục vinh danh, con dấu…)
└─ app/
   ├─ page.tsx                 Trang người chơi
   ├─ host/page.tsx            Trang người dẫn
   ├─ bang-xep-hang/page.tsx   Bảng xếp hạng
   └─ api/rooms/...            Các API
```

## Chạy thử trên máy

```bash
npm install
npm run dev        # http://localhost:3000, trang /host dùng PIN mặc định 1234
npm test           # chạy unit test
```

Trên máy cá nhân, nếu chưa có Redis thì dữ liệu nằm trong bộ nhớ và mất khi tắt server.

## Deploy lên Vercel

1. **Import repo:** vào [vercel.com/new](https://vercel.com/new), chọn repo này rồi bấm **Deploy**. Vercel tự nhận ra đây là Next.js, không cần chỉnh gì.
2. **Gắn Redis để lưu điểm:** vào Project → **Storage** → **Create Database**, chọn **Upstash → Upstash for Redis** (gói Free, vùng Singapore cho gần máy chủ). Chọn **Connect** vào project. Vercel sẽ tự thêm `KV_REST_API_URL` và `KV_REST_API_TOKEN`.
   - File `vercel.json` đã đặt máy chủ ở Singapore (`sin1`) để người chơi ở Việt Nam bấm phiếu nhanh hơn.
3. **Đặt PIN người dẫn:** vào Project → **Settings → Environment Variables**, thêm `HOST_PIN` (ví dụ `482615`) cho môi trường Production.
4. **Deploy lại để nhận biến mới:** vào **Deployments**, chọn bản mới nhất → **Redeploy**.
5. **Kiểm tra:** mở `https://<tên-project>.vercel.app/api/health`. Kết quả cần có `"storage":"redis"`, `"redisOk":true` và `"hostPinConfigured":true`.

Khi lên lớp:

1. Mở `https://<tên-project>.vercel.app/host` trên máy chiếu, nhập PIN và chọn **Tạo phòng mới**.
2. Các bạn quét mã QR trên màn chiếu để vào phòng.
3. Bấm **Khai mạc kỳ họp**.
4. Hệ thống tự công bố kết quả khi hết giờ hoặc khi mọi người đã bỏ phiếu. Người dẫn chỉ cần bấm **Tiếp theo**.
5. Cuối buổi bấm **Tải bảng điểm (CSV)** để lấy danh sách có đầy đủ MSSV phục vụ phát thưởng.

**Giới hạn gói miễn phí:** mỗi người chơi cập nhật trạng thái khoảng 1,2 giây một lần. Một buổi 40 người trong 5 phút tốn khoảng 30–40 nghìn lệnh Redis. Con số này nằm trong hạn mức miễn phí hằng tháng của Upstash, nhưng nên kiểm tra lại hạn mức hiện hành trên trang Upstash.

### Cách khác: deploy bằng Vercel CLI (hoặc nhờ Claude Code trên máy bạn)

Gửi prompt sau cho Claude Code trong thư mục đã clone repo:

> Đây là một app Next.js 16 (thư mục hiện tại). Hãy deploy lên Vercel bằng Vercel CLI:
> 1. Chạy `npx vercel@latest login` (tôi tự đăng nhập), rồi `npx vercel@latest link` để tạo project mới tên `ky-hop-dac-biet`.
> 2. Hướng dẫn tôi gắn Upstash for Redis vào project trong tab Storage. Nếu CLI hỗ trợ thì dùng `vercel integration add upstash`. Sau đó kiểm tra bằng `npx vercel@latest env ls` rằng đã có `KV_REST_API_URL` và `KV_REST_API_TOKEN`.
> 3. Thêm biến `HOST_PIN` cho production bằng `npx vercel@latest env add HOST_PIN production`, giá trị do tôi nhập.
> 4. Chạy `npm ci && npm test && npm run build` để chắc chắn build được, rồi `npx vercel@latest --prod`.
> 5. Mở `<url>/api/health` và xác nhận có `storage: "redis"`, `redisOk: true`, `hostPinConfigured: true`. Báo lại cho tôi link production.
> Không sửa logic game. Nếu có lỗi build thì báo lỗi và đề xuất cách sửa trước khi sửa.
