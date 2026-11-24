---
name: fast-anything
description: Speed up a slow Python, Node.js/TypeScript, Ruby, Java, Go, PHP, C, C++ or C# app by porting its hottest pure functions to Rust and proving each port gives the same results on real recorded calls. Use when the user asks to speed up performance-critical functions, profile hot paths, or port bottlenecks to Rust.
---

# fast-anything — Targeted Rust Micro-Optimization

Tối ưu hóa hiệu năng ứng dụng bằng cách chỉ viết lại **5% phần code chạy chậm nhất (bottleneck)** sang Rust thay vì đập đi xây lại toàn bộ dự án:
> *"Don't rewrite it in Rust. Rewrite the 5% that's slow."*

---

## Khi nào nên dùng và Khi nào KHÔNG nên dùng

### ✅ Nên dùng:
- Các hàm thuần túy (**pure functions**): cùng input luôn ra cùng output, không phụ thuộc I/O, không gọi DB, không truy cập socket hay UI.
- Các tác vụ nghẽn CPU (**CPU-bound**): tính toán ma trận, xử lý thuật toán phức tạp, nén/giải nén dữ liệu, mã hóa/băm, xử lý ảnh/video, parsing file dung lượng lớn.
- Đoạn mã thực sự tốn phần lớn thời gian CPU trong quá trình profiling (`fast-anything scan`).

### ❌ KHÔNG nên dùng:
- Các ứng dụng thuần **I/O-bound** (đọc ghi network, web socket, truy vấn database, game điều phối lượt chơi).
- Code chạy trên **Web Browser** của client (trừ khi biên dịch sang WebAssembly `wasm32-unknown-unknown`, N-API native bindings không hỗ trợ chạy trên trình duyệt).
- Các hàm thao tác DOM, React state, hoặc Socket.io connections.
- Các hàm chỉ tốn vài micro giây (chi phí FFI call overhead giữa JS và Rust sẽ lớn hơn thời gian thực thi hàm).

---

## Yêu cầu môi trường (Prerequisites)

1. **Rust Toolchain**: `rustc` và `cargo` (cài qua `rustup.rs`).
2. **C Linker / Build Tools**:
   - Windows: Visual Studio C++ Build Tools (MSVC).
   - Linux/macOS: `build-essential` / Xcode Command Line Tools.
3. **CLI Package**:
   ```bash
   npm i -g @el4cteo/fast-anything
   # hoặc qua Cargo:
   cargo install fast-anything
   ```

---

## Quy trình làm việc chuẩn (Workflow)

### Bước 1: Quét và Định vị Bottleneck (`scan`)
Chạy workload thực tế của ứng dụng để profile và xếp hạng các hàm tiêu tốn nhiều thời gian CPU nhất:
```bash
fast-anything scan -- <command_chay_app>
# Ví dụ Node/Bun:
fast-anything scan -- bun src/server/index.ts
```
Hệ thống sẽ liệt kê các hàm ứng viên kèm ID, thời gian thực thi và mức độ khả thi khi port sang Rust.

### Bước 2: Port hàm sang Rust (`port`)
Ghi lại tới 500 mẫu input/output thực tế từ runtime và tạo khung crate Rust độc lập kèm `TASK.md`:
```bash
fast-anything port <candidate_id>
```
Agent đọc `TASK.md` và cài đặt hàm tương ứng trong crate Rust:
- Sử dụng kiểu dữ liệu an toàn, tối ưu zero-cost abstractions trong Rust.
- Đảm bảo xử lý đầy đủ các trường hợp biên (`null`, `undefined`, số thực `NaN`/`Infinity`, mảng rỗng, chuỗi Unicode).

### Bước 3: Xác minh độ chính xác tuyệt đối (`verify`)
Biên dịch bản release của crate Rust và chạy lại toàn bộ 500 mẫu đã ghi lại cùng các bộ test suy biến:
```bash
fast-anything verify <candidate_id>
```
**Quy tắc bất di bất dịch**: Nếu có bất kỳ sai lệch nào dù là nhỏ nhất (kể cả sai số float vượt quá `1e-9`), agent phải sửa code Rust cho tới khi 100% tests vượt qua. Không được phép chỉnh sửa dữ liệu mẫu đã ghi nhận.

### Bước 4: Kích hoạt (`enable`) và Đo lường (`bench`)
Sau khi verify thành công, hoán đổi hàm Rust vào mã nguồn chính thông qua khối mã có đánh dấu rõ ràng:
```bash
fast-anything enable <candidate_id>
fast-anything bench
```
Công cụ sẽ chạy benchmark so sánh phiên bản gốc vs phiên bản Rust và xuất báo cáo `REPORT.md` kèm badge trực quan.

### Bước 5: Cơ chế an toàn và Hoàn tác (`disable`)
Nếu cần tắt hoặc rollback ngay lập tức:
```bash
# Hoàn tác mã nguồn về nguyên bản byte-for-byte:
fast-anything disable <candidate_id>

# Hoặc tắt nhanh qua biến môi trường tại runtime mà không cần sửa code:
FAST_ANYTHING_DISABLE=1 bun run start
```
