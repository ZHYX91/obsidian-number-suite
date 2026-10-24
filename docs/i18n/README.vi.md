# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite hiển thị số thứ tự cho tiêu đề, chú thích, liên kết tham chiếu, chú thích chân trang và cuối tài liệu trong Obsidian. Chỉ hiển thị trên màn hình sẽ không sửa tệp Markdown; ghi số vào nội dung là thao tác riêng.

Đây là **hướng dẫn ngắn** cho các thao tác thường dùng. Chi tiết về H7–H9, liên kết chú thích với đối tượng, tham chiếu ổn định, chú thích chân trang và chú thích cuối nằm trong bản nâng cao [tiếng Anh](../advanced.en.md) và [tiếng Trung giản thể](../advanced.zh-CN.md).

<!-- section: installation -->
## Cài đặt

Cần Obsidian 1.12.7 trở lên trên máy tính hoặc Android. Chưa xác minh hoạt động trên iOS.

1. Trong Cài đặt → Plugin cộng đồng → Duyệt, tìm Number Suite, cài đặt rồi bật plugin.
2. Để cài thủ công, tải ZIP của phiên bản từ [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases), giải nén rồi đặt thư mục `number-suite` vào `.obsidian/plugins/`. Bạn cũng có thể chép `main.js`, `manifest.json` và `styles.css` của cùng một bản phát hành vào `.obsidian/plugins/number-suite/`.
3. Tải lại Obsidian và bật plugin. Không trộn tệp từ các phiên bản khác nhau.

<!-- section: quick-start -->
## Bắt đầu

1. Trong **Cài đặt → Number Suite → Đánh số tiêu đề**, bật **“Hiện số ảo”**.
2. Mở Live Preview hoặc chế độ đọc. Số xuất hiện cạnh tiêu đề nhưng nội dung tệp không thay đổi.
3. Muốn lưu số vào Markdown, mở ghi chú hiện tại trong thanh bên Number Suite. Chọn ghi số hoặc đánh số lại, kiểm tra bản xem trước rồi xác nhận.

Phần hướng dẫn trong ghi chú hiện tại so sánh văn bản gốc, mục tiêu và thao tác. Tùy chọn riêng của ghi chú được lưu vào Properties; bản thân việc hiển thị không viết lại tiêu đề. Bản xem trước thu gọn theo tệp và hiện số thay đổi, cảnh báo. Mở từng tệp rồi tải thêm để xem hết kết quả. Tắt plugin sẽ dừng các lần ghi mới của xử lý hàng loạt hoặc hoàn tác; lần ghi đã gửi vẫn có thể hoàn tất. Nếu không thể khôi phục an toàn, hãy giữ `recovery.json` trong thư mục plugin và kiểm tra các ghi chú trước.

<!-- section: captions -->
## Chú thích và tham chiếu

Trên hình ảnh, bảng, công thức riêng hoặc khối mã, thêm dòng bắt đầu bằng `Figure:`, `Table:`, `Equation:` hoặc `Code:`. Giữ nguyên các từ khóa tiếng Anh này. Chú thích có thể hiển thị số. Dùng `@[[#Tiêu đề]]` để tham chiếu trong cùng ghi chú; liên kết thường `[[#...]]` không đổi. Chú thích chân trang `[^id]` và cuối tài liệu `[^endnote:id]` được đánh số riêng.

```markdown
Figure: Architecture

![[architecture.png]]
```

Khi di chuyển chú thích hoặc sửa chữ hoa, chữ thường của từ khóa, ID khối có sẵn trên cùng dòng hay các dòng sau vẫn đi cùng chú thích. Tham chiếu khối hiện có vẫn trỏ đến chú thích đó.

<!-- section: numbering -->
## Kiểu đánh số và bảo vệ tệp

Có kiểu phân cấp thông thường, ví dụ cho văn bản hành chính và pháp lý Trung Quốc, cùng các kiểu chữ số Trung Quốc phồn thể, Nhật, Hàn và Ả Rập–Ấn Độ. Đổi ngôn ngữ giao diện không tự động đổi kiểu. Chọn kiểu cũng không ghi vào Markdown. Các lệnh ghi, xóa, đánh số lại, tạo chú thích hoặc thêm ID tham chiếu có thể sửa tệp. Hãy xem trước và sao lưu vì liên kết đến tiêu đề có thể bị ảnh hưởng. Tiêu đề cấp 7–9 dùng cú pháp mở rộng.

<!-- section: settings -->
## Tìm phần cài đặt

Bảy thẻ cài đặt gồm: Chung, Đánh số tiêu đề, Chú thích, Tham chiếu chéo, Chú thích chân trang và cuối tài liệu, Ghi số và dọn dẹp, Hiển thị và hàng loạt. Ngôn ngữ giao diện và kiểu đánh số được chọn riêng. Phần ghi chú hiện tại ở thanh bên phải cho phép đổi riêng từng ghi chú. Chọn theo cài đặt chung sẽ xóa đúng phần ghi đè đó, giữ nguyên Properties khác. Dàn ý tài liệu và sơ đồ tư duy tiêu đề chỉ đọc giúp chuyển đến dòng gốc.

<!-- section: limitations -->
## Phạm vi và giới hạn

- Mỗi tệp Markdown dùng một quy tắc đánh số. Chú thích và tham chiếu cũng được xử lý trong cùng tệp.
- Tiêu đề và chú thích trong danh sách, trích dẫn, ví dụ mã, khối HTML và frontmatter không tham gia đánh số tài liệu. Chú thích chân trang và tham chiếu trong văn bản danh sách thông thường vẫn dùng được.
- Với Structural Tables, thao tác chú thích cần xác minh tệp, văn bản nguồn và khoảng chính xác. Phiên bản cũ hoặc bảng chưa được hỗ trợ sẽ hiện mục bị vô hiệu hóa kèm giải thích. Khi đó, hãy thêm hoặc sửa chú thích thủ công ở chế độ nguồn.
- H7–H9 là cú pháp mở rộng của Number Suite và DocWen. Dàn ý và liên kết tiêu đề gốc của Obsidian có thể không nhận ra; ID khối cung cấp đích tham chiếu ổn định.

<!-- section: privacy-and-support -->
## Quyền riêng tư và trợ giúp

Plugin chạy cục bộ, không kết nối mạng hay thu thập dữ liệu sử dụng. Hiển thị số không sửa ghi chú. Hãy kiểm tra bản xem trước khi ghi, xóa hoặc đánh số lại. Đổi văn bản tiêu đề có thể ảnh hưởng liên kết hiện có. Khi báo lỗi, hãy gửi phiên bản, các bước và ví dụ Markdown tối thiểu không chứa nội dung riêng tư.

[Hướng dẫn đầy đủ bằng tiếng Anh](../../README.md) · [Báo lỗi](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Giấy phép MIT](../../LICENSE)
