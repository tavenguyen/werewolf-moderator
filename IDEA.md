# Ma Sói Host (`werewolf-moderator`) — Product Idea & Spec

## 1. Mục tiêu sản phẩm

Xây dựng một ứng dụng web giúp nhóm bạn chơi **Ma Sói trực tiếp** mà **không cần 1 người hy sinh làm quản trò**, không cần bài giấy và không cần tạo tài khoản.

* **Thêm 1 người chơi thật**: Hệ thống đảm nhận toàn bộ vai trò điều phối, phát giọng đọc, đếm giờ, ghi nhận hành động đêm và tính toán điều kiện thắng/thua.
* **Giữ trọn trải nghiệm mặt đối mặt**: Điện thoại chỉ là công cụ hỗ trợ thầm lặng vào ban đêm và chốt kết quả vào ban ngày; tuyệt đối không có khung chat trong web để tránh người chơi cắm mặt vào màn hình.
* **Không Over-engineering**: Triển khai gọn nhẹ, vào phòng trong 30 giây, không database phức tạp, dễ phát triển và bảo trì.

---

## 2. Mô hình vận hành & Thiết bị

* **Vào phòng không cần tài khoản**: Người chơi quét **QR Code** (hoặc nhập mã phòng 4 số) + nhập `username`. Hệ thống tự chặn trùng tên và lưu `playerToken` tạm vào `localStorage` để lỡ tắt màn hình hay F5 vẫn khôi phục đúng vai trò đang chơi.
* **Host linh hoạt 2 chế độ**:
  * **Host là Bảng trung tâm (Laptop / iPad / Điện thoại đặt bàn)**: Host không nhận bài, đóng vai trò màn hình hiển thị chung cho cả nhóm (QR Code, đồng hồ đếm ngược, công bố người chết, bảng giải mã cuối ván) và là thiết bị duy nhất phát âm thanh.
  * **Host kiêm Người chơi (Điện thoại)**: Phù hợp khi chỉ có điện thoại; người tạo phòng mở loa trên máy mình và vẫn được chia bài chơi bình thường như mọi người.
* **Chỉ phát Loa trung tâm, không Rung**: Điện thoại người chơi **không rung** khi tới lượt ban đêm (tránh tiếng rè trên mặt bàn làm lộ danh tính). Mọi người nhận biết lượt của mình qua giọng đọc từ thiết bị phát loa.

---

## 3. Bộ Cài Đặt Phòng (Room Settings)

Trước khi bắt đầu, người tạo phòng chọn **Smart Preset** cân bằng theo số người (kèm thanh đo cân bằng Dân – Sói) và tùy chỉnh các công tắc luật dưới đây:

| Tùy chọn | Giá trị / Mô tả | Ghi chú trải nghiệm & suy luận |
| :--- | :--- | :--- |
| **Lật vai khi chết** | Bật / Tắt | Khuyên **Tắt** để tăng đất diễn giả danh Tiên tri/Bảo vệ và suy luận. |
| **Sói bỏ qua không cắn** (`allowWolfSkip`) | Bật / Tắt | Cho phép bầy Sói chọn không giết ai trong đêm để tạo đêm bình yên giả. |
| **Sói cắn đồng đội** (`allowWolfFriendlyFire`) | Bật / Tắt | Cho phép Sói tự cắn chính mình hoặc đồng đội để đánh lạc hướng. |
| **Cơ chế Bình cứu Phù thủy** | Cứu 1 người / **Cứu tất cả (AoE)** | Bản AoE cho phép Phù thủy cứu toàn bộ nạn nhân bị bầy Sói cắn trong đêm đó (cực mạnh khi Sói con chết). |
| **Phù thủy biết nạn nhân** (`witchKnowsVictim`) | Bật / Tắt | Bật: thấy tên người đang bị cắn. Tắt: kích hoạt bình cứu mù theo phán đoán. |
| **Mất bình khi bấm cứu trượt** (`witchWasteHealOnEmpty`) | Bật / Tắt | *Chỉ hiện khi tắt "Biết nạn nhân"*: Bật (khuyên dùng) sẽ vẫn trừ bình nếu Bảo vệ đã đỡ trúng hoặc Sói bỏ cắn để giữ kín thông tin; Tắt sẽ hoàn lại bình nhưng làm lộ việc đêm đó không có ai chết do Sói. |
| **Phù thủy tự cứu** (`allowWitchSelfHeal`) | Bật / Tắt | Cho phép hoặc cấm Phù thủy dùng bình cứu cho chính mình. |
| **Hòa phiếu ban ngày** (`tieVoteMode`) | Hòa là thoát / Biện hộ 30s & Vote lại | Nếu chọn Vote lại (Runoff) mà vòng 2 vẫn hòa thì mặc định thoát án treo cổ. |
| **Góc nhìn người chết** (`ghostMode`) | Tắt mặc định | Người chết **không được xem vai trò người sống** để tránh lỡ miệng spoil. |

---

## 4. Vòng chơi & UX chống xao nhãng

### Lobby & Tái đấu
* Hiện mã QR lớn để cả bàn vào phòng nhanh.
* Nút **"Đảo bài & Chơi ván mới"** (Instant Rematch) sau khi kết thúc ván, giữ nguyên danh sách người chơi và bộ cài đặt phòng.

### Pha Đêm (Tối giản, chống lộ, giàu kịch tính)
* **Nhạc nền + Giọng đọc MP3 thu sẵn**: Nhạc nền đêm (tiếng mưa, gió rít) chạy xuyên suốt để che tiếng chạm màn hình; âm lượng nhạc nền tự giảm nhẹ khi giọng quản trò đọc lệnh.
* **Smart Fake Delay**: Hệ thống gọi đủ mọi vai trò có trong ván, kể cả vai đã chết. Dù người chơi còn sống bấm chọn ngay ở giây thứ 2 hay vai đó đã chết, hệ thống đều dùng thời gian chờ ngẫu nhiên (ví dụ 7–14 giây) rồi mới chuyển lượt để không ai đoán được tình trạng sống/chết qua tốc độ qua đêm.
* **Sleep Overlay**: Máy nào không ở trong lượt hoặc vừa thao tác xong tự động phủ màn hình đen tuyền `#000000` kèm nhắc nhở *"Hãy úp điện thoại xuống bàn"*.
* **Chống lỡ tay**: Các kỹ năng dùng 1 lần/ván yêu cầu thao tác 2 bước (*Chọn mục tiêu $\rightarrow$ Xác nhận*).

### Pha Ngày (Ép tương tác trực tiếp)
* **Eyes-Up Day Screen**: Màn hình ban ngày chỉ hiện đồng hồ đếm ngược, trạng thái sống/chết và nút Vote.
* **Khóa Vote 60 giây đầu**: Buộc cả bàn nhìn mặt nhau tranh luận trước khi được bấm vote. Hỗ trợ nút **Tạm dừng** và **+30 giây** gia hạn khi đang tranh luận cao trào.
* **Vote linh hoạt**: Hỗ trợ vote giơ tay ngoài đời (Host bấm chốt kết quả) hoặc vote kín đồng loạt trên từng điện thoại.

### Cuối ván (Post-Game Reveal)
* Hiện bảng **"Giải mã ván đấu"**: công bố vai trò thật của tất cả người chơi kèm dòng thời gian chi tiết từng đêm (Bảo vệ đỡ trúng ai, Phù thủy cứu ai, Sói có tự cắn đồng đội không) để cả nhóm bàn tán trước khi bấm chơi ván mới.

---

## 5. Quy tắc Edge Cases & Xung đột Logic

* **Bầy Sói chọn khác mục tiêu**: Chốt theo đa số; nếu hòa phiếu giữa các Sói thì hệ thống chọn ngẫu nhiên trong các mục tiêu đã được chọn. Nếu Sói cuối cùng tự cắn chính mình và không được cứu $\rightarrow$ phe Dân thắng ngay sáng hôm sau.
* **Bảo vệ**: UI tự khóa và làm mờ tên người vừa được bảo vệ đêm trước. Nếu Bảo vệ đỡ trúng 1 trong 2 nạn nhân (đêm Sói con chết), Phù thủy (khi bật chế độ biết nạn nhân) chỉ nhìn thấy người còn lại.
* **Phù thủy (AoE Heal)**:
  * Bình Độc đè lên Bình Cứu: nếu Phù thủy bấm cứu tất cả nhưng đồng thời đầu độc một trong các nạn nhân đó, nạn nhân vẫn chết vì trúng độc.
  * Xung đột cấm tự cứu: khi `allowWitchSelfHeal = false` mà Sói cắn cả Phù thủy lẫn người khác, bấm cứu tất cả chỉ cứu được người kia, còn Phù thủy vẫn chết.
  * Phạm vi cứu: bình cứu chỉ hóa giải vết cắn của bầy Sói chung (`WOLF_PACK`), không cứu nạn nhân bị Sói trắng ám sát riêng.
* **Thợ săn nổ súng vào buổi sáng**: Nếu Thợ săn chết trong đêm, hệ thống không gọi Thợ săn dậy ban đêm (tránh lộ lượt) mà chỉ bật màn hình chọn người kéo theo trong 15 giây vào buổi sáng sau khi công bố Thợ săn đã chết.
* **Chuỗi chết chùm & Kết quả Hòa (`DRAW`)**: Toàn bộ chuỗi chết kéo theo (Cặp đôi Cupid chết chùm $\rightarrow$ kích hoạt Thợ săn bắn) phải được giải quyết xong trước khi kiểm tra điều kiện thắng. Nếu hai phe chết sạch cùng lúc (ví dụ Thợ săn bị Sói cuối cắn và bắn chết ngược lại con Sói đó), hệ thống xử hòa cả làng (`DRAW`).
* **Già làng & Trưởng làng**: Nếu Già làng bị treo cổ hoặc trúng độc làm mất năng lực phe Dân, ban đêm hệ thống vẫn gọi giả vờ các vai Dân để Sói không biết. Nếu Trưởng làng (2 phiếu) chết, màn hình của họ mở 10 giây để chỉ định người kế nhiệm trước khi im lặng.
* **An toàn vận hành**: Có nút **"Loại khẩn cấp"** cho Host khi có người nghỉ giữa chừng hoặc rớt mạng hẳn; server cộng thêm 1.5–2 giây grace period khi hết giờ đêm để tránh mất thao tác ở giây cuối.

---

## 6. Định hướng Kiến trúc Công nghệ (Technology Stack)

* **Frontend**: **React + TypeScript + Vite**, **Tailwind CSS + shadcn/ui** (adaptive layout cho Mobile & Laptop), **Zustand** (state), **Howler.js** (quản lý audio & audio ducking trên iOS/Android), `qrcode.react` và **Screen Wake Lock API**.
* **Backend**: **Node.js + TypeScript + Socket.io**, lưu toàn bộ state phòng trên **RAM** (`Map<string, RoomState>`), tự động dọn phòng sau 3 giờ không hoạt động (không cần Database). Server lọc dữ liệu trước khi gửi xuống từng client để chống xem lén qua F12.
* **Game Engine**: Tách toàn bộ logic xử lý đêm/ngày và edge cases thành các hàm TypeScript thuần độc lập với Socket để dễ viết unit test bằng **Vitest**.
* **Deploy**: Frontend lên **Vercel** hoặc **Cloudflare Pages** (có sẵn HTTPS cho WakeLock & Audio); Backend lên **Render**, **Railway** hoặc **Fly.io**.
