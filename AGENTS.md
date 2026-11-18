# Hướng dẫn Codex cho Ma Sói Host

## Nguồn sự thật và cách làm việc

- Đọc `IDEA.md` trước khi thiết kế hoặc sửa hành vi sản phẩm. Nếu mô tả ở đó mâu thuẫn với code/config hiện có, kiểm tra repo và nêu mâu thuẫn trước khi quyết định luật chơi, giao thức, hay dữ liệu.
- Repo hiện có thể mới ở giai đoạn đặc tả. Kiểm tra cấu trúc, scripts, dependency và quy ước đang tồn tại trước khi giả định chúng đã được tạo.
- Giữ game engine là TypeScript thuần, độc lập Socket.io và UI. Backend có thẩm quyền với vai trò, trạng thái phòng và kết quả; chỉ gửi dữ liệu mà từng client được phép biết.
- Ưu tiên giải pháp gọn. Không thêm dependency, database, framework, hoặc kiến trúc mới khi yêu cầu và repo chưa cần.
- Skill project được lưu trong `ai-config/skills/` do thư mục native `.agents/` hiện chỉ đọc. Khi task thuộc domain tương ứng, đọc `ai-config/skills/<skill>/SKILL.md` trước khi làm; không giả định chúng tự được Codex phát hiện.
- Khi viết, refactor hoặc review code TypeScript/React, đọc `ai-config/skills/clean-code/SKILL.md` cùng skill domain liên quan; giữ diff gọn và không ép thêm tooling chưa có trong repo.
- Khi thiết kế kiểu dữ liệu, xử lý lỗi TypeScript hoặc dữ liệu không tin cậy, đọc thêm `ai-config/skills/typescript-type-safety/SKILL.md`; skill này bổ sung quy tắc type-safety, không thay thế skill React, game engine hoặc Socket.io.
- Khi triển khai xử lý input, mạng, quyền truy cập, token, hoặc dữ liệu riêng tư, đọc thêm `ai-config/skills/secure-code/SKILL.md`. Chỉ áp dụng theo ranh giới bảo mật liên quan; không tự thêm framework, dependency hay cơ chế bảo mật chưa được dự án yêu cầu.
- Khi người dùng yêu cầu review bảo mật hoặc thay đổi chạm ranh giới tin cậy, đọc thêm `ai-config/skills/security-review/SKILL.md` cùng skill domain. Skill này bổ sung review lỗ hổng có bằng chứng, không thay thế `code-review` cho gameplay, race condition và hồi phục kết nối.
- Khi viết, cập nhật hoặc review README/tài liệu kỹ thuật, đọc `ai-config/skills/technical-documentation/SKILL.md` và tham chiếu đúng loại tài liệu. Dùng `ai-config/skills/humanize/SKILL.md` khi người dùng yêu cầu làm prose tự nhiên hơn hoặc rà AI patterns; đây là lượt biên tập bổ sung, không thay thế kiểm chứng dữ kiện kỹ thuật.
- Agent profile dự án nằm trong `ai-config/agents/` làm bản nguồn. Nếu `.codex/agents/` khả dụng trong môi trường khác, các file TOML này có thể được chép vào đó để Codex đăng ký custom agents.

## Chất lượng triển khai

- Mô hình hóa chuyển trạng thái và luật chơi rõ ràng; xử lý hành động trùng, mất kết nối, timeout, dữ liệu không hợp lệ và thứ tự chết như các trường hợp thường lệ.
- Với thay đổi logic, bổ sung kiểm thử Vitest tương ứng nếu repo đã có tooling; kiểm tra cấu hình và lệnh có sẵn trước khi chạy.
- Với UI, bao phủ trạng thái loading, lỗi, rỗng, mất kết nối và thao tác bị khóa; bảo đảm responsive, keyboard access và không làm lộ thông tin vai trò.
- Báo lỗi có ngữ cảnh để người dùng hoặc host biết thao tác nào thất bại và có thể làm gì tiếp theo. Không nuốt lỗi hoặc log secret/player token.
- Không tuyên bố kiểm tra đã đạt nếu chưa chạy. Nêu rõ lệnh đã chạy, kết quả và phần còn thiếu.

## Phối hợp và review

- Chỉ giao subagent khi phần việc độc lập và ranh giới file/domain rõ; tránh nhiều agent sửa cùng file. Agent chính chịu trách nhiệm tích hợp. Dùng profile tương ứng trong `ai-config/agents/` khi custom agent được đăng ký.
- Thay đổi hành vi cần review độc lập sau khi implement. Reviewer không sửa code; implementer xử lý findings rồi yêu cầu review lại khi cần.
- Review ưu tiên lỗi đúng đắn, bảo mật/che giấu vai trò, race conditions, xử lý lỗi, hồi phục kết nối và thiếu coverage. Findings phải nêu mức độ, vị trí, tác động và cách tái hiện.

## Git

- Chỉ tạo commit khi người dùng yêu cầu commit. Trước khi stage, xem `git status` và diff; stage tường minh file thuộc task, giữ nguyên thay đổi không liên quan, dùng skill `caveman-commit` để tạo message.
- Không amend, force push, push hoặc thay đổi lịch sử. Workflow trong repo chỉ hướng dẫn commit, không tự thực hiện thao tác Git khi chưa được yêu cầu.
- Nếu repo chưa được khởi tạo Git, dừng workflow commit và báo rõ; không tự `git init`.
