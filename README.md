# Guardian Discord Bot

Bot cộng đồng Node.js dùng chung: chủ bot host một instance và các server tự cấu hình bằng `/setup`. Có chào/tạm biệt, thiệp avatar và kiểm duyệt tự động. AI hỗ trợ tiếng Việt, tiếng Anh, tiếng Trung (giản thể và phồn thể), tiếng Pháp và tiếng Hàn. SQLite lưu cấu hình tối đa 1.000 server.

## Host bot

1. Dùng Node.js 20 trở lên, chạy `npm install`.
2. Tạo ứng dụng trong [Discord Developer Portal](https://discord.com/developers/applications). Bật **Server Members Intent** và **Message Content Intent**.
3. Cấu hình biến môi trường theo `.env.example`, tối thiểu `DISCORD_TOKEN`. Cấu hình `AI_API_KEYS` bằng danh sách khóa phân tách bởi dấu phẩy để tự chuyển khóa khi request lỗi; `AI_API_KEY` cũ vẫn hỗ trợ một khóa. Không có khóa, bộ lọc cục bộ vẫn chạy.
4. Chạy `npm start`. Khi khởi động, bot tự đăng ký lệnh slash `/setup`.
5. SQLite mặc định nằm tại `data/guardian.sqlite`. Trên hosting, gắn persistent disk/volume và đặt `DATABASE_PATH` trỏ vào đó; nếu ổ đĩa không lưu bền qua deploy/restart, cấu hình server sẽ mất.

## Cài bot vào server

Mời bot với scope **bot** và **applications.commands**, cùng quyền **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, **Manage Messages**, **Kick Members** và quyền đọc tin nhắn. Quản trị viên cần **Manage Server** để chạy `/setup`, chọn kênh chào mừng/tạm biệt, đọc điều khoản rồi bấm **Đồng ý và thiết lập**. Bot chỉ kích hoạt tính năng và lưu cấu hình sau khi xác nhận; mỗi server có thể chạy `/setup` lại để đổi kênh và xác nhận lại điều khoản.

Mỗi tin nhắn từ người dùng làm mới mốc hoạt động. Cấu hình bị xóa sau 30 ngày không có tin nhắn người dùng; cấu hình cũng bị xóa khi bot rời server. Bot không tự kick khỏi server khi hết hạn. Sau khi cấu hình hết hạn, quản trị viên có thể chạy `/setup` lại. Giới hạn 1.000 áp dụng cho server đang có cấu hình; server hết hạn được dọn định kỳ mỗi 6 giờ và lúc khởi động.

## Tùy chỉnh và kiểm duyệt

- `WELCOME_TEXT` / `GOODBYE_TEXT` nhận `{user}`, `{server}`, `{memberCount}`. `WELCOME_BACKGROUND_PATH` trỏ đến ảnh nền PNG/JPG/WebP; nếu thiếu, bot tạo nền chuyển sắc và chèn avatar tự động.
- `BLOCKED_WORDS` / `BLOCKED_DOMAINS` là danh sách phân tách bằng dấu phẩy.
- Luật cục bộ xóa tin nhắn vi phạm và kick thành viên; AI cũng chỉ xóa/kick khi kết luận vi phạm đủ ngưỡng tin cậy. Bot không ban và không gửi cảnh cáo vào kênh. Cần quyền Kick Members, Manage Messages và vai trò bot cao hơn thành viên vi phạm.
- AI mặc định dùng `qwen3.8-27b`, lấy mẫu theo `AI_SAMPLE_RATE` (mặc định 20%), gom tối đa `AI_BATCH_SIZE` tin vào mỗi request và giới hạn toàn cục một request mỗi `AI_REQUEST_INTERVAL_SECONDS` (mặc định 60 giây). Mỗi tin tối đa 400 ký tự; ảnh dùng model đọc ảnh riêng trong `AI_VISION_MODEL`. `AI_MAX_CALLS_PER_HOUR`, `AI_USER_COOLDOWN_SECONDS` và `AI_MAX_PENDING` cũng giới hạn mức sử dụng; khi thiếu khóa hoặc dịch vụ AI lỗi, luật cục bộ vẫn chạy và lỗi AI không được ghi log.

## Điều khoản và quyền riêng tư

Điều khoản cần quản trị viên chấp thuận trong `/setup`: bot lưu ID server, ID kênh, thời điểm chấp thuận và hoạt động gần nhất; cấu hình bị xóa khi hết hạn hoặc bot rời server. Nếu bật AI, tối đa 400 ký tự nội dung và ảnh được lấy mẫu có thể được gửi tới nhà cung cấp AI bên thứ ba để phân loại. AI hỗ trợ tiếng Việt, tiếng Anh, tiếng Trung (giản thể và phồn thể), tiếng Pháp và tiếng Hàn; kết quả có thể sai hoặc bỏ sót. Bộ lọc không bảo đảm hoạt động liên tục hay ngăn mọi vi phạm. Quản trị viên chịu trách nhiệm thông báo cho thành viên, kiểm tra quyết định kiểm duyệt và tuân thủ quy định áp dụng. Dịch vụ được cung cấp “nguyên trạng”; nội dung `/setup` là điều khoản cơ bản, không thay thế tư vấn pháp lý.
