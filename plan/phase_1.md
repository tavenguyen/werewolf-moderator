# Phase 1 — Chốt luật và hoàn thiện gameplay engine

## Mục tiêu

Hoàn thiện game engine TypeScript thuần làm nguồn quyết định cho gameplay. Engine nhận state và lệnh đã được kiểm tra, trả kết quả chuyển trạng thái cùng sự kiện công khai/riêng tư cần thiết; không phụ thuộc Socket.io, React hay thời gian thực của trình duyệt. Phase này chuẩn bị nền tảng để backend gọi engine ở Phase 2.

Phạm vi gồm vòng đời ván, xử lý đêm/ngày, vote và chuỗi chết, kiểm tra thắng, lịch sử giải mã, cùng unit test. MVP hỗ trợ 6–16 người và giới hạn xử lý engine ở đúng 16 role dưới đây; các role khác vẫn được giữ trong catalog giao diện nhưng chưa thể chia hoặc thực hiện năng lực trong engine. Không triển khai transport, quản lý phòng hoặc UI trong phase này.

## Quyết định sản phẩm đã chốt

- 16 role MVP: `villager`, `werewolf`, `seer`, `bodyguard`, `witch`, `hunter`, `cupid`, `wolf_cub`, `dream_wolf`, `lycan`, `minion`, `sorcerer`, `tanner`, `white_wolf`, `elder`, `village_idiot`. Catalog hiện gắn `BASIC` cho 9 role; MVP chỉ chọn 7 role cơ bản nêu trên, nên `tough_guy` và `prince` được đánh dấu chưa triển khai.
- Thêm `implementedInEngine: boolean` vào catalog role hiện ở `src/screens/home/roles.ts`. Chỉ 16 role MVP có `true`; mọi role khác là `false`. Khi tách catalog khỏi tầng UI, giữ cờ trên định nghĩa domain canonical và re-export qua `roles.ts`. Cờ biểu thị hỗ trợ luật end-to-end trong engine, không chỉ có mặt trong catalog.
- Hỗ trợ bàn 6–16 người. Phase này chốt một bảng Smart Preset xác định cho từng số người, chỉ dùng role MVP; bảng phải có đúng số role bằng số người và kiểm tra cân bằng bằng `balanceWeight`. Drunk không thuộc MVP; nếu được thêm sau này, preset có Drunk phải cấp ít nhất một lá dự phòng hợp lệ.
- Bình cứu AoE hóa giải mọi vết cắn thuộc `WOLF_PACK`, gồm đòn thứ hai của Sói đại ca nếu role đó được bật ở phase sau. AoE không cứu đòn riêng `WHITE_WOLF`. Độc vẫn giết mục tiêu được cứu; cấm tự cứu thì AoE bỏ qua chính Phù thủy nhưng vẫn cứu các nạn nhân hợp lệ khác.
- Vote ban ngày: abstain và người disconnect trước khi tally đều được tính là chưa gửi phiếu; tự tally khi hết 180 giây. Host được chốt sớm nếu mọi người còn quyền vote đã gửi. Timer gia hạn `+30` tối đa hai lần mỗi ngày; pause đóng băng toàn bộ timer. Khóa vote 60 giây tính từ khi mở thảo luận, sau công bố chết, Thợ săn và Trưởng làng.
- Runoff cho mọi người còn quyền vote, chỉ chọn trong nhóm mục tiêu đồng hạng cao nhất; biện hộ 30 giây, vote lại 20 giây. Nếu vòng hai vẫn hòa thì không treo cổ.
- Trưởng làng là danh hiệu lưu bằng `mayorId`, không phải role. Setting bầu Trưởng làng mặc định tắt; nếu bật, state machine ban ngày ở Ngày 1 phải có bước chốt bầu Trưởng làng trước (hoặc xong trước khi mở tally treo cổ) thì quyền 2 phiếu của Trưởng làng mới áp dụng được ngay trong Ngày 1. Hòa thì không có Trưởng làng. Khi Trưởng làng chết, người đó có 10 giây truyền danh hiệu; hết giờ thì danh hiệu mất đến hết ván.
- Thợ săn chết được chọn mục tiêu trong 15 giây sau khi công bố: client riêng của Thợ săn ở multi-device, thiết bị chung ở single-device. Hết giờ hoặc disconnect thì bắn trượt.
- Già làng mất năng lực phe Dân nếu chết bởi bất kỳ nguyên nhân nào ngoài Sói cắn, gồm Sói trắng và Thợ săn.
- Sói chiêm bao (`dream_wolf`): Cập nhật kiểm tra trạng thái ở đầu mỗi đêm; ngay khi có ít nhất 1 Sói khác chết (do treo cổ, trúng độc, tự cắn, Thợ săn bắn hoặc Sói trắng giết), `NightTurnPlan` phải mở quyền thức và gửi action cùng bầy Sói cho `dream_wolf` từ đêm kế tiếp.
- Sói trắng (`white_wolf`): Chỉ thắng khi là người sống sót duy nhất (`aliveCount === 1`). Chừng nào Sói trắng còn sống thì phe Dân chưa thể thắng (kể cả khi toàn bộ Sói thường đã chết hết).
- Cặp đôi Cupid (`cupid`): Cặp đôi chỉ tách thành Phe Thứ 3 (thắng khi chỉ còn đúng 2 người sống sót) nếu hai người đó thuộc hai phe khác nhau (Dân + Sói, hoặc Dân/Sói + Phe Thứ 3). Nếu ghép trúng 2 Dân hoặc 2 Sói cùng phe, họ vẫn thắng theo phe gốc bình thường.
- Engine tạo `NightTurnPlan` nhưng không tạo timer. Backend áp fake delay ngẫu nhiên 7–14 giây cho mọi lượt gọi, kể cả vai chết; engine chỉ cho phép hành động từ lượt hợp lệ của vai còn đủ điều kiện.
- Khi Sói cuối tự cắn mình và chết, kiểm tra điều kiện thắng độc lập của phe thứ ba/cặp đôi trước; nếu không có phe thứ ba thắng thì Dân thắng.

## Hiện trạng đã xác nhận

- `src/engine/types.ts` đã có `GameState`, `PlayerState`, `RoomSettings`, `NightActions`, `DeathRecord`, `WinOutcome` và các phase cơ bản (`LOBBY`, `FIRST_NIGHT_SETUP`, `NIGHT`, `DAY_DISCUSS`, `DAY_VOTE`, `HUNTER_SHOT`, `GAME_OVER`). Chưa có state/type cho ballot, runoff, deadline/pause, Mayor hoặc danh sách lượt đêm.
- `src/engine/gameEngine.ts` khởi tạo state và có `executeNightPhase`, `executeDayVote`, `executeHunterShot`. Các hàm thay đổi trực tiếp object `GameState`; `executeDayVote` nhận sẵn người bị xử thay vì tally phiếu. Chưa có validation tổng quát theo phase, role, trạng thái sống hay mục tiêu.
- `src/engine/nightResolution.ts` phân giải nhiều vai và hiệu ứng đêm theo thứ tự cố định; `src/engine/deathCascade.ts` xử lý nhiều hiệu ứng chết kéo theo; `src/engine/winConditions.ts` kiểm tra nhiều phe thắng; `src/engine/seating.ts` hỗ trợ ghế vòng tròn.
- Engine hiện import `ROLES_BY_ID` và kiểu phe từ `src/screens/home/roles.ts`. Nên chuyển catalog/type gameplay sang module dùng chung để engine thuần không phụ thuộc tầng màn hình.
- `src/engine/__tests__/gameEngine.test.ts` có test cho ghế, bảo vệ, Sói nguyền, Già làng, Cupid, Tanner, Thợ săn, Thằng ngốc và `DRAW`, nhưng import `bun:test`. `package.json` chưa có script test, Vitest hay Bun dependency. Đổi sang Vitest theo `IDEA.md` trước khi mở rộng coverage.
- Chưa thấy tally đa số Sói/hòa chọn ngẫu nhiên, runoff, bầu Mayor, hoặc timer/deadline trong engine. `allowWolfSkip`, `allowWolfFriendlyFire`, `witchKnowsVictim`, `witchWasteHealOnEmpty`, `allowWitchSelfHeal` và `ghostMode` cần được áp dụng hoặc giới hạn đúng. Hiện AoE xóa `wolfVictims` và `bigBadWolfVictim` nhưng giữ `whiteWolfVictim`; đây đúng là ranh giới luật mong muốn: hai đòn phe Sói thuộc `WOLF_PACK` và được cứu, đòn riêng của Sói trắng thuộc `WHITE_WOLF` và không được cứu. Cần giữ phân loại nguồn sát thương này rõ ràng trong resolver. `winConditions.ts` có nhánh Hoodlum chưa hoàn chỉnh, nhưng Hoodlum ngoài MVP và phải được đánh dấu `implementedInEngine: false`.

## Kế hoạch thực hiện

### 1. Chốt bảng luật và dữ liệu ván

1. Lập bảng `đã có / thiếu / ngoài MVP` cho từng role, thêm `implementedInEngine` vào catalog, và giới hạn mọi preset/validation/lượt gọi đêm theo danh sách 16 role MVP. Các role khác không bị xóa khỏi UI catalog.
2. Chốt bảng Smart Preset riêng cho 6, 7, …, 16 người. Mỗi hàng định nghĩa role và số lượng cụ thể; tổng role khớp số ghế, không chứa role `implementedInEngine: false`, và có fixture test cho phân bố/balance score.
3. Tiêm nguồn randomness có seed vào xáo bài và xử lý hòa phiếu Sói để test tái lập. Fake delay không thuộc engine; backend tự chọn delay 7–14 giây theo từng lượt.
4. Chốt thứ tự resolve đêm thành bảng: bảo vệ → tally và chọn mục tiêu Sói → tấn công phe Sói (`WOLF_PACK`, gồm đòn Sói đại ca nếu bật) và đòn riêng `WHITE_WOLF` → phù thủy cứu/độc → hiệu ứng role MVP → death cascade → Hunter shot → kiểm tra thắng. AoE xóa các nạn nhân `WOLF_PACK` đủ điều kiện, không xóa mục tiêu `WHITE_WOLF`.

### 2. Chuẩn hóa state machine và API thuần

1. Định nghĩa các lệnh domain có kiểu phân biệt theo phase: bắt đầu ván, hoàn tất xem vai setup, gửi hành động của lượt đêm, kết thúc đêm, mở thảo luận, gửi vote, chốt tally, runoff, hunter shot, truyền quyền Mayor, kết thúc ván và rematch.
2. Thay đổi API để trả `nextState` (hoặc state mới) cùng `events`/`result`, không sửa state đầu vào. Lệnh sai trả lỗi domain có mã ổn định và không làm thay đổi state.
3. Thêm validation: ID tồn tại, ID duy nhất, role MVP hợp lệ (`implementedInEngine: true`), 6–16 người, số role khớp số ghế, mục tiêu còn sống và được phép, không tự chọn khi luật cấm, chỉ người có role và lượt hợp lệ được gửi action, kỹ năng một lần chưa dùng, hành động không lặp.
4. Mô tả phase transitions và điều kiện vào/ra. `FIRST_NIGHT_SETUP` là bước xem role riêng, không phải lượt gameplay; không expose role trong state công khai. Phân định trạng thái role assignment thủ công dùng bài giấy và chia tự động.
5. Tách `initialRoleId` (vai được chia) khỏi role/faction hiện hành cho các biến đổi thuộc 16 role MVP. Không triển khai chuyển vai của Drunk, Doppelganger hoặc Wild Child trong phase này vì các role đó nằm ngoài MVP.

### 3. Hoàn thiện đêm

1. Tạo `NightTurnPlan` cho các role trong ván, bao gồm fake call của vai chết để giữ nhịp lượt. Engine không chứa `setTimeout` hoặc fake delay; backend ở Phase 2 áp khoảng ngẫu nhiên 7–14 giây cho mỗi lượt và grace period cuối đêm 1.5–2 giây. Lượt giả không cấp quyền gửi action.
2. Tổng hợp phiếu bầy Sói: đa số thắng; nếu hòa chọn ngẫu nhiên trong các mục tiêu đã vote; cho phép skip/friendly fire chỉ khi setting bật. Bảo đảm vote Sói không được gửi tùy ý bởi client ngoài nhóm Sói còn quyền hành động.
3. Bảo vệ: chặn chọn cùng mục tiêu hai đêm liên tiếp theo rule; target được bảo vệ không chết do đòn được bảo vệ; chỉ tiết lộ đúng thông tin mà Phù thủy được phép biết.
4. Phù thủy: quản lý bình cứu/độc độc lập, yêu cầu xác nhận bên client không thay thế validation engine; xử lý lãng phí bình khi chọn cứu mù và không có nạn nhân theo `witchWasteHealOnEmpty`; cấm tự cứu theo setting. AoE cứu mọi nạn nhân do Sói cắn thuộc `WOLF_PACK`, gồm đòn thứ hai của Sói đại ca khi role này được bật; AoE không cứu đòn riêng `WHITE_WOLF`. Nếu cấm tự cứu, lọc Phù thủy khỏi tập nạn nhân AoE nhưng vẫn cứu những mục tiêu hợp lệ khác. Độc vẫn giết mục tiêu được cứu; nếu bật biết nạn nhân, chỉ cung cấp danh sách còn nguy cơ sau bảo vệ.
5. Sói con chết làm số nạn nhân Sói tăng theo lượt kế tiếp; kiểm tra đúng thời điểm và không áp dụng nhầm sau các đòn cắn riêng.
6. Già làng mất năng lực phe Dân khi chết do bất kỳ nguyên nhân nào ngoài Sói cắn; bao gồm vote, độc, Thợ săn, Sói trắng và cascade. Fake call vẫn giữ nhịp lượt theo `NightTurnPlan`.
7. Sói chiêm bao (`dream_wolf`): Cập nhật kiểm tra trạng thái ở đầu mỗi đêm; ngay khi có ít nhất 1 Sói khác chết (do treo cổ, trúng độc, tự cắn, Thợ săn bắn hoặc Sói trắng giết), `NightTurnPlan` phải mở quyền thức và gửi action cùng bầy Sói cho `dream_wolf` từ đêm kế tiếp.
8. Ghi các sự kiện giải mã có cấu trúc (ai chọn/cứu/bảo vệ/đỡ, loại tấn công, mục tiêu) và visibility; tránh chỉ lưu chuỗi `historyLogs` để UI/backend phải parse text.

### 4. Hoàn thiện ban ngày, vote và quyền công khai

1. Thêm state vote kín tách riêng từng người; không broadcast phiếu hoặc target vote trước khi chốt. Chỉ người sống, có quyền vote và chưa gửi phiếu được submit; người không gửi và người disconnect trước tally được tính abstain. Hết 180 giây tự tally; host được chốt sớm khi tất cả người còn quyền vote đã gửi. Áp trọng số Mayor (nếu bật) và quyền vote 0 của Village Idiot sau khi lật bài.
2. Hỗ trợ vote công khai ngoài đời: host gửi tally/target để chốt, vẫn qua cùng validation và engine resolution. Single-device không có vote kín theo IDEA.
3. Ngày thảo luận mặc định 180 giây; khóa vote 60 giây bắt đầu khi mở thảo luận sau công bố chết, Hunter và Mayor. Gia hạn `+30` tối đa hai lần; pause đóng băng cả timer thảo luận lẫn vote unlock. Lưu các deadline server để backend thực thi, không dựa đồng hồ client.
4. Khi hòa: `ESCAPE` bỏ án treo; `RUNOFF` chuyển sang biện hộ 30 giây và vote 20 giây. Mọi người còn quyền vote được bỏ phiếu lại, chỉ nhắm vào các mục tiêu đồng hạng cao nhất vòng đầu; hòa vòng hai thì không treo cổ. Không đồng nhất hòa vote với kết quả ván `DRAW`.
5. Mayor là danh hiệu phụ `mayorId`, với setting bật/tắt mặc định tắt. Nếu bật, state machine ban ngày ở Ngày 1 phải có bước chốt bầu Trưởng làng trước (hoặc xong trước khi mở tally treo cổ) để quyền 2 phiếu của Mayor áp dụng được ngay trong Ngày 1. Hòa thì không có Mayor. Mayor có hai phiếu và khi chết có 10 giây truyền ngôi; timeout làm mất danh hiệu đến hết ván. Thợ săn chết được công bố rồi có 15 giây chọn mục tiêu; timeout/disconnect tính là bắn trượt. Multi-device mở lựa chọn trên client Thợ săn; single-device dùng máy chung.
6. Xử lý lựa chọn Thợ săn sau bất kỳ nguyên nhân chết hợp lệ nếu luật role hiện tại yêu cầu; sau khi cascade và shot kết thúc mới check win.

### 5. Chuỗi chết, thắng và rematch

1. Dùng hàng đợi chết có thứ tự ổn định và chống xử lý lặp một người; duy trì `cause`, `round`, `phase`, `cascadeDepth`. Test cascade Cupid/lover, Hunter, Già làng và Sói con; không mở rộng sang companion, Wild Child, Doppelganger hay role ngoài MVP.
2. Chỉ chạy `checkWinCondition` sau khi chuỗi chết và lượt Thợ săn bắt buộc hoàn tất. Bao phủ `DRAW` khi toàn bộ phe bị quét sạch trong cùng chuỗi.
3. Sửa thứ tự ưu tiên thắng: các điều kiện thắng cá nhân/đặc biệt còn hiệu lực, trong đó có cặp đôi khác phe (chỉ tách Phe Thứ 3 khi 2 người yêu khác phe; nếu cùng phe Dân hoặc cùng phe Sói thì vẫn thắng theo phe gốc), được xét trước thắng phe Dân; Sói trắng chỉ thắng khi là người sống sót duy nhất (`aliveCount === 1`), nhưng chừng nào Sói trắng còn sống thì phe Dân chưa thể thắng (kể cả khi toàn bộ Sói thường đã chết hết); khi Sói cuối tự cắn mình, nếu không có phe thứ ba/cặp đôi thắng thì Dân thắng. Kiểm tra winners đúng cho Tanner, các điều kiện role MVP và `DRAW`. Hoodlum không thuộc MVP và chưa hoàn thiện trong phase này.
4. Tạo final summary chỉ xuất hiện ở `GAME_OVER`, gồm vai ban đầu/hiện tại, phe, người thắng và timeline có sự kiện đêm; ghost mode tuyệt đối không biến thành quyền xem role người sống trước khi game over.
5. Rematch tạo state sạch từ danh sách người chơi/settings hiện có, tăng generation/gameId để action cũ không áp vào ván mới; chia lại role. Giữ phần này thuần, không lưu lịch sử phòng ở engine.

## Kiểm thử và tooling

- Trước khi thêm test, đổi test hiện tại sang Vitest hoặc chọn một runner thống nhất. Theo `IDEA.md`, ưu tiên Vitest; cần thêm dependency và script `test`/`test:run` trong phase triển khai. Không giữ test `bun:test` nếu repo không cam kết Bun.
- Chia test theo module: `gameEngine`, `nightResolution`, `deathCascade`, `winConditions`, `voting`, `turnPlan`. Dùng fixture nhỏ, random seed cố định và kiểm tra input state không bị mutate.
- Chỉ gọi `implementedInEngine: true` khi role có hành vi end-to-end; mọi role `false` phải bị từ chối ở preset/assignment/action validation. Catalog vẫn hiển thị đầy đủ role cho drawer.
- Bộ test bắt buộc: preset cho từng bàn 6–16 người và tổng role khớp; Sói hòa vote; tự cắn Sói cuối với/không có phe thứ ba thắng; bảo vệ mục tiêu đêm trước; Sói con cho hai mục tiêu; Witch single/AoE, độc đè cứu, cấm tự cứu, bình cứu mù trừ/không trừ, cứu được WOLF_PACK/đòn Sói đại ca nhưng không cứu WHITE_WOLF; Sói trắng còn sống chặn Dân thắng dù hết Sói thường, Sói trắng thắng khi aliveCount === 1; cặp đôi Cupid cùng phe (2 Dân / 2 Sói) thắng theo phe gốc vs khác phe tách Phe Thứ 3 (thắng khi còn 2 người); Mayor Ngày 1 bầu trước tally và có 2 phiếu ngay Ngày 1; Dream Wolf thức từ đêm kế tiếp sau khi có ít nhất 1 Sói bất kỳ chết; Hunter 15 giây và timeout/disconnect bắn trượt; Cupid cascade → Hunter → win check; hai phe cùng sạch → DRAW; Già làng chết do Sói cắn so với mọi nguồn khác; Mayor bật/tắt, bầu hòa, truyền ngôi/timeout; 180 giây, khóa 60 giây, pause, hai lần gia hạn, abstain/disconnect, runoff 30+20 giây và hòa vòng hai thoát án.
- Kiểm thử bất biến: cùng command/state/seed cho kết quả giống nhau; invalid command không đổi state; một người chết tối đa một lần trong cascade; role private không nằm trong public events; kết quả thắng chỉ xuất hiện sau khi pending effect hết.
- Kiểm tra cấu hình TypeScript/build bằng lệnh repo có sẵn sau khi implementation bắt đầu; hiện tại `package.json` chỉ có `dev`, `build`, `preview`, chưa có test script. Phase plan này không tuyên bố test đã chạy.

## Tiêu chí hoàn tất

- Luật MVP được chốt thành bảng có thể đối chiếu với `IDEA.md`; mọi sai khác có quyết định và test.
- Engine không phụ thuộc React/Socket.io và không import catalog từ thư mục `screens`.
- State transitions và action validation có kiểu rõ, command sai không mutate state.
- Các flow đêm/ngày/chuỗi chết/điều kiện thắng/rematch ở phạm vi MVP được test bằng runner thống nhất.
- Engine phát dữ liệu kết quả có cấu trúc, đủ để backend lọc public/private và UI xây timeline mà không parse `historyLogs`.

## Quyết định đã khóa và đầu ra cần hoàn tất

Các câu hỏi sản phẩm ban đầu đã được chốt ở trên. Đầu ra Phase 1 vẫn phải chứa bảng role cụ thể cho từng cỡ bàn 6–16 người, thứ tự resolve đêm, bảng ưu tiên thắng và contract cho vote/timer/Mayor/Hunter để backend không phải tự quyết luật. Fake delay cố định 7–14 giây thuộc backend Phase 2, không thêm cấu hình phòng trong Phase 1.
