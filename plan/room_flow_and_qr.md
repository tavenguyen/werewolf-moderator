# Kế hoạch chi tiết: Hệ thống Tạo phòng, Vào phòng, Xử lý lỗi & Mã QR (Cập nhật chuẩn Production)

> **Tài liệu tham chiếu nguồn sự thật**: `IDEA.md`, `plan/phase_2.md`, `plan/phase_3.md`  
> **Trọng tâm**: Chuẩn hóa trải nghiệm vào bàn/lập bàn, loại bỏ hoàn toàn giá trị demo/legacy, ràng buộc logic vai trò Host theo chế độ thiết bị, xử lý cold start máy chủ miễn phí, quản lý hạn session 3 giờ, và đảm bảo mã QR quét được 100% trên camera thật.

---

## 1. Hiện trạng & Các vấn đề cần giải quyết

### 1.1. Vấn đề Tên hiển thị mặc định (`nickname`)
* **Nguyên nhân**: Ở các phiên bản trước, chuỗi `'Minh Khang'` từng được hardcode làm giá trị khởi tạo và được lưu vào `localStorage.getItem('werewolf_nickname')`. Do đó, nếu trình duyệt người dùng đã từng mở ứng dụng, giá trị này vẫn tồn tại trong bộ nhớ `localStorage`.
* **Giải pháp**:
  * Viết hàm sanitize khởi tạo: Nếu giá trị đọc được từ `localStorage` là `'Minh Khang'` (chuỗi demo cũ), tự động xóa bỏ (`removeItem`) và khởi tạo `nickname = ''` hoàn toàn trống.
  * Cả hai modal (Vào bàn & Lập bàn) đều dùng placeholder trực quan: `"Tên của bạn"`.

### 1.2. Vấn đề Nút "Khôi phục ván chơi" & Quản lý Hạn phòng 3 Giờ
* **Nguyên nhân**:
  1. Nút khôi phục đang được hiển thị cố định trong modal Vào bàn mà không kiểm tra xem người dùng có phiên chơi hợp lệ nào hay không.
  2. Phiên cũ từ hôm trước hoặc khi server restart/idle xóa phòng (sau 3 giờ) vẫn còn object trong `localStorage`, khiến nút khôi phục vẫn hiện và khi bấm vào sẽ báo lỗi.
* **Giải pháp**:
  * Lưu kèm trường `expiresAt: Date.now() + 3 * 60 * 60 * 1000` (+3 giờ) vào `werewolf_socket_session` và `werewolf_local_game_session`.
  * Xây dựng hàm kiểm tra `hasRecoverableSession()`:
    * Kiểm tra object phiên trong `localStorage`.
    * Nếu `Date.now() > session.expiresAt`: Tự động gọi `clearStoredSession()` và trả về `false`.
    * Chỉ render nút **"Khôi phục ván chơi dở gần nhất"** khi `hasRecoverableSession() === true`.
  * **Tự dọn session hỏng (Dead Session Cleanup)**: Khi người dùng bấm Khôi phục, nếu server trả về `ROOM_NOT_FOUND` hoặc `INVALID_TOKEN` (phòng đã bị xóa hoặc server restart), adapter tự động xóa session cũ khỏi `localStorage`, ẩn ngay nút Khôi phục và báo rõ: *"Bàn chơi cũ đã kết thúc hoặc không còn tồn tại."*.

### 1.3. Vấn đề Ràng buộc Vai trò Host khi chọn "1 máy dùng chung"
* **Yêu cầu nghiệp vụ**: Khi chọn option **"1 máy dùng chung"** (`deviceSelection === 'shared'`), thiết bị này được đặt cố định ở giữa bàn để làm bảng điều khiển, phát loa hiệu lệnh và ghi nhận kết quả cho cả làng. Do đó:
  * **Vai trò Quản trò BẮT BUỘC AUTO là "Bảng trung tâm"** (`hostRoleSelection = 'board'`).
  * **Vô hiệu hóa (Disable)** lựa chọn "Host kiêm Người chơi" và hiển thị chú thích rõ ràng: *"Chế độ 1 máy dùng chung cố định thiết bị làm Bảng trung tâm điều khiển và phát loa cho cả làng"*.
  * **Ẩn ô nhập "Tên hiển thị của Host"** vì Bảng trung tâm không phải là một ghế người chơi (danh sách người chơi sẽ được tạo và nhập trực tiếp trong Lobby offline).

### 1.4. Xử lý Cold Start máy chủ miễn phí (Render / Railway) & Timeout thông minh
* **Vấn đề**: Các nền tảng deploy backend miễn phí (như Render free tier) sẽ đưa server vào trạng thái ngủ khi rảnh và mất 20–40 giây để khởi động lại (cold start). Timeout ngắn (3–4s) sẽ khiến người dùng đầu tiên luôn bị báo lỗi giả *"Không thể kết nối đến máy chủ"*.
* **Giải pháp**:
  * **Wake-up Ping ngầm**: Ngay khi người dùng vừa mở `HomeScreen`, kích hoạt một request ngầm `fetch(serverUrl + '/health', { mode: 'no-cors' }).catch(...)` để đánh thức server trước trong lúc người dùng đang đọc màn hình hoặc gõ tên.
  * **Progressive Timeout (15s)**: Tăng timeout trong `emitWithAck` lên 15 giây. Sau 3.5 giây nếu socket vẫn đang kết nối, cập nhật trạng thái UI hiển thị: *"Đang đánh thức máy chủ, vui lòng đợi trong giây lát..."*.

### 1.5. Dọn sạch Query Param URL sau khi đọc `?room=`
* **Vấn đề**: Khi người dùng quét QR vào URL `https://origin/?room=7290`, nếu không dọn query param thì mỗi lần người dùng F5 hoặc bấm rời phòng ra Home sẽ lại bị tự động bật modal vào phòng `7290`.
* **Giải pháp**:
  * Ngay sau khi đọc và lưu `queryRoom` vào `roomCode`, gọi ngay:
    ```typescript
    window.history.replaceState({}, document.title, window.location.pathname);
    ```
    để URL trên thanh địa chỉ trở lại sạch sẽ (`https://origin/`).

### 1.6. Đảm bảo Mã QR quét được 100% bằng Camera thật
* **Vấn đề**: Thuật toán sinh QR tự viết tay rất dễ mắc lỗi ở ma trận sửa lỗi Reed-Solomon hoặc format mask khiến camera điện thoại không nhận diện được mã.
* **Giải pháp**:
  * Tích hợp thư viện chuẩn công nghiệp `qrcode` (chạy 100% offline trên trình duyệt, không cần backend, rất nhẹ, tạo SVG chuẩn tuyệt đối).
  * Kiểm chứng camera thật trên cả iOS (Camera mặc định / Zalo) và Android.

---

## 2. Kiến trúc & Thiết kế chi tiết

### 2.1. Ma trận Ràng buộc Tạo phòng (Room Creation Matrix)

| Chế độ thiết bị (`deviceSelection`) | Vai trò Quản trò khả dụng (`hostRoleSelection`) | Giá trị mặc định | Ô nhập tên Host | Hành vi khi chuyển chế độ |
| :--- | :--- | :--- | :--- | :--- |
| **1 máy dùng chung** (`shared`) | **Chỉ "Bảng trung tâm"** (Khóa lựa chọn Kiêm người chơi) | `board` (Auto) | **Ẩn** | Nếu đang chọn `player`, tự động chuyển sang `board` và khóa nút `player`. |
| **Mỗi người 1 máy** (`multi`) | **Cả 2**: "Host kiêm Người chơi" hoặc "Bảng trung tâm" | `player` (Gợi ý) | **Hiện khi chọn `player`**; Ẩn khi chọn `board` | Cho phép tự do chuyển đổi giữa 2 vai trò. |

### 2.2. Kiểm tra & Xử lý toàn diện lỗi Vào phòng (Join Room Error Flow)

```
[Người chơi nhập mã 4 số + Tên]
               │
               ▼
       [Validate Client]
       ├── Mã phòng đủ 4 số? ──(Sai)──> Báo: "Vui lòng nhập đủ 4 chữ số mã bàn."
       └── Tên không để trống? ──(Sai)──> Báo: "Vui lòng nhập tên của bạn."
               │ (Đúng)
               ▼
    [Gửi room:join lên Server]
    (Timeout tối đa 15s; sau 3.5s hiện: "Đang đánh thức máy chủ...")
               │
       ┌───────┴────────────────────────┐
       ▼                                ▼
   [Thành công]                     [Bị từ chối]
       │                                │
       ▼                                ├── ROOM_NOT_FOUND ─────────> "Bàn chưa tồn tại hoặc đã kết thúc."
Chuyển vào Lobby                        ├── NAME_TAKEN ─────────────> "Tên [X] đã có người sử dụng trong phòng."
(Dolly-in animation)                    ├── ROOM_FULL ──────────────> "Phòng đã đủ số lượng tối đa 16 người."
                                        ├── GAME_ALREADY_STARTED ───> "Ván chơi đã bắt đầu, không thể tham gia."
                                        └── TIMEOUT / CONNECT_ERROR ─> "Không thể kết nối đến máy chủ. Vui lòng thử lại."
```

---

## 3. Danh sách các file cần triển khai

| STT | File | Nội dung thực hiện |
| :-- | :--- | :--- |
| 1 | `package.json` | Cài đặt `qrcode` và `@types/qrcode` (thư viện sinh SVG QR chuẩn offline). |
| 2 | [`src/utils/qrCodeSvg.ts`](file:///d:/Scripting/werewolf-moderator/src/utils/qrCodeSvg.ts) | Thay thế bằng implementation dùng `qrcode.toString(..., { type: 'svg' })` chạy 100% offline, đồng bộ và chuẩn 100% camera scanning. |
| 3 | [`src/adapters/socketAdapter.ts`](file:///d:/Scripting/werewolf-moderator/src/adapters/socketAdapter.ts) | - Lưu `expiresAt` (+3h) vào session storage.<br>- Thêm timeout 15s với progressive status.<br>- Tự động xóa session khi resume nhận `ROOM_NOT_FOUND` hoặc `INVALID_TOKEN`. |
| 4 | [`src/adapters/localEngineAdapter.ts`](file:///d:/Scripting/werewolf-moderator/src/adapters/localEngineAdapter.ts) | - Lưu `expiresAt` (+3h) vào local session storage. |
| 5 | [`src/screens/home/HomeScreen.tsx`](file:///d:/Scripting/werewolf-moderator/src/screens/home/HomeScreen.tsx) | - Xóa sạch legacy `'Minh Khang'` trong `localStorage`.<br>- Thêm hàm `hasRecoverableSession()` để ẩn/hiện nút khôi phục.<br>- Wake-up ping ngầm `/health` khi mount.<br>- Ràng buộc `deviceSelection === 'shared'` thì auto `hostRoleSelection = 'board'`, disable lựa chọn `player`.<br>- Dọn URL query param bằng `window.history.replaceState`. |
| 6 | [`src/screens/home/home.css`](file:///d:/Scripting/werewolf-moderator/src/screens/home/home.css) | - Styling disabled/locked cho nút "Host kiêm Người chơi" khi ở chế độ 1 máy kèm chú thích rõ ràng. |
| 7 | [`src/screens/lobby/LobbyScreen.tsx`](file:///d:/Scripting/werewolf-moderator/src/screens/lobby/LobbyScreen.tsx) | - Cập nhật mã QR SVG mới.<br>- Thêm nút "Sao chép link mời" (Copy Link). |
| 8 | [`src/screens/host/HostScreen.tsx`](file:///d:/Scripting/werewolf-moderator/src/screens/host/HostScreen.tsx) | - Cập nhật mã QR SVG mới và nút copy link mời. |
| 9 | Unit Tests | - Cập nhật tests cho `socketAdapter`, `localEngineAdapter`, `qrCodeSvg`, `HomeScreen`. |

---

## 4. Kế hoạch triển khai & Tiêu chí nghiệm thu (Acceptance Criteria)

- [ ] **AC-1 (Tên sạch)**: Ô Tên hiển thị luôn trống, không còn bất kỳ dấu vết nào của `'Minh Khang'`.
- [ ] **AC-2 (Nút khôi phục thông minh)**: Nút "Khôi phục ván chơi dở gần nhất" chỉ hiện khi có session hợp lệ còn hạn (< 3 giờ). Nếu bấm khôi phục mà phòng không còn tồn tại, session tự động bị xóa và nút tự biến mất.
- [ ] **AC-3 (Ràng buộc 1 máy dùng chung)**: Chọn "1 máy dùng chung" tự động ép vai trò Host về "Bảng trung tâm", khóa nút "Kiêm người chơi" và ẩn ô nhập tên Host.
- [ ] **AC-4 (Xử lý Cold Start & Lỗi tức thì)**: Ping ngầm đánh thức server khi vào Home; progressive timeout thông báo rõ trạng thái nếu server đang thức giấc; hiển thị lỗi rõ ràng nếu bàn không tồn tại.
- [ ] **AC-5 (QR & Deep Link sạch URL)**: Mã QR sinh từ thư viện `qrcode` chuẩn offline quét được 100% bằng camera điện thoại thật; URL query `?room=` tự động được dọn sạch bằng `replaceState`.
- [ ] **AC-6 (Kiểm thử 100%)**: Toàn bộ unit tests vượt qua, type-check 0 lỗi, build production thành công.
