# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite hiển thị số thứ tự cho tiêu đề, chú thích, liên kết tham chiếu, chú thích chân trang và cuối tài liệu trong Obsidian. Chỉ hiển thị trên màn hình sẽ không sửa tệp Markdown; ghi số vào nội dung là thao tác riêng.

## Bắt đầu

1. Trong **Cài đặt → Number Suite → Đánh số tiêu đề**, bật số ảo (`Show virtual numbers`).
2. Mở Live Preview hoặc chế độ đọc. Số xuất hiện cạnh tiêu đề nhưng nội dung tệp không thay đổi.
3. Muốn lưu số vào Markdown, mở ghi chú hiện tại trong thanh bên Number Suite. Chọn ghi số hoặc đánh số lại, kiểm tra bản xem trước rồi xác nhận.

## Chú thích và tham chiếu

Trên hình ảnh, bảng, công thức riêng hoặc khối mã, thêm dòng bắt đầu bằng `Figure:`, `Table:`, `Equation:` hoặc `Code:`. Giữ nguyên các từ khóa tiếng Anh này. Chú thích có thể hiển thị số. Dùng `@[[#Tiêu đề]]` để tham chiếu trong cùng ghi chú; liên kết thường `[[#...]]` không đổi. Chú thích chân trang `[^id]` và cuối tài liệu `[^endnote:id]` được đánh số riêng.

```markdown
Figure: Architecture

![[architecture.png]]
```

## Kiểu đánh số và bảo vệ tệp

Có kiểu phân cấp thông thường, ví dụ cho văn bản hành chính và pháp lý Trung Quốc, cùng các kiểu chữ số Trung Quốc phồn thể, Nhật, Hàn và Ả Rập–Ấn Độ. Đổi ngôn ngữ giao diện không tự động đổi kiểu. Chọn kiểu cũng không ghi vào Markdown. Các lệnh ghi, xóa, đánh số lại, tạo chú thích hoặc thêm ID tham chiếu có thể sửa tệp. Hãy xem trước và sao lưu vì liên kết đến tiêu đề có thể bị ảnh hưởng. Tiêu đề cấp 7–9 dùng cú pháp mở rộng.

## Cài đặt và trợ giúp

Cần Obsidian 1.12.7 trở lên trên máy tính hoặc Android; iOS chưa được kiểm chứng. Cài từ tiện ích cộng đồng hoặc chép `main.js`, `manifest.json`, `styles.css` của cùng một bản phát hành vào `.obsidian/plugins/number-suite/`. Tiện ích hoạt động tại máy, không gửi dữ liệu theo dõi. Xem [tài liệu chi tiết bằng tiếng Anh](../../README.md) để biết các quy tắc và giới hạn.

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
