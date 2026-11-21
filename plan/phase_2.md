# Phase 2 — Backend phòng và giao tiếp thời gian thực (Multi-Device)

## Mục tiêu

Triển khai backend Node.js + TypeScript + Socket.io có thẩm quyền với vòng đời phòng, danh tính phiên, quyền truy cập, timer và phân phối state cho **chế độ nhiều máy (`multi-device`)**. Server giữ phòng trong RAM theo định hướng `IDEA.md`; mỗi lệnh client phải được xác thực trước khi gọi game engine và server chỉ gửi projection phù hợp cho từng client.

> [!IMPORTANT]
> **Tách bạch kiến trúc chế độ chơi**:
> Backend Phase 2 **chỉ phục vụ chế độ nhiều máy (`multi-device`)**. Chế độ một máy (`single-device`) chạy **100% offline trên trình duyệt** bằng chính `GameEngine` thuần từ Phase 1 (không kết nối Socket.io, không tạo phòng trên server), giữ trọn lợi thế offline và bảo mật thiết bị cục bộ.

Phase này phụ thuộc vào contract gameplay của [Phase 1](file:///d:/Scripting/werewolf-moderator/plan/phase_1.md): danh sách pha, hành động hợp lệ, đầu ra chuyển trạng thái, thời điểm chốt ngày/đêm và dữ liệu timeline. Không đưa luật vào Socket handler. Repo hiện là React/Vite: `package.json` chỉ có script `dev`, `build`, `preview`, chưa có dependency Node server/Socket.io hoặc Vitest; `vite.config.ts` chỉ cấu hình frontend. Engine hiện có `GameState`/`RoomSettings` tại `src/engine/types.ts` và các hàm điều phối trong `src/engine/gameEngine.ts`, backend sẽ gọi engine thông qua các hàm thuần (pure transition functions).

## Quyết định sản phẩm đã chốt

Dựa trên `IDEA.md` và phản hồi thiết kế, các quyết định nền tảng đã được chốt dứt khoát:

1. **Chuẩn hóa `username` & Tên Host**: Kiểm tra trùng tên người chơi bằng `trim().toLowerCase()` (giữ nguyên chữ hoa/thường gốc lúc hiển thị).
   - **Host làm Bảng trung tâm**: Tạo phòng không cần nhập username, không tham gia chơi, không nhận role.
   - **Host kiêm Người chơi**: Bắt buộc nhập username, có ghế trong bàn và nhận role bình thường.
2. **Host disconnect & Quyền phòng**: Giữ quyền Host liên tục cho tới khi phòng tự hủy sau 3 giờ idle; Host reconnect bằng `hostToken` lưu trong `localStorage`. Chưa cần tính năng chuyển quyền Host giữa ván ở MVP.
3. **Player disconnect giữa ván**: Giữ nguyên ghế trong state để người chơi có thể vào lại bất cứ lúc nào bằng `playerToken` (vẫn tính là mục tiêu hợp lệ để bị cắn/treo cổ; khi tally vote tính là abstain). Nếu nghỉ hẳn thì Host dùng nút **Loại khẩn cấp** (`emergencyEliminate`). Người đã chết disconnect không ảnh hưởng tới tiến trình ván.
4. **Xem lại vai & Rematch**:
   - Người chơi ở `multi-device` được **nhấn giữ** (press-and-hold) để xem lại vai của mình bất cứ lúc nào (trừ khi đã chết và phòng tắt ghost mode).
   - Khi **Rematch**, giữ nguyên `playerToken` và `playerId` của người chơi trong phòng, chỉ tăng `gameGeneration` và server tự chia lại bài mới.
   - Không hỗ trợ đổi sang trình duyệt/máy khác giữa ván.
5. **Vote kín**: **Không cho đổi phiếu** sau khi đã bấm Xác nhận. Khi chốt kết quả, server công bố **số phiếu của từng người bị vote + tổng số phiếu trắng (Abstain)**, tuyệt đối không lộ danh tính ai bầu cho ai.
6. **Grace period cuối lượt đêm**: Server tự cộng ngầm **+1 giây** so với deadline hiển thị trên client (ví dụ client đếm 12s, server đợi tới 13s mới chốt) để bù trễ mạng (network jitter). Không hiển thị grace period ra UI để tránh tạo cảm giác lag.
7. **Phân chia role ở multi-device**: Chế độ nhiều máy luôn do **server tự chia bài ngẫu nhiên** dựa trên Smart Preset; **không hỗ trợ nhập bài giấy ở chế độ nhiều máy** (nhập role giấy chỉ áp dụng cho chế độ 1 máy local ở Frontend).

## Kết quả cần đạt

- Tạo, tham gia, khôi phục và rời phòng bằng Socket.io; mã phòng gồm đúng 4 chữ số và duy nhất trong các phòng đang hoạt động.
- Backend chuyên biệt cho `multi-device` (không quản lý `single-device`).
- Phân biệt host bảng trung tâm (không cần username, không role) và host kiêm người chơi (cần username, nhận role).
- Giữ state phòng trong `Map<string, RoomState>` trên một tiến trình, dọn phòng sau 3 giờ không hoạt động.
- Xử lý race condition bằng **Room Command Queue** kết hợp kiểm tra trạng thái trong Engine (`đã vote chưa`, `đã gửi action lượt này chưa`); không cần bộ nhớ đệm cache `commandId`.
- Timer và chuyển pha do server quyết định; server cộng ngầm +1s grace period so với client deadline; reconnect nhận state snapshot mới nhất theo quyền.
- Xác thực quyền cho mọi lệnh; không phát role, hành động riêng, vote kín hoặc thông tin chưa được phép tới sai client.
- Trả lỗi có mã ổn định, không ghi token hoặc thông tin role riêng vào log.
- Giới hạn phòng 6–16 người và chỉ cho start với role MVP được đánh dấu `implementedInEngine: true`.

## Việc cần làm

### 1. Chốt ranh giới runtime và package

1. Tạo entry point backend TypeScript riêng (`src/server/index.ts`), tách khỏi bundle frontend Vite. Chọn cấu hình build/dev đơn giản tương thích với `type: module`; cập nhật `package.json`, tsconfig và script chạy dev/build backend (`server:dev`, `server:build`).
2. Thêm dependency runtime tối thiểu: Node HTTP, Socket.io (`socket.io`), và Vitest cho testing. Không thêm DB hoặc framework nặng.
3. Cấu hình origin frontend (CORS), port và giới hạn payload qua biến môi trường (`PORT`, `CORS_ORIGIN`); không hardcode secret hay URL production.
4. Chia sẻ engine thuần từ `src/engine` và types gameplay dùng chung. Backend không import bất kỳ module UI/DOM nào từ `src/screens` hay `src/components`.

### 2. Mô hình phòng và vòng đời

Tạo service quản lý phòng với `RoomState` lưu trong RAM (`Map<string, RoomState>`):

- `roomCode` (4 chữ số ngẫu nhiên không trùng lặp), `createdAt`, `lastActivityAt`, `gameGeneration`.
- `host`: `hostToken` (CSPRNG), `socketId`, cờ `isPlayer` (host kiêm người chơi hay chỉ là bảng trung tâm).
- `players`: `Map<PlayerId, RoomPlayer>` gồm `playerId`, `username`, `playerToken` (CSPRNG), `socketId`, `seatNumber`, `isAlive`, `isConnected`.
- `gameState`: Trạng thái ván từ Engine Phase 1 (`GameState`).
- `timers`: `deadlineAt` (thời điểm client hết giờ), `serverCutoffAt` (thời điểm server chốt = `deadlineAt + 1000ms`), trạng thái pause, số lần gia hạn `+30s` trong ngày (tối đa 2 lần).

Thao tác vòng đời:
- **Tạo phòng**: Host tạo phòng 4 số, nhận `hostToken` (lưu `localStorage`). Nếu host kiêm người chơi, cấp thêm ghế và `playerToken`.
- **Tham gia**: Player nhập room code và username. Server kiểm tra trùng tên bằng `trim().toLowerCase()`. Nếu hợp lệ, cấp `playerId` và `playerToken`.
- **Reconnect**: Gửi `playerToken` hoặc `hostToken`, server cập nhật `socketId` mới và gửi projection snapshot mới nhất.
- **Disconnect**: Đánh dấu `isConnected = false`, giữ nguyên ghế. Player reconnect khôi phục phiên; nếu nghỉ hẳn, Host dùng nút Loại khẩn cấp.
- **Cleanup**: Định kỳ quét phòng idle quá 3 giờ (`now - lastActivityAt > 3h`) để giải phóng RAM và hủy timers.

### 3. Danh tính và bảo mật phiên

1. `playerToken` và `hostToken` là các chuỗi ngẫu nhiên sinh bằng `crypto.randomBytes` (CSPRNG), opaque và không thể đoán. Không dùng username hay room code làm credential.
2. Token lưu tại `localStorage` của client. Server chỉ chấp nhận token qua handshake socket hoặc event resume/auth.
3. Khi reconnect, server xác minh token hợp lệ và room còn tồn tại, hủy socket cũ nếu còn mở, gán socket mới và trả snapshot tương ứng.
4. Tuyệt đối không log token, secret, hoặc role riêng vào console log server hay error payload.
5. Khi Host thực hiện Loại khẩn cấp một player, thu hồi `playerToken` của player đó ngay lập tức. Khi đóng phòng hoặc phòng hết hạn sau 3 giờ, toàn bộ token bị hủy.

### 4. Giao thức event và xử lý đồng thời

Giao thức Socket.io hai chiều giữa Client và Server:

| Nhóm | Client gửi | Server phản hồi / phát |
|---|---|---|
| Phòng & Phiên | `room:create`, `room:join`, `room:resume`, `room:leave` | `room:created`, `room:joined`, `room:snapshot`, lỗi có mã |
| Lobby | `lobby:updateSettings`, `lobby:start` | `lobby:snapshot`, lỗi validation |
| Gameplay Đêm | `night:action` | `night:actionAck`, `game:snapshot` |
| Gameplay Ngày | `day:vote`, `day:finalizePublicVote` | `day:voteAck`, `game:snapshot`, công bố kết quả vote |
| Thao tác đặc biệt | `hunter:shot`, `mayor:transfer`, `mayor:elect` | `game:snapshot` |
| Host điều khiển | `host:pause`, `host:resume`, `host:extendTime`, `host:emergencyEliminate`, `host:rematch` | `timer:snapshot`, `game:snapshot` |

**Đơn giản hóa Idempotency & Room Command Queue**:
- Mỗi room có một hàng đợi lệnh (Room Command Queue / micro-mutex) đảm bảo các action/vote gửi đến cùng lúc được xử lý tuần tự.
- **Không dùng cache `commandId`**: Thay vì lưu cache tốn RAM, server chống double-submit bằng chính state validation trong Engine (ví dụ: người chơi đã gửi vote thì action tiếp theo bị Engine từ chối với lỗi `ALREADY_VOTED`; Phù thủy đã dùng bình cứu thì hành động cứu tiếp theo bị từ chối với lỗi `POTION_ALREADY_USED`). Lệnh trùng tự động bị loại bỏ an toàn.
- Response envelope thống nhất: `{ ok: true, data: T }` hoặc `{ ok: false, error: { code: string, message: string } }`.

### 5. Quyền và projection theo người nhận

Server không bao giờ gửi toàn bộ `RoomState` hay `GameState` xuống client. Mỗi socket chỉ nhận projection đã được lọc dữ liệu nhạy cảm:

1. `publicRoomView`: Dành cho bảng trung tâm và thông tin chung: room code, danh sách ghế (tên, sống/chết, disconnect status), phase, deadline client, các thông báo sự kiện đã công bố công khai.
2. `hostBoardView`: Dành riêng cho Host: chứa `publicRoomView` kèm theo metadata quản trị và các nút điều khiển (pause, gia hạn, loại khẩn cấp, rematch); không thấy role của người chơi sống nếu host là bảng trung tâm.
3. `playerPrivateView`: Dành riêng cho từng người chơi: role của chính mình, các mục tiêu hợp lệ cho lượt hiện hành, trạng thái kỹ năng (bình thuốc, khiên, súng...), và kết quả soi/điều tra riêng (Tiên tri, Thám tử, Cáo). Cho phép người chơi nhấn giữ để xem lại vai.
4. `deadPlayerView`: Dành cho người chơi đã chết: góc nhìn quan sát viên theo `ghostMode` (mặc định không tiết lộ role của người sống).
5. `postGameView`: Dành cho tất cả mọi người khi `GAME_OVER`: công bố toàn bộ vai trò ban đầu/hiện tại, phe thắng cuộc, và timeline chi tiết các sự kiện giải mã đêm.

### 6. Timer, chuyển pha và bù trễ mạng ngầm (+1s)

1. Server lưu `deadlineAt` theo đồng hồ server. Client nhận `deadlineAt` và chạy countdown hiển thị.
2. **Grace period ngầm (+1s)**: Server đặt mốc ngắt nhận lệnh tại `serverCutoffAt = deadlineAt + 1000ms`.
   - Khi client đếm về 0, UI client tự khóa nút bấm.
   - Các gói tin gửi ở giây cuối cùng tới server trong khoảng dôi dư +1 giây ngầm vẫn được server chấp nhận hợp lệ.
   - Khi chạm mốc `serverCutoffAt`, server khóa hoàn toàn và kích hoạt transition chuyển pha ngay lập tức. Người chơi không phải chờ đợi 2 giây "chết", loại bỏ cảm giác web bị lag.
3. Ngày thảo luận mặc định 180 giây; khóa vote 60 giây đầu tiên (tính sau khi công bố người chết, Hunter và Mayor). Host có thể bấm gia hạn `+30s` (tối đa 2 lần).
4. Đêm chạy theo `NightTurnPlan` từ Phase 1: Backend áp dụng fake delay ngẫu nhiên 7–14 giây cho từng lượt gọi (kể cả vai chết) để không làm lộ danh tính role.
5. Hunter có deadline 15 giây; truyền danh hiệu Mayor có deadline 10 giây; timeout hoặc disconnect tự động tính là bắn trượt / mất danh hiệu.

### 7. Cấu hình phòng và luật chơi

- Smart Preset chuẩn theo bảng 6–16 người đã chốt ở Phase 1.
- Server tự chia bài ngẫu nhiên khi bắt đầu ván; từ chối bắt đầu nếu số người chưa đủ hoặc role chưa được engine hỗ trợ (`implementedInEngine: false`).
- Bầu Trưởng làng (`hasMayor`): Nếu bật, Ngày 1 server tổ chức bước chốt bầu Trưởng làng trước khi mở tally vote treo cổ. Hòa thì không có Trưởng làng.
- Vote kín: Khi hết giờ hoặc mọi người đã vote xong, server tally và chỉ công bố số phiếu nhận được của từng người cùng tổng số phiếu trắng (Abstain). Không lưu hay phát danh tính ai đã vote cho ai.

### 8. Kiểm thử và tiêu chí chấp nhận

Sử dụng Vitest viết bộ unit/integration test cho backend service và socket gateway (dùng fake timers và mock sockets):

1. **Room & Token**: Tạo phòng sinh đúng 4 chữ số; reconnect bằng đúng token khôi phục đúng ghế; token sai bị từ chối; phòng idle 3 giờ tự giải phóng.
2. **Tuần tự hóa & Idempotency**: Hai lệnh gửi cùng lúc vào 1 room được queue xử lý tuần tự; lệnh bấm đúp (double-click) bị Engine từ chối do trạng thái đã cập nhật mà không gây lỗi state.
3. **Bảo mật Projection**: Tuyệt đối không phát role của người khác trong `playerPrivateView`; không lộ role trong `hostBoardView` nếu host là bảng trung tâm; không phát kết quả Tiên tri vào broadcast công khai.
4. **Bù trễ mạng ngầm (+1s)**: Lệnh gửi đến trong khoảng `deadlineAt` đến `deadlineAt + 1000ms` được chấp nhận; lệnh sau `deadlineAt + 1000ms` bị từ chối; transition diễn ra ngay lập tức tại mốc cutoff.
5. **Vote kín**: Tally vote chỉ trả về map số phiếu và count abstain; không chứa thông tin voter.
6. **Rematch**: Giữ nguyên `playerId` và `playerToken`, tăng `gameGeneration`, chia lại role mới sạch sẽ.

## Thứ tự triển khai trong phase

1. Tạo cấu trúc thư mục backend (`src/server/`), thiết lập TypeScript, script build và Vitest.
2. Định nghĩa shared socket events, payload types và error codes.
3. Viết `RoomService` quản lý `RoomState`, mã phòng 4 số, CSPRNG token, và job dọn dẹp phòng 3 giờ.
4. Triển khai projection mappers (`publicRoomView`, `playerPrivateView`, `hostBoardView`, `postGameView`).
5. Xây dựng Room Command Queue và tích hợp lệnh với `GameEngine` thuần từ Phase 1.
6. Cài đặt hệ thống Server Timer với fake delay ban đêm (7–14s) và cơ chế bù trễ ngầm +1s.
7. Triển khai Socket.io Gateway, xử lý connect/disconnect/reconnect, và các event handler.
8. Viết integration test toàn diện kiểm tra bảo mật thông tin, concurrency, và timer lifecycle.
