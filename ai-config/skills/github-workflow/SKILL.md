---
name: github-workflow
description: Team GitHub workflow treating each feature or task as an isolated branch and Pull Request to avoid conflicts with teammates. Use when starting a feature, committing, syncing with main, pushing a branch, or opening a PR.
---

Mỗi chức năng hoặc task độc lập phải được phát triển trên một nhánh riêng tách từ `main` mới nhất và hoàn tất bằng một Pull Request (PR) nhắm vào `main`, giúp tránh xung đột (conflict) với teammate.

## 1. Bắt đầu task (Branching)

1. Kiểm tra repo Git hợp lệ (`git status --short`). Nếu chưa khởi tạo Git, dừng lại và báo rõ.
2. **Không code hoặc commit trực tiếp lên `main`** (trừ khi người dùng yêu cầu rõ ràng).
3. Nếu đang ở `main` (hoặc chuẩn bị làm task mới):
   - Cập nhật tham chiếu từ remote: `git fetch origin`.
   - Kiểm tra xem working tree có thay đổi chưa commit không; nếu có thay đổi thuộc task khác của user/teammate, không trộn lẫn.
   - Tạo nhánh mới từ `origin/main` theo quy ước `<type>/<short-slug>`:
     - `feat/<tên-ngắn>` (tính năng mới)
     - `fix/<tên-ngắn>` (sửa lỗi)
     - `refactor/<tên-ngắn>`, `docs/<tên-ngắn>`, `test/<tên-ngắn>`, `chore/<tên-ngắn>`
   - Ví dụ: `git checkout -b feat/seer-reveal-log origin/main`

## 2. Phạm vi & Tránh xung đột

- Mỗi nhánh chỉ làm **1 chức năng / 1 PR**. Không gộp nhiều tính năng hoặc sửa các file không liên quan ngoài phạm vi task.
- Nếu cần chỉnh sửa file dùng chung (như `IDEA.md`, `AGENTS.md`, config gốc, shared types), giữ thay đổi tối thiểu và tách bạch.

## 3. Commit sạch sẽ

1. Xem `git status --short` và `git diff` để xác nhận chỉ gồm thay đổi của task.
2. Stage tường minh từng file (`git add <path>`). Tuyệt đối không dùng `git add -A` hay `git add .`.
3. Dùng skill `caveman-commit` để tạo Conventional Commit message ngắn gọn, chính xác.
4. Chạy `git commit` trên nhánh feature. Không amend hoặc viết lại lịch sử commit đã push lên nhánh chung.

## 4. Đồng bộ `main` & Kiểm thử trước khi tạo PR

1. Trước khi đẩy nhánh lên remote, đồng bộ với `main` mới nhất để xử lý conflict sớm ở local:
   - `git fetch origin`
   - `git rebase origin/main` (hoặc `git merge origin/main` nếu nhánh đang có nhiều người cùng làm).
2. Nếu có conflict, giải quyết cẩn thận rồi chạy lại toàn bộ kiểm thử (`vitest`, `typecheck`, `lint`, `build` nếu repo có).

## 5. Push & Mở Pull Request

1. Push nhánh feature lên remote: `git push -u origin <branch-name>`.
   - **Không bao giờ** `git push` trực tiếp lên `main` hoặc `--force` lên `main`.
2. Tạo Pull Request nhắm vào `main`:
   - Nếu có GitHub CLI (`gh`), chạy `gh pr create --base main --head <branch-name> --title "<type>(<scope>): <summary>" --body "..."`.
   - Nếu máy chưa cài `gh` (hoặc chưa đăng nhập), báo rõ cho người dùng và cung cấp sẵn:
     - Link tạo PR nhanh: `https://github.com/<owner>/<repo>/compare/main...<branch-name>?expand=1`
     - Tiêu đề PR, tóm tắt thay đổi, danh sách file chính và kết quả test đã chạy.
3. Không tự ý merge PR trừ khi người dùng yêu cầu.
