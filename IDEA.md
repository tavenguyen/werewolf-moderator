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
* **Hai cách dùng thiết bị**:
  * **Một điện thoại dùng chung (Single-device)**: Một điện thoại tạo/điều khiển phòng và phát âm thanh; người tạo phòng vẫn là người chơi, không phải quản trò hy sinh lượt. Host nhập username của tất cả người chơi trên thiết bị này và xác nhận sơ đồ ghế. Trong phần setup đầu ván, người chơi chuyền điện thoại đúng một lần để lần lượt xem vai riêng; nếu nhóm chủ động dùng bài giấy, host có thể nhập vai đã chia thay cho thao tác chia vai số. Việc xem vai trong setup dựa trên sự tin cậy khi chuyền máy; không cam kết chống người có quyền truy cập DevTools trên thiết bị chung.
  * **Phòng nhiều điện thoại (Multi-device)**: Host tạo phòng và hiển thị QR/mã phòng; từng người chơi vào bằng điện thoại riêng. Host chọn làm bảng trung tâm không nhận vai, hoặc kiêm người chơi trên điện thoại của mình. Server chỉ gửi dữ liệu riêng tư cần thiết tới đúng client.
  * Hai cách dùng thiết bị là lựa chọn cho cả ván và không đổi giữa chừng. Số người chơi hợp lệ được tính theo người thật; thiết bị bảng trung tâm không tính là người chơi, còn host kiêm người chơi thì có.
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
* **Điện thoại dùng chung vào ban đêm**: Điện thoại luôn đặt cố định ở giữa bàn; bố cục hiển thị sơ đồ ghế vòng tròn để người chơi nhận ra vị trí của mình. Giọng đọc gọi tới vai nào thì người đó mở mắt, với tay chạm vào máy để vào lượt, tự chọn và gửi hành động rồi nhắm mắt lại. Sau khi gửi thao tác, màn hình lập tức trở về Sleep Overlay. Không chuyền điện thoại giữa người chơi vào ban đêm. Kỹ năng dùng một lần vẫn cần chọn mục tiêu rồi xác nhận; người chơi đang thức tự hoàn tất thao tác tại máy.
* **Nhiều điện thoại vào ban đêm**: Mỗi người thao tác trên điện thoại cá nhân khi được gọi; các máy ngoài lượt và máy vừa gửi thao tác đều hiện Sleep Overlay. Chỉ thiết bị host phát âm thanh.
* **Chống lỡ tay**: Các kỹ năng dùng 1 lần/ván yêu cầu thao tác 2 bước (*Chọn mục tiêu $\rightarrow$ Xác nhận*).

### Pha Ngày (Ép tương tác trực tiếp)
* **Eyes-Up Day Screen**: Màn hình ban ngày chỉ hiện đồng hồ đếm ngược, trạng thái sống/chết và nút Vote.
* **Khóa Vote 60 giây đầu**: Buộc cả bàn nhìn mặt nhau tranh luận trước khi được bấm vote. Hỗ trợ nút **Tạm dừng** và **+30 giây** gia hạn khi đang tranh luận cao trào.
* **Vote linh hoạt**: Hỗ trợ vote giơ tay ngoài đời (Host bấm chốt kết quả) hoặc vote kín đồng loạt trên từng điện thoại.
* **Thao tác công khai khi chỉ có một điện thoại**: Ban ngày điện thoại đặt giữa bàn và dùng làm bảng điều khiển chung. Host/người cầm máy ghi nhận vote giơ tay, tạm dừng hoặc gia hạn timer `+30 giây`, chốt kết quả treo cổ, và nhập lựa chọn công khai của Thợ săn khi nổ súng hoặc Trưởng làng khi truyền ngôi. Không yêu cầu người chơi chuyền máy để vote kín trong chế độ này.

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

---

## 7. Design System & Quy tắc giao diện

### Design System dùng chung

Phong cách **Modern Dark Atmospheric**: hiện đại, tối giản, gợi không khí đêm trăng bí ẩn; tránh trang trí cổ trang rườm rà. Tất cả màn hình dùng chung hệ màu, typography, khoảng cách, bo góc, viền và cách biểu thị trạng thái; không thiết kế mỗi màn như một sản phẩm riêng.

| Token | Giá trị | Công dụng |
| :--- | :--- | :--- |
| Nền chính | `#0B0E14` | Lobby, ban ngày, bảng host, tổng kết |
| Nền Sleep Overlay | `#000000` | Trạng thái ngủ và chờ lượt ban đêm |
| Surface/Card | `#161B26` | Thẻ và vùng nội dung trên màn hình thường |
| Viền card | `rgba(255,255,255,0.08)` | Viền mảnh 1px, không cạnh tranh với nội dung |
| Đỏ Sói/cảnh báo/độc/treo cổ | `#EF4444` | Trạng thái và hành động mang tính nguy hiểm |
| Chàm pha đêm | `#6366F1` | Nhãn pha đêm và điểm nhấn phụ |
| Vàng ánh trăng/timer/hành động chính | `#F59E0B` | Đồng hồ và CTA chính |
| Xanh ngọc phe Dân/bình cứu | `#10B981` | Trạng thái phe Dân và hành động cứu |

Font chữ không chân hiện đại, ưu tiên Inter hoặc Plus Jakarta Sans. Đồng hồ dùng `tabular-nums`. Nút chạm trên mobile có vùng chạm tối thiểu 48px, CTA chính hướng tới 56px. Trạng thái sống/chết, được chọn/bị khóa và phe chơi phải có nhãn hoặc icon đi kèm màu, không phân biệt bằng màu đơn lẻ. Dùng cùng quy tắc spacing, radius, icon và cấp độ chữ xuyên suốt sáu màn.

### Quy tắc độ sáng và tương phản

* **Lobby, pha ngày, bảng host và tổng kết**: chữ, icon chức năng và trạng thái phải rõ trên nền tương ứng, đáp ứng WCAG AA; chữ thường đạt tương phản tối thiểu 4.5:1 và chữ lớn 3:1.
* **Sleep Overlay và thao tác đêm**: ưu tiên không hắt sáng ra mặt người chơi. Dùng nền `#000000`, độ sáng thấp, chữ đỏ thẫm hoặc xám trầm chỉ vừa đủ đọc ở cự ly gần; không áp ngưỡng tương phản ban ngày một cách máy móc cho các màn hình này. Bù lại, dùng chữ/nút lớn, icon rõ và vị trí ổn định. Không dùng nền trắng hoặc mảng sáng lớn.
* Khi thiết kế cho đêm, xem “Hãy úp điện thoại xuống bàn” là chỉ dẫn kín đáo; giữ ở mức sáng thấp, không biến thành tiêu đề sáng nhất màn hình.

### Quy tắc giao diện cho hai chế độ thiết bị

* **Một điện thoại dùng chung**: chỉ chuyền máy lúc setup để mỗi người xem vai một lần. Từ khi bắt đầu đêm, đặt máy ở giữa bàn và giữ nguyên vị trí. Màn đêm có sơ đồ ghế vòng tròn và chỉ dẫn thao tác cho vai đang được gọi; không có luồng handoff giữa các lượt. Sau khi hành động được gửi, máy tự phủ Sleep Overlay.
* Người chơi ở chế độ một máy tự chịu trách nhiệm riêng tư vật lý khi xem vai lúc setup và khi mở mắt thao tác ban đêm. Giao diện không tuyên bố chống xem dữ liệu qua DevTools trên thiết bị chung.
* **Nhiều điện thoại**: mỗi điện thoại người chơi hiển thị góc nhìn riêng; máy host trung tâm chỉ hiển thị thông tin công khai. Nếu host kiêm người chơi, vai riêng chỉ hiện trên giao diện người chơi của host, không xuất hiện trong bảng trung tâm.
* Bố cục mobile ưu tiên một cột; lobby và bảng cài đặt chuyển thành hai cột trên laptop khi đủ chỗ. Bảng host dùng bố cục rộng ba cột và co về dạng tablet/mobile mà không mất timer hay thao tác khẩn cấp.

### Sáu màn hình chuẩn

1. **Trang chủ — Vào phòng/Tạo phòng**: thương hiệu trăng khuyết; luồng nhập mã 4 số/QR, username, tạo phòng và chọn cách dùng thiết bị.
2. **Lobby/Cài đặt phòng**: QR/mã, người chơi, kết nối, Smart Preset, thước cân bằng phe, luật phòng và trạng thái nút bắt đầu. Biến thể một máy có bước setup xem vai tuần tự; biến thể nhiều máy hỗ trợ người chơi quét mã tham gia.
3. **Pha đêm/Sleep Overlay**: trạng thái ngủ đen OLED; màn hành động chỉ mở cho lượt phù hợp. Một máy có sơ đồ ghế cố định giữa bàn; nhiều máy có lựa chọn mục tiêu trên thiết bị cá nhân. Bình dùng một lần có bước xác nhận.
4. **Pha ngày/Eyes-Up**: timer, trạng thái sống/chết và thao tác vote; giữ nguyên khóa vote 60 giây đầu kể cả khi timer pause hoặc được gia hạn. Không có chat.
5. **Bảng điều khiển Host**: danh sách người chơi, timer/pha và điều khiển, âm thanh, QR, chốt vote và loại khẩn cấp. Chỉ hiển thị thông tin công khai nếu host là bảng trung tâm.
6. **Tổng kết/Giải mã ván đấu**: banner phe thắng/hòa, vai trò, timeline đêm, rematch và rời phòng; công bố vai người sống chỉ sau khi ván kết thúc.

### Ghi chú cho giai đoạn triển khai frontend

Google Stitch tạo bố cục và hình ảnh tham khảo, không quyết định logic runtime. Khi viết code, bổ sung tên truy cập được và thao tác keyboard tương đương (Enter/Space) cho điều khiển giữ/nhấn; xác nhận UI không làm lộ dữ liệu mà server chưa cấp quyền. Không yêu cầu Stitch sinh ARIA hoặc xử lý keyboard.
