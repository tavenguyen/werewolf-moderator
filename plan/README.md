# Kế hoạch backend và gameplay

Tài liệu này chia lộ trình triển khai Ma Sói Host thành ba phase, dựa trên `IDEA.md` và hiện trạng repo. Đối tượng đọc là người sẽ quyết định luật còn mở và triển khai engine, server, rồi tích hợp giao diện. Đây là kế hoạch; chưa có backend Socket.io hoạt động trong codebase.

## Thứ tự thực hiện

| Phase | Phạm vi | Phụ thuộc | Kết quả chính |
|---|---|---|---|
| [Phase 1 — Gameplay engine](phase_1.md) | State machine, 16 role MVP, preset 6–16 người, đêm/ngày, vote, chuỗi chết, thắng/thua, rematch và kiểm thử | Contract gameplay đã chốt; đầu ra gồm bảng preset cụ thể | Engine TypeScript thuần có transition/action contract và test nhất quán |
| [Phase 2 — Backend phòng](phase_2.md) | Runtime Node/Socket.io, phòng RAM, token, quyền, projection, event, đồng bộ lệnh, timer và cleanup | Contract engine Phase 1; session/disconnect policy | Server có thẩm quyền, dữ liệu lọc theo người nhận, reconnect theo token |
| [Phase 3 — Tích hợp client](phase_3.md) | Thay dữ liệu demo bằng snapshot/command, xử lý kết nối, hai chế độ thiết bị, âm thanh và vận hành | Contract engine Phase 1 và giao thức/projection Phase 2 | Luồng tạo/vào phòng đến rematch dùng dữ liệu server trên các màn hiện có |

Hoàn tất các quyết định luật và giao kèo dữ liệu trước khi triển khai phần phụ thuộc. Có thể làm khung runtime backend song song với engine, nhưng không nối command gameplay vào Socket handler trước khi contract Phase 1 ổn định. Phase 3 bắt đầu khi tên event, ack/error, snapshot và quyền nhận đã được chốt.

## Hiện trạng codebase đã rà soát

- Repo là một app React + TypeScript + Vite. `package.json` có scripts `dev`, `build`, `preview`; chưa khai báo backend, Socket.io, Zustand, Howler hoặc Vitest.
- `src/engine/` đã có state, giải quyết đêm, chuỗi chết, điều kiện thắng, sơ đồ ghế và một bộ test. Test hiện import `bun:test`, trong khi repo không có script test hay khai báo Bun. Cần thống nhất runner (IDEA định hướng Vitest) trước khi mở rộng test.
- Engine hiện phụ thuộc catalog vai trò ở `src/screens/home/roles.ts`, các hàm gameplay đang mutate `GameState`, và `executeDayVote` nhận mục tiêu đã chốt thay vì tự tally phiếu. Các phase cần xử lý ranh giới này trước khi server gọi engine.
- `src/App.tsx`, `HomeScreen`, `LobbyScreen`, `NightScreen`, `DayScreen`, `HostScreen` và `SummaryScreen` hiện dựng dữ liệu/timer/action demo cục bộ. Chúng chưa giao tiếp backend; mã phòng và một số roster/kết quả đang hard-code.
- Không có cấu hình hoặc code server trong repo được rà soát. Kiến trúc phòng RAM, Socket.io, phiên token và lọc projection trong tài liệu là mục tiêu triển khai theo `IDEA.md`, không phải năng lực hiện hữu.

## Các quyết định gameplay đã chốt

- MVP có 16 role; role ngoài danh sách vẫn ở catalog nhưng được đánh dấu `implementedInEngine: false`. Bàn hỗ trợ 6–16 người với bảng Smart Preset theo từng cỡ bàn.
- Ngày thảo luận 180 giây; vote mở sau 60 giây từ lúc bắt đầu thảo luận (sau announcement), pause đóng băng toàn bộ timer, gia hạn tối đa hai lần 30 giây. Abstain/disconnect trước tally không có phiếu; hết giờ tự tally; host chỉ chốt sớm khi mọi người đủ quyền đã gửi.
- Runoff: biện hộ 30 giây, vote 20 giây vào các ứng viên đồng hạng cao nhất; hòa tiếp thì thoát án.
- Mayor là danh hiệu phụ, setting bầu mặc định tắt. Nếu bật, bầu công khai ngày đầu; hòa thì không có Mayor. Danh hiệu truyền trong 10 giây sau khi chết, nếu không thì mất đến hết ván.
- Hunter có 15 giây để chọn; timeout/disconnect là bắn trượt. Fake delay 7–14 giây/lượt thuộc backend, còn engine chỉ tạo `NightTurnPlan`.
- Witch AoE cứu cả đòn Sói đại ca thuộc `WOLF_PACK`, không cứu Sói trắng (`WHITE_WOLF`). Già làng chết bởi bất kỳ nguồn nào ngoài Sói cắn sẽ làm Dân mất năng lực.

Các chính sách vòng đời socket/token và thao tác nhập bài giấy vẫn được ghi ở Phase 2 vì chưa thuộc bộ 11 quyết định gameplay vừa chốt.

## Nguyên tắc tích hợp

- Engine quyết định luật; backend xác thực actor, tuần tự hóa lệnh và giữ room state; client hiển thị projection được cấp và gửi command.
- Không serialize `GameState` hoặc `RoomState` trực tiếp ra socket. Role, kết quả điều tra, action đêm và vote kín phải được lọc riêng theo người nhận.
- `single-device` và `multi-device` được chọn cho cả ván; dữ liệu role trên một thiết bị chung dựa vào riêng tư vật lý như `IDEA.md` nêu.
- RAM-only đồng nghĩa restart backend làm mất phòng và token; kế hoạch không hứa phục hồi sau restart hay chạy nhiều instance có state dùng chung.
- Chỉ thêm dependency cần cho server/client/test đã chốt. Chưa chọn nền tảng deploy; giữ cấu hình portable cho đến khi có quyết định.

## Kiểm chứng

Đây là bộ kế hoạch, không phải thay đổi runtime. Chưa chạy build hoặc test. Khi triển khai, mỗi phase cần chạy đúng lệnh đã có/được thêm vào repo và ghi kết quả ở báo cáo hoàn tất phase; không coi các tiêu chí chấp nhận trong tài liệu là test đã đạt.
