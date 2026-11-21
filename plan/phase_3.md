# Phase 3 — Nối giao diện với backend và đưa luồng chơi vào vận hành

## Mục tiêu và phạm vi

Phase này thay toàn bộ dữ liệu demo trong giao diện bằng snapshot và lệnh thực tế, đưa ứng dụng vào vận hành trọn vẹn từ tạo/vào phòng đến kết thúc ván và rematch ở cả hai chế độ:
- **Chế độ nhiều máy (`multi-device`)**: Giao tiếp thời gian thực với Server qua Socket.io ([Phase 2](file:///d:/Scripting/werewolf-moderator/plan/phase_2.md)).
- **Chế độ một máy (`single-device`)**: Chạy **100% offline trên trình duyệt** gọi trực tiếp `GameEngine` thuần ([Phase 1](file:///d:/Scripting/werewolf-moderator/plan/phase_1.md)), lưu state tạm vào `localStorage`.

> [!IMPORTANT]
> **Kiến trúc Adapter thống nhất**:
> Toàn bộ 6 màn hình UI (`HomeScreen`, `LobbyScreen`, `NightScreen`, `DayScreen`, `HostScreen`, `SummaryScreen`) tiêu thụ một giao diện chung qua hook `useGameSession`. Bên dưới hook là hai Adapter độc lập:
> - `SocketAdapter`: Kết nối Socket.io đến backend Phase 2 cho `multi-device`.
> - `LocalEngineAdapter`: Giao tiếp trực tiếp với `GameEngine` và `localStorage` cho `single-device`.
> Nhờ đó, UI không bị phân mảnh code và chế độ 1 máy hoạt động mượt mà ngay cả khi không có kết nối Internet.

## Hiện trạng đã kiểm tra

- `src/App.tsx` hiện là bộ điều hướng demo: lưu `LobbyDemoState` cục bộ và cho phép nhảy tự do giữa các màn hình.
- `src/screens/home/HomeScreen.tsx` có fallback mã phòng cứng `7290`, nickname mẫu và timer timeout giả lập. Hàm `triggerHaptic` gọi `navigator.vibrate` đang vi phạm quy tắc không rung ban đêm (cần gỡ bỏ rung trong luồng gameplay ban đêm).
- `src/screens/lobby/LobbyScreen.tsx` sinh mã QR tĩnh `7290`, preset cục bộ và nút bắt đầu chỉ chuyển route demo. Chưa đọc URL động hay hỗ trợ chia bài tự động.
- `src/screens/night/NightScreen.tsx`, `DayScreen.tsx`, `HostScreen.tsx`, `SummaryScreen.tsx` giữ danh sách người chơi, timer, kết quả và timeline trong state mock nội bộ; một số nút chỉ đổi màn hình.
- `package.json` chỉ có React và Vite scripts; chưa cài `socket.io-client`, `howler` hay `zustand`.

---

## Kế hoạch thực hiện

### 1. Kiến trúc Session Adapter cho Client (`useGameSession`)

Định nghĩa interface thống nhất `GameSessionAdapter` để 6 màn hình UI không phụ thuộc vào nguồn dữ liệu:

```typescript
export interface GameSessionState {
  roomCode: string;
  deviceMode: 'SINGLE_DEVICE' | 'MULTI_DEVICE';
  hostMode: 'CENTER_BOARD' | 'PLAYER_HOST';
  isHost: boolean;
  publicView: PublicRoomView;
  privateView?: PlayerPrivateView; // Role, skill, mục tiêu hợp lệ
  hostControls?: HostControlsState; // Pause, gia hạn, loại khẩn cấp
  isConnected: boolean;
  error?: { code: string; message: string };
}
```

1. **`SocketAdapter` (Multi-Device)**:
   - Kết nối Socket.io với backend Phase 2.
   - Nhận các projection `publicRoomView`, `playerPrivateView`, `hostBoardView`.
   - Gửi các socket event (`night:action`, `day:vote`, `host:pause`, v.v.).
   - Quản lý reconnect tự động bằng `playerToken` hoặc `hostToken` trong `localStorage`.
2. **`LocalEngineAdapter` (Single-Device)**:
   - Gọi trực tiếp các hàm pure transition của `GameEngine` Phase 1.
   - Quản lý state ván cược trong `localStorage` để chống mất dữ liệu khi F5.
   - Tự động điều phối timer cục bộ, chuyển pha và lượt gọi vai tuần tự cho máy dùng chung mà không cần bất kỳ gói tin mạng nào.

---

### 2. Vào phòng qua Deep Link URL (Không dùng Camera Scanner)

Bỏ hoàn toàn việc tích hợp thư viện quét mã qua camera (`html5-qrcode`) để tránh phình to bundle và tránh lỗi quyền camera trên iOS Safari/Chrome Android. Thay vào đó:

1. **Lobby sinh QR Deep Link động**:
   - `LobbyScreen` sinh mã QR chứa URL đầy đủ dạng: `${window.location.origin}/?room=${roomCode}`.
   - Sử dụng `window.location.origin` giúp URL tự động nhận đúng IP mạng LAN khi host chạy `npm run dev -- --host` (không bị dính `localhost` khiến điện thoại khác không vào được).
2. **Auto-fill trên `HomeScreen`**:
   - Khi người chơi quét QR bằng camera mặc định của điện thoại hoặc Zalo, trình duyệt mở trang web kèm query `?room=xxxx`.
   - `HomeScreen` tự động phân tích `URLSearchParams`, điền sẵn mã 4 số vào 4 ô nhập, autofocus vào ô `username`. Người chơi chỉ việc nhập tên và bấm "Vào phòng".
   - Vẫn giữ nguyên 4 ô nhập tay cho người chơi nghe đọc mã bằng miệng.

---

### 3. Tối ưu giao diện theo vai trò Host

Tránh bắt Host kiêm Người chơi phải bấm chuyển đổi qua lại giữa 2 màn hình riêng biệt vào ban đêm:

1. **Host Bảng Trung Tâm (Laptop / iPad / TV)**:
   - Render `HostScreen` với layout 3 cột: mã phòng/QR to, danh sách người chơi sống/chết, timeline sự kiện công khai và bảng điều khiển tổng.
   - Không chứa bất kỳ thông tin vai trò bí mật nào.
2. **Host Kiêm Người Chơi (Điện thoại cá nhân)**:
   - Render trực tiếp `NightScreen` / `DayScreen` như một người chơi bình thường (xem vai của mình, chọn mục tiêu, gửi vote).
   - Tích hợp một **Compact Host Control Bar** (thanh điều khiển thu nhỏ) ghim cố định ở cạnh trên màn hình:
     - Nút bật/tắt âm thanh (Loa).
     - Nút Tạm dừng / Tiếp tục (Pause/Resume).
     - Nút gia hạn giờ (+30s).
     - Menu thao tác nhanh: Loại khẩn cấp người chơi (`emergencyEliminate`), kết thúc ván/rematch.

---

### 4. Chi tiết luồng 6 màn hình UI

- **`HomeScreen`**:
  - Hỗ trợ chọn Chế độ (1 máy / Nhiều máy) và Vai trò Host (Bảng trung tâm / Kiêm người chơi).
  - Tự động đọc `?room=` từ URL để fill mã phòng; validation username không rỗng và không trùng tên.
- **`LobbyScreen`**:
  - Hiển thị danh sách ghế, trạng thái kết nối (`isConnected`).
  - Cấu hình Smart Preset (6–16 người) từ Phase 1.
  - Chế độ 1 máy cho phép Host chọn nhập bài giấy hoặc để máy tự chia.
- **Xem vai / Setup**:
  - Multi-device: Người chơi **nhấn giữ** (press-and-hold) để xem vai bí mật, thả tay ra màn hình lập tức che lại.
  - Single-device: Lần lượt từng người cầm máy, bấm mở vai xem trong bí mật rồi bấm "Đã xem" để chuyển máy cho người tiếp theo.
- **`NightScreen`**:
  - Sleep Overlay tối màn hình cho người chơi ngoài lượt hoặc đã gửi hành động xong.
  - **Tuyệt đối không rung**: Gỡ bỏ mọi lệnh `navigator.vibrate` trong luồng đêm để đảm bảo tính bí mật tuyệt đối.
  - Chỉ người có lượt hợp lệ mới hiện danh sách mục tiêu sống hợp lệ để chọn.
- **`DayScreen`**:
  - Hiển thị đồng hồ đếm ngược theo `deadlineAt` từ session.
  - Khóa vote 60 giây đầu tiên tính từ sau khi hoàn tất công bố chết, Hunter và Mayor.
  - Vote kín ở multi-device: Bấm xác nhận là **khóa phiếu, không cho đổi**. Kết quả công bố số phiếu từng người + tổng số phiếu trắng.
  - Vote công khai ở single-device: Host nhập trực tiếp kết quả giơ tay ngoài đời lên máy.
- **`SummaryScreen`**:
  - Chỉ mở sau khi có sự kiện `GAME_OVER`.
  - Hiển thị đầy đủ vai ban đầu, vai hiện tại, phe thắng và timeline giải mã chi tiết các đêm.
  - Nút Rematch khởi tạo ván mới sạch sẽ, giữ nguyên người chơi trong phòng.

---

### 5. Hệ thống âm thanh `AudioController` & Fallback

Quản lý âm thanh bằng **Howler.js** kết hợp cơ chế dự phòng để không làm tắc tiến độ phát triển khi chưa có đủ asset MP3:

1. **`AudioController`**:
   - Nhận bảng mapping `audioKey -> public/audio/<key>.mp3`.
   - Tự động mở khóa Autoplay Audio Context ngay lần bấm đầu tiên của Host trên giao diện (ví dụ nút "Bắt đầu ván").
   - Nhạc nền (BGM) ban đêm chạy âm lượng 20%; tự động giảm âm lượng (ducking) xuống 5% khi có voice đọc lượt gọi vai.
2. **Cơ chế Fallback (Khi thiếu file MP3 hoặc tải lỗi)**:
   - Nếu file MP3 của vai trò chưa tồn tại trong `public/audio/`:
     - **Hiển thị phụ đề câu lệnh**: Hiện rõ text câu lệnh gọi vai (ví dụ: *"Ma sói ơi, hãy thức dậy và chọn nạn nhân..."*) trên màn hình Host và Compact Control Bar để Host tự đọc bằng miệng nếu muốn.
     - **Phát Web Speech API (TTS)**: Dùng `window.speechSynthesis` đọc tự động bằng tiếng Việt với giọng mặc định của trình duyệt.
     - **Transition Chime**: Phát một tiếng chuông báo hiệu ngắn (sinh bằng Web Audio API oscillator hoặc chime có sẵn) để báo hiệu đổi lượt gọi.
   - Đảm bảo luồng chơi và timer đêm hoạt động 100% trọn vẹn mà không phụ thuộc vào việc đã thu âm đủ 40 file MP3 hay chưa.

---

### 6. Quản lý trạng thái thiết bị và PWA

1. **Screen Wake Lock API**:
   - Yêu cầu giữ sáng màn hình khi ván đấu đang diễn ra để điện thoại không tự tắt màn hình giữa đêm.
   - Tự động giải phóng Wake Lock khi kết thúc ván (`GAME_OVER`) hoặc người chơi rời phòng.
2. **Khôi phục phiên mượt mà**:
   - Khi người chơi vô tình reload trang (F5) hoặc mạng chập chờn:
     - `SocketAdapter` tự động gửi `room:resume` kèm token, server trả snapshot mới nhất và UI khôi phục ngay trạng thái màn hình tương ứng.
     - `LocalEngineAdapter` đọc state từ `localStorage` và tiếp tục ván mà không bị reset về đầu.

---

## Tiêu chí chấp nhận và Kiểm thử Phase 3

1. **Offline Single-Device**: Ngắt kết nối mạng hoàn toàn, tạo phòng 1 máy và chơi trọn vẹn một ván từ Lobby -> Đêm -> Ngày -> Treo cổ -> Game Over mà không phát sinh lỗi mạng.
2. **Deep Link QR**: Quét QR bằng camera điện thoại mở đúng link `?room=xxxx`, 4 ô mã được điền tự động, chỉ cần nhập tên là vào phòng.
3. **Host kiêm người chơi**: Điều khiển được Pause, +30s, Loa ngay trên thanh Control Bar của `NightScreen`/`DayScreen` mà không phải thoát ra màn hình khác.
4. **Không rung ban đêm**: Kiểm tra toàn bộ mã nguồn không còn `navigator.vibrate` được kích hoạt trong suốt các pha ban đêm.
5. **Fallback âm thanh**: Xóa tạm một file MP3 trong cấu hình; hệ thống vẫn chuyển lượt bình thường, hiển thị phụ đề rõ ràng và phát Web Speech API/chime thay thế.
6. **Bảo mật vai trò**: Kiểm tra F12/DevTools ở multi-device: client Dân làng tuyệt đối không nhận được thông tin ai là Sói trong `publicView` hay DOM.
