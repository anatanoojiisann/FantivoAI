const LOCALES = [
  ["zh-CN", "中文"], ["en", "English"], ["ru", "Русский"], ["uk", "Українська"],
  ["uz", "O‘zbekcha"], ["vi", "Tiếng Việt"], ["id", "Indonesia"], ["es", "Español"],
  ["pt-BR", "Português"], ["ar", "العربية"], ["tr", "Türkçe"], ["fa", "فارسی"],
];

const VERSION = "2026-08-04";
const rtlLocales = new Set(["ar", "fa"]);

const copy = {
  en: {
    back: "Fantivo AI", updated: `Effective and last updated: ${VERSION}`,
    terms: {
      eyebrow: "LEGAL", title: "Terms of Service",
      intro: "These Terms govern your use of Fantivo AI through the Telegram Bot and Mini App. By continuing or purchasing credits, you agree to the current version.",
      sections: [
        ["1. Service", "Fantivo AI lets you submit text or images to create AI-generated videos, view jobs, and manage credits. Availability, models, speed, and output quality may change."],
        ["2. Your content", "You must have the rights and permissions needed for every prompt, image, and other material you submit. You remain responsible for your input and your use of generated output."],
        ["3. Credits and Telegram Stars", "Digital credits are purchased with Telegram Stars. Credits are added only after Telegram sends an official successful-payment confirmation. Credits are not cash, cannot be transferred, and have no value outside this service."],
        ["4. Failed or cancelled jobs", "A failed or eligible cancelled job is refunded according to the platform status and rules. Completed generation costs are not refunded merely because the creative result does not match a subjective preference."],
        ["5. Acceptable use", "Do not use the service for illegal, deceptive, abusive, infringing, or harmful content, or to violate another person's privacy. We may reject content or restrict access to protect users and the service."],
        ["6. Support and changes", "For general help, open @Aurax_ai_bot and send /support. For payment help, send /paysupport. We may update these Terms; the version shown here is the version requested during purchase."],
      ],
      notice: "AI output may be inaccurate or unexpected. Review it before publishing or relying on it.",
    },
    privacy: {
      eyebrow: "PRIVACY", title: "Privacy Policy",
      intro: "This policy explains the data Fantivo AI processes when you use the Telegram Bot and Mini App.",
      sections: [
        ["1. Data we receive", "We receive basic Telegram account details provided to the Bot or Mini App, such as your user ID, name, username, and language. We also process prompts, uploaded images, job records, credit balances, and support messages."],
        ["2. How we use data", "We use data to authenticate you, provide generation, prevent duplicate charges and jobs, maintain balances, deliver results, prevent abuse, and answer support requests."],
        ["3. Payments", "Telegram processes Stars payments. We receive the transaction identifiers, product, amount, and payment status needed to verify and credit the purchase. We do not receive your password, verification code, or bank-card details."],
        ["4. Service providers", "Data is shared only with Telegram and the infrastructure or generation providers needed to operate the service, or when required by law. We do not sell personal data."],
        ["5. Retention and security", "We retain operational records only as long as reasonably needed for the service, security, dispute handling, and legal duties. We use access controls and signed requests, but no online service can guarantee absolute security."],
        ["6. Your choices and support", "You can stop using the service at any time. For privacy questions or a data request, open @Aurax_ai_bot and send /support. For a payment issue, send /paysupport."],
      ],
      notice: "Never send passwords, Telegram verification codes, or full payment credentials to support.",
    },
  },
  "zh-CN": {
    back: "返回 Fantivo AI", updated: `生效及最后更新：${VERSION}`,
    terms: {
      eyebrow: "法律文件", title: "服务条款", intro: "本条款适用于你通过 Telegram Bot 和小程序使用 Fantivo AI。继续使用或购买 credits，即表示你同意当前版本。",
      sections: [
        ["1. 服务内容", "Fantivo AI 可根据文字或图片生成 AI 视频，并提供任务查询和 credits 管理。服务可用性、模型、速度和输出质量可能发生变化。"],
        ["2. 你的内容", "你必须拥有提交的提示词、图片和其他材料所需的权利与许可。你需要对输入内容以及生成结果的使用负责。"],
        ["3. Credits 与 Telegram Stars", "数字 credits 使用 Telegram Stars 购买。只有 Telegram 发出官方支付成功确认后才会到账。Credits 不是现金，不可转让，在本服务之外没有价值。"],
        ["4. 失败、取消与退款", "失败或符合条件的取消任务，将依据平台状态和规则退还 credits。任务已经生成完成时，不会仅因结果不符合主观偏好而退款。"],
        ["5. 可接受使用", "不得使用本服务制作违法、欺诈、辱骂、侵权、有害或侵犯他人隐私的内容。为保护用户和服务，我们可以拒绝内容或限制访问。"],
        ["6. 支持与变更", "一般问题请打开 @Aurax_ai_bot 并发送 /support；支付问题请发送 /paysupport。我们可能更新条款，购买时展示的版本是当次购买所依据的版本。"],
      ], notice: "AI 输出可能不准确或不符合预期，发布或依赖结果前请自行审核。",
    },
    privacy: {
      eyebrow: "隐私", title: "隐私政策", intro: "本政策说明你使用 Telegram Bot 和小程序时，Fantivo AI 会处理哪些数据。",
      sections: [
        ["1. 我们接收的数据", "我们会接收 Telegram 向 Bot 或小程序提供的基础账户信息，例如用户 ID、姓名、用户名和语言；也会处理提示词、上传图片、任务记录、credits 余额和客服消息。"],
        ["2. 数据用途", "数据用于身份验证、提供生成服务、防止重复扣费或重复任务、维护余额、交付结果、防止滥用以及处理客服请求。"],
        ["3. 支付", "Telegram 负责处理 Stars 支付。我们仅接收核验和入账所需的交易编号、商品、金额与支付状态，不会收到你的密码、验证码或银行卡资料。"],
        ["4. 服务提供方", "数据只会在运营服务所必需时提供给 Telegram、基础设施或生成服务商，或依法披露。我们不会出售个人数据。"],
        ["5. 保存与安全", "我们仅在服务运营、安全、争议处理和法律义务所合理需要的期限内保存记录，并使用访问控制和签名请求等措施，但任何在线服务都无法保证绝对安全。"],
        ["6. 你的选择与支持", "你可以随时停止使用。隐私问题或数据请求请打开 @Aurax_ai_bot 并发送 /support；支付问题请发送 /paysupport。"],
      ], notice: "请勿向客服发送密码、Telegram 验证码或完整支付凭证。",
    },
  },
  ru: {
    back: "Fantivo AI", updated: `Действует и обновлено: ${VERSION}`,
    terms: { eyebrow: "ПРАВОВАЯ ИНФОРМАЦИЯ", title: "Условия использования", intro: "Эти Условия регулируют использование Fantivo AI через Telegram Bot и Mini App. Продолжая работу или покупая credits, вы принимаете текущую версию.", sections: [
      ["1. Сервис", "Fantivo AI создаёт AI-видео из текста или изображений, показывает задания и управляет credits. Доступность, модели, скорость и качество могут меняться."],
      ["2. Ваш контент", "У вас должны быть все права на отправляемые тексты, изображения и материалы. Вы отвечаете за ввод и использование результата."],
      ["3. Credits и Telegram Stars", "Цифровые credits покупаются за Telegram Stars и начисляются только после официального подтверждения успешной оплаты Telegram. Они не являются деньгами, не передаются и не имеют ценности вне сервиса."],
      ["4. Ошибки и отмена", "За неудачное или допустимо отменённое задание credits возвращаются по статусу и правилам платформы. Завершённый результат не возвращается лишь из-за субъективных предпочтений."],
      ["5. Допустимое использование", "Запрещён незаконный, обманный, оскорбительный, нарушающий права, вредоносный контент и нарушение приватности. Мы можем отклонить контент или ограничить доступ."],
      ["6. Поддержка и изменения", "Для помощи откройте @Aurax_ai_bot и отправьте /support, по оплате — /paysupport. Условия могут обновляться; при покупке применяется показанная версия."],
    ], notice: "Результат AI может быть неточным или неожиданным. Проверяйте его перед публикацией." },
    privacy: { eyebrow: "КОНФИДЕНЦИАЛЬНОСТЬ", title: "Политика конфиденциальности", intro: "Политика описывает данные, обрабатываемые Fantivo AI при использовании Bot и Mini App.", sections: [
      ["1. Получаемые данные", "Мы получаем предоставленные Telegram ID, имя, username и язык, а также обрабатываем запросы, изображения, задания, баланс credits и обращения в поддержку."],
      ["2. Использование", "Данные нужны для входа, генерации, защиты от повторных списаний и заданий, учёта баланса, доставки результатов, безопасности и поддержки."],
      ["3. Платежи", "Stars обрабатывает Telegram. Мы получаем только идентификатор транзакции, товар, сумму и статус для проверки и начисления. Пароли, коды подтверждения и данные банковской карты нам не поступают."],
      ["4. Поставщики", "Данные передаются Telegram и необходимым инфраструктурным или генеративным поставщикам либо по закону. Мы не продаём персональные данные."],
      ["5. Хранение и защита", "Записи хранятся разумный срок для сервиса, безопасности, споров и требований закона. Применяются контроль доступа и подписанные запросы, но абсолютная защита в интернете невозможна."],
      ["6. Выбор и поддержка", "Вы можете прекратить использование. По вопросам данных отправьте /support в @Aurax_ai_bot, по оплате — /paysupport."],
    ], notice: "Не отправляйте поддержке пароли, коды Telegram или полные платёжные реквизиты." },
  },
  vi: {
    back: "Fantivo AI", updated: `Có hiệu lực và cập nhật: ${VERSION}`,
    terms: { eyebrow: "PHÁP LÝ", title: "Điều khoản dịch vụ", intro: "Điều khoản này áp dụng khi bạn dùng Fantivo AI qua Telegram Bot và Mini App. Khi tiếp tục hoặc mua credits, bạn đồng ý với phiên bản hiện tại.", sections: [
      ["1. Dịch vụ", "Fantivo AI tạo video AI từ văn bản hoặc hình ảnh, hiển thị tác vụ và quản lý credits. Tính khả dụng, mô hình, tốc độ và chất lượng có thể thay đổi."],
      ["2. Nội dung của bạn", "Bạn phải có đủ quyền đối với mọi mô tả, hình ảnh và tài liệu gửi lên. Bạn chịu trách nhiệm về dữ liệu đầu vào và cách sử dụng kết quả."],
      ["3. Credits và Telegram Stars", "Credits kỹ thuật số được mua bằng Telegram Stars và chỉ được cộng sau xác nhận thanh toán thành công chính thức từ Telegram. Credits không phải tiền mặt, không thể chuyển và không có giá trị ngoài dịch vụ."],
      ["4. Tác vụ lỗi hoặc hủy", "Tác vụ lỗi hoặc được phép hủy sẽ hoàn credits theo trạng thái và quy định nền tảng. Tác vụ đã hoàn tất không được hoàn chỉ vì kết quả không đúng sở thích chủ quan."],
      ["5. Sử dụng hợp lệ", "Không dùng dịch vụ cho nội dung trái pháp luật, lừa đảo, lạm dụng, vi phạm quyền, gây hại hoặc xâm phạm riêng tư. Chúng tôi có thể từ chối nội dung hoặc giới hạn truy cập."],
      ["6. Hỗ trợ", "Mở @Aurax_ai_bot và gửi /support để được trợ giúp, hoặc /paysupport cho thanh toán. Điều khoản có thể được cập nhật; giao dịch áp dụng phiên bản được hiển thị khi mua."],
    ], notice: "Kết quả AI có thể không chính xác hoặc ngoài dự kiến. Hãy kiểm tra trước khi công bố." },
    privacy: { eyebrow: "QUYỀN RIÊNG TƯ", title: "Chính sách quyền riêng tư", intro: "Chính sách này mô tả dữ liệu Fantivo AI xử lý khi bạn dùng Bot và Mini App.", sections: [
      ["1. Dữ liệu nhận được", "Chúng tôi nhận ID Telegram, tên, tên người dùng và ngôn ngữ do Telegram cung cấp; đồng thời xử lý mô tả, ảnh, tác vụ, số dư credits và tin nhắn hỗ trợ."],
      ["2. Cách sử dụng", "Dữ liệu dùng để xác thực, tạo nội dung, tránh tính phí hoặc tác vụ trùng, quản lý số dư, gửi kết quả, ngăn lạm dụng và hỗ trợ."],
      ["3. Thanh toán", "Telegram xử lý Stars. Chúng tôi chỉ nhận mã giao dịch, sản phẩm, số tiền và trạng thái cần để xác minh và cộng credits; không nhận mật khẩu, mã xác minh hoặc dữ liệu thẻ ngân hàng."],
      ["4. Nhà cung cấp", "Dữ liệu chỉ được chia sẻ với Telegram và nhà cung cấp hạ tầng/tạo nội dung cần thiết, hoặc theo pháp luật. Chúng tôi không bán dữ liệu cá nhân."],
      ["5. Lưu giữ và bảo mật", "Hồ sơ chỉ được giữ trong thời gian hợp lý cho dịch vụ, bảo mật, tranh chấp và nghĩa vụ pháp lý. Chúng tôi dùng kiểm soát truy cập và yêu cầu có chữ ký, nhưng không dịch vụ trực tuyến nào an toàn tuyệt đối."],
      ["6. Lựa chọn và hỗ trợ", "Bạn có thể ngừng dùng bất cứ lúc nào. Gửi /support tới @Aurax_ai_bot cho yêu cầu dữ liệu, hoặc /paysupport cho vấn đề thanh toán."],
    ], notice: "Không gửi mật khẩu, mã xác minh Telegram hoặc toàn bộ thông tin thanh toán cho hỗ trợ." },
  },
  id: {
    back: "Fantivo AI", updated: `Berlaku dan diperbarui: ${VERSION}`,
    terms: { eyebrow: "HUKUM", title: "Ketentuan Layanan", intro: "Ketentuan ini mengatur penggunaan Fantivo AI melalui Telegram Bot dan Mini App. Dengan melanjutkan atau membeli credits, Anda menyetujui versi saat ini.", sections: [
      ["1. Layanan", "Fantivo AI membuat video AI dari teks atau gambar, menampilkan tugas, dan mengelola credits. Ketersediaan, model, kecepatan, dan kualitas dapat berubah."],
      ["2. Konten Anda", "Anda harus memiliki hak dan izin untuk semua prompt, gambar, dan materi yang dikirim. Anda bertanggung jawab atas input dan penggunaan hasil."],
      ["3. Credits dan Telegram Stars", "Credits digital dibeli dengan Telegram Stars dan hanya ditambahkan setelah konfirmasi resmi pembayaran berhasil dari Telegram. Credits bukan uang tunai, tidak dapat dipindahtangankan, dan tidak bernilai di luar layanan."],
      ["4. Tugas gagal atau dibatalkan", "Tugas gagal atau pembatalan yang memenuhi syarat dikembalikan sesuai status dan aturan platform. Tugas yang selesai tidak dikembalikan hanya karena hasil tidak sesuai selera subjektif."],
      ["5. Penggunaan yang diizinkan", "Jangan gunakan layanan untuk konten ilegal, menipu, kasar, melanggar hak, berbahaya, atau melanggar privasi. Kami dapat menolak konten atau membatasi akses."],
      ["6. Dukungan", "Buka @Aurax_ai_bot dan kirim /support untuk bantuan atau /paysupport untuk pembayaran. Ketentuan dapat berubah; pembelian mengikuti versi yang ditampilkan."],
    ], notice: "Hasil AI dapat tidak akurat atau tidak terduga. Tinjau sebelum dipublikasikan." },
    privacy: { eyebrow: "PRIVASI", title: "Kebijakan Privasi", intro: "Kebijakan ini menjelaskan data yang diproses Fantivo AI saat Anda menggunakan Bot dan Mini App.", sections: [
      ["1. Data yang diterima", "Kami menerima ID Telegram, nama, nama pengguna, dan bahasa yang disediakan Telegram, serta memproses prompt, gambar, tugas, saldo credits, dan pesan dukungan."],
      ["2. Penggunaan data", "Data digunakan untuk autentikasi, pembuatan, mencegah biaya atau tugas ganda, memelihara saldo, mengirim hasil, mencegah penyalahgunaan, dan dukungan."],
      ["3. Pembayaran", "Telegram memproses Stars. Kami hanya menerima ID transaksi, produk, jumlah, dan status untuk verifikasi dan penambahan credits; bukan kata sandi, kode verifikasi, atau data kartu bank."],
      ["4. Penyedia", "Data hanya dibagikan kepada Telegram dan penyedia infrastruktur/generasi yang diperlukan, atau jika diwajibkan hukum. Kami tidak menjual data pribadi."],
      ["5. Penyimpanan dan keamanan", "Catatan disimpan selama wajar untuk layanan, keamanan, sengketa, dan kewajiban hukum. Kami menggunakan kontrol akses dan permintaan bertanda tangan, tetapi layanan online tidak bisa menjamin keamanan mutlak."],
      ["6. Pilihan dan dukungan", "Anda dapat berhenti menggunakan layanan. Kirim /support ke @Aurax_ai_bot untuk permintaan data, atau /paysupport untuk pembayaran."],
    ], notice: "Jangan kirim kata sandi, kode verifikasi Telegram, atau data pembayaran lengkap kepada dukungan." },
  },
  ms: {
    back: "Fantivo AI", updated: `Berkuat kuasa dan dikemas kini: ${VERSION}`,
    terms: { eyebrow: "UNDANG-UNDANG", title: "Syarat Perkhidmatan", intro: "Syarat ini mengawal penggunaan Fantivo AI melalui Telegram Bot dan Mini App. Dengan meneruskan atau membeli credits, anda bersetuju dengan versi semasa.", sections: [
      ["1. Perkhidmatan", "Fantivo AI menghasilkan video AI daripada teks atau imej, memaparkan tugasan dan mengurus credits. Ketersediaan, model, kelajuan dan kualiti boleh berubah."],
      ["2. Kandungan anda", "Anda mesti mempunyai hak dan kebenaran untuk semua prompt, imej dan bahan yang dihantar. Anda bertanggungjawab atas input dan penggunaan hasil."],
      ["3. Credits dan Telegram Stars", "Credits digital dibeli dengan Telegram Stars dan hanya ditambah selepas pengesahan rasmi pembayaran berjaya daripada Telegram. Credits bukan wang tunai, tidak boleh dipindah dan tiada nilai di luar perkhidmatan."],
      ["4. Tugasan gagal atau dibatalkan", "Tugasan gagal atau pembatalan yang layak dipulangkan mengikut status dan peraturan platform. Tugasan lengkap tidak dipulangkan hanya kerana hasil tidak menepati pilihan subjektif."],
      ["5. Penggunaan dibenarkan", "Jangan gunakan perkhidmatan untuk kandungan haram, menipu, kesat, melanggar hak, berbahaya atau menjejaskan privasi. Kami boleh menolak kandungan atau mengehadkan akses."],
      ["6. Sokongan", "Buka @Aurax_ai_bot dan hantar /support untuk bantuan atau /paysupport bagi pembayaran. Syarat boleh berubah; pembelian menggunakan versi yang dipaparkan."],
    ], notice: "Output AI mungkin tidak tepat atau tidak dijangka. Semak sebelum menerbitkannya." },
    privacy: { eyebrow: "PRIVASI", title: "Dasar Privasi", intro: "Dasar ini menerangkan data yang diproses Fantivo AI apabila anda menggunakan Bot dan Mini App.", sections: [
      ["1. Data diterima", "Kami menerima ID Telegram, nama, nama pengguna dan bahasa yang disediakan Telegram serta memproses prompt, imej, tugasan, baki credits dan mesej sokongan."],
      ["2. Penggunaan data", "Data digunakan untuk pengesahan, penjanaan, mencegah caj atau tugasan berganda, menyelenggara baki, menghantar hasil, mencegah penyalahgunaan dan sokongan."],
      ["3. Pembayaran", "Telegram memproses Stars. Kami hanya menerima ID transaksi, produk, jumlah dan status untuk pengesahan dan penambahan credits; bukan kata laluan, kod pengesahan atau butiran kad bank."],
      ["4. Penyedia", "Data hanya dikongsi dengan Telegram dan penyedia infrastruktur/penjanaan yang diperlukan, atau apabila dikehendaki undang-undang. Kami tidak menjual data peribadi."],
      ["5. Penyimpanan dan keselamatan", "Rekod disimpan selama munasabah untuk perkhidmatan, keselamatan, pertikaian dan kewajipan undang-undang. Kami menggunakan kawalan akses dan permintaan bertandatangan, tetapi tiada perkhidmatan dalam talian yang benar-benar selamat."],
      ["6. Pilihan dan sokongan", "Anda boleh berhenti menggunakan perkhidmatan. Hantar /support kepada @Aurax_ai_bot untuk permintaan data, atau /paysupport untuk pembayaran."],
    ], notice: "Jangan hantar kata laluan, kod pengesahan Telegram atau butiran pembayaran penuh kepada sokongan." },
  },
  th: {
    back: "Fantivo AI", updated: `มีผลและอัปเดตล่าสุด: ${VERSION}`,
    terms: { eyebrow: "ข้อกฎหมาย", title: "ข้อกำหนดการใช้บริการ", intro: "ข้อกำหนดนี้ใช้กับ Fantivo AI ผ่าน Telegram Bot และ Mini App เมื่อใช้งานต่อหรือซื้อ credits ถือว่าคุณยอมรับฉบับปัจจุบัน", sections: [
      ["1. บริการ", "Fantivo AI สร้างวิดีโอ AI จากข้อความหรือภาพ แสดงงาน และจัดการ credits ความพร้อมใช้งาน โมเดล ความเร็ว และคุณภาพอาจเปลี่ยนแปลง"],
      ["2. เนื้อหาของคุณ", "คุณต้องมีสิทธิ์และการอนุญาตสำหรับข้อความ ภาพ และสื่อทั้งหมดที่ส่ง คุณรับผิดชอบต่อข้อมูลเข้าและการใช้ผลลัพธ์"],
      ["3. Credits และ Telegram Stars", "ซื้อ credits ดิจิทัลด้วย Telegram Stars และจะเพิ่มเมื่อได้รับการยืนยันการชำระสำเร็จอย่างเป็นทางการจาก Telegram เท่านั้น Credits ไม่ใช่เงินสด โอนไม่ได้ และไม่มีมูลค่านอกบริการ"],
      ["4. งานล้มเหลวหรือยกเลิก", "งานล้มเหลวหรือการยกเลิกที่เข้าเงื่อนไขจะคืน credits ตามสถานะและกฎแพลตฟอร์ม งานที่เสร็จแล้วไม่คืนเพียงเพราะผลไม่ตรงกับความชอบส่วนตัว"],
      ["5. การใช้งานที่ยอมรับได้", "ห้ามใช้บริการกับเนื้อหาผิดกฎหมาย หลอกลวง ละเมิด เป็นอันตราย หรือละเมิดความเป็นส่วนตัว เราอาจปฏิเสธเนื้อหาหรือจำกัดการเข้าถึง"],
      ["6. การช่วยเหลือ", "เปิด @Aurax_ai_bot แล้วส่ง /support เพื่อขอความช่วยเหลือ หรือ /paysupport สำหรับการชำระเงิน ข้อกำหนดอาจปรับปรุงและการซื้อใช้ฉบับที่แสดง"],
    ], notice: "ผลลัพธ์ AI อาจไม่ถูกต้องหรือไม่เป็นไปตามคาด โปรดตรวจสอบก่อนเผยแพร่" },
    privacy: { eyebrow: "ความเป็นส่วนตัว", title: "นโยบายความเป็นส่วนตัว", intro: "นโยบายนี้อธิบายข้อมูลที่ Fantivo AI ประมวลผลเมื่อคุณใช้ Bot และ Mini App", sections: [
      ["1. ข้อมูลที่ได้รับ", "เราได้รับ ID Telegram ชื่อ username และภาษาที่ Telegram ให้ และประมวลผลข้อความ ภาพ งาน ยอด credits และข้อความช่วยเหลือ"],
      ["2. การใช้ข้อมูล", "ใช้ข้อมูลเพื่อยืนยันตัวตน สร้างผลงาน ป้องกันการเรียกเก็บหรือสร้างงานซ้ำ ดูแลยอด ส่งผลลัพธ์ ป้องกันการใช้ผิด และให้ความช่วยเหลือ"],
      ["3. การชำระเงิน", "Telegram ประมวลผล Stars เราได้รับเพียงรหัสธุรกรรม สินค้า จำนวนและสถานะที่จำเป็นต่อการตรวจสอบและเพิ่ม credits ไม่ได้รับรหัสผ่าน รหัสยืนยัน หรือข้อมูลบัตรธนาคาร"],
      ["4. ผู้ให้บริการ", "แบ่งปันข้อมูลเฉพาะกับ Telegram และผู้ให้บริการโครงสร้างพื้นฐาน/การสร้างที่จำเป็น หรือตามกฎหมาย เราไม่ขายข้อมูลส่วนบุคคล"],
      ["5. การเก็บและความปลอดภัย", "เก็บบันทึกเท่าที่จำเป็นต่อบริการ ความปลอดภัย ข้อพิพาท และกฎหมาย เราใช้การควบคุมสิทธิ์และคำขอที่ลงนาม แต่ไม่มีบริการออนไลน์ที่ปลอดภัยอย่างสมบูรณ์"],
      ["6. ตัวเลือกและการช่วยเหลือ", "คุณหยุดใช้ได้ทุกเมื่อ ส่ง /support ถึง @Aurax_ai_bot สำหรับคำขอข้อมูล หรือ /paysupport สำหรับการชำระเงิน"],
    ], notice: "อย่าส่งรหัสผ่าน รหัสยืนยัน Telegram หรือข้อมูลการชำระเงินทั้งหมดให้ฝ่ายช่วยเหลือ" },
  },
};

const addedLocaleMeta = {
  uk: { back: "Fantivo AI", updated: `Чинна редакція від: ${VERSION}`, terms: ["ПРАВОВА ІНФОРМАЦІЯ", "Умови використання", "Ці Умови регулюють використання Fantivo AI через Telegram Bot і Mini App."], privacy: ["КОНФІДЕНЦІЙНІСТЬ", "Політика конфіденційності", "Ця політика пояснює, які дані обробляє Fantivo AI під час використання Bot і Mini App."] },
  uz: { back: "Fantivo AI", updated: `Amal qiladi va yangilangan: ${VERSION}`, terms: ["HUQUQIY MA’LUMOT", "Foydalanish shartlari", "Ushbu Shartlar Fantivo AI’dan Telegram Bot va Mini App orqali foydalanishni tartibga soladi."], privacy: ["MAXFIYLIK", "Maxfiylik siyosati", "Ushbu siyosat Bot va Mini App’dan foydalanganda Fantivo AI qayta ishlaydigan ma’lumotlarni tushuntiradi."] },
  kk: { back: "Fantivo AI", updated: `Күшіне енген және жаңартылған күні: ${VERSION}`, terms: ["ҚҰҚЫҚТЫҚ АҚПАРАТ", "Қызмет көрсету шарттары", "Осы Шарттар Fantivo AI-ды Telegram Bot және Mini App арқылы пайдалануды реттейді."], privacy: ["ҚҰПИЯЛЫЛЫҚ", "Құпиялық саясаты", "Бұл саясат Bot және Mini App қолданылғанда Fantivo AI өңдейтін деректерді түсіндіреді."] },
  es: { back: "Fantivo AI", updated: `Vigente y actualizado: ${VERSION}`, terms: ["INFORMACIÓN LEGAL", "Términos del servicio", "Estas condiciones regulan el uso de Fantivo AI mediante Telegram Bot y Mini App."], privacy: ["PRIVACIDAD", "Política de privacidad", "Esta política explica los datos que procesa Fantivo AI al usar el Bot y la Mini App."] },
  "pt-BR": { back: "Fantivo AI", updated: `Em vigor e atualizado: ${VERSION}`, terms: ["JURÍDICO", "Termos de Serviço", "Estes Termos regem o uso do Fantivo AI pelo Telegram Bot e Mini App."], privacy: ["PRIVACIDADE", "Política de Privacidade", "Esta política explica os dados processados pelo Fantivo AI ao usar o Bot e Mini App."] },
  ar: { back: "Fantivo AI", updated: `ساري ومحدّث: ${VERSION}`, terms: ["قانوني", "شروط الخدمة", "تحكم هذه الشروط استخدام Fantivo AI عبر Telegram Bot وMini App."], privacy: ["الخصوصية", "سياسة الخصوصية", "توضح هذه السياسة البيانات التي يعالجها Fantivo AI عند استخدام Bot وMini App."] },
  tr: { back: "Fantivo AI", updated: `Yürürlük ve güncelleme: ${VERSION}`, terms: ["YASAL", "Hizmet Koşulları", "Bu Koşullar, Fantivo AI'nun Telegram Bot ve Mini App üzerinden kullanımını düzenler."], privacy: ["GİZLİLİK", "Gizlilik Politikası", "Bu politika, Bot ve Mini App kullanılırken Fantivo AI'nun işlediği verileri açıklar."] },
  fa: { back: "Fantivo AI", updated: `لازم‌الاجرا و به‌روزشده: ${VERSION}`, terms: ["حقوقی", "شرایط خدمات", "این شرایط استفاده از Fantivo AI از طریق Telegram Bot و Mini App را تنظیم می‌کند."], privacy: ["حریم خصوصی", "سیاست حریم خصوصی", "این سیاست داده‌هایی را که Fantivo AI هنگام استفاده از Bot و Mini App پردازش می‌کند توضیح می‌دهد."] },
  hi: { back: "Fantivo AI", updated: `प्रभावी और अंतिम अपडेट: ${VERSION}`, terms: ["कानूनी", "सेवा की शर्तें", "ये शर्तें Telegram Bot और Mini App से Fantivo AI के उपयोग पर लागू होती हैं।"], privacy: ["गोपनीयता", "गोपनीयता नीति", "यह नीति Bot और Mini App के उपयोग पर Fantivo AI द्वारा संसाधित डेटा बताती है।"] },
};

const addedLocaleSections = {
  uk: {
    terms: [
      ["1. Сервіс", "Fantivo AI створює AI-відео з тексту або зображень, показує завдання та керує credits. Доступність, моделі, швидкість і якість можуть змінюватися."],
      ["2. Ваш контент", "Ви повинні мати всі необхідні права й дозволи на кожен текст, зображення та інший матеріал, який надсилаєте. Ви відповідаєте за вхідні матеріали та використання результатів."],
      ["3. Credits і Telegram Stars", "Цифрові credits купуються за Telegram Stars і нараховуються лише після офіційного підтвердження успішної оплати від Telegram. Вони не є грошима, не передаються та не мають цінності поза сервісом."],
      ["4. Невдалі або скасовані завдання", "За невдалі або належним чином скасовані завдання credits повертаються відповідно до статусу й правил платформи. Завершене завдання не повертається лише через суб’єктивне невдоволення результатом."],
      ["5. Допустиме використання", "Не використовуйте сервіс для незаконного, оманливого, образливого, шкідливого контенту, порушення прав або приватності. Ми можемо відхилити контент чи обмежити доступ."],
      ["6. Підтримка", "Для допомоги відкрийте @Aurax_ai_bot і надішліть /support, а щодо оплати — /paysupport. Умови можуть змінюватися; до покупки застосовується показана версія."],
    ],
    privacy: [
      ["1. Дані, які ми отримуємо", "Ми отримуємо надані Telegram ID, ім’я, username і мову, а також обробляємо запити, зображення, завдання, баланс credits і повідомлення підтримці."],
      ["2. Використання даних", "Дані потрібні для автентифікації, генерації, запобігання повторним списанням і завданням, ведення балансу, доставки результатів, запобігання зловживанням і підтримки."],
      ["3. Платежі", "Telegram обробляє платежі Stars. Ми отримуємо лише ідентифікатор транзакції, товар, суму та статус, потрібні для перевірки й нарахування. Ми не отримуємо пароль, код підтвердження або дані банківської картки."],
      ["4. Постачальники", "Дані передаються лише Telegram і необхідним постачальникам інфраструктури чи генерації або коли цього вимагає закон. Ми не продаємо персональні дані."],
      ["5. Зберігання та безпека", "Ми зберігаємо записи протягом розумного строку для роботи сервісу, безпеки, вирішення спорів і виконання юридичних обов’язків. Ми застосовуємо контроль доступу й підписані запити, але жоден онлайн-сервіс не є абсолютно безпечним."],
      ["6. Ваш вибір і підтримка", "Ви можете припинити користування сервісом. Для запиту щодо даних надішліть /support до @Aurax_ai_bot, а щодо оплати — /paysupport."],
    ],
    termsNotice: "Результат AI може бути неточним або неочікуваним. Перевірте його перед публікацією.",
    privacyNotice: "Не надсилайте підтримці паролі, коди підтвердження Telegram або повні платіжні дані.",
  },
  uz: {
    terms: [
      ["1. Xizmat", "Fantivo AI matn yoki rasmlardan AI-video yaratadi, vazifalarni ko‘rsatadi va credits’ni boshqaradi. Mavjudlik, modellar, tezlik va sifat o‘zgarishi mumkin."],
      ["2. Kontentingiz", "Yuborgan har bir matn, rasm va material uchun zarur huquq va ruxsatlarga ega bo‘lishingiz kerak. Kiritilgan ma’lumotlar va natijalardan foydalanish uchun siz javobgarsiz."],
      ["3. Credits va Telegram Stars", "Raqamli credits Telegram Stars bilan sotib olinadi va faqat Telegram to‘lov muvaffaqiyatli bo‘lganini rasman tasdiqlagandan keyin qo‘shiladi. Ular pul emas, o‘tkazilmaydi va xizmatdan tashqarida qiymatga ega emas."],
      ["4. Muvaffaqiyatsiz yoki bekor qilingan vazifalar", "Muvaffaqiyatsiz yoki talablarga muvofiq bekor qilingan vazifalar uchun credits platforma holati va qoidalariga ko‘ra qaytariladi. Tugallangan vazifa faqat natija subyektiv istakka mos kelmagani uchun qaytarilmaydi."],
      ["5. Ruxsat etilgan foydalanish", "Xizmatdan noqonuniy, aldamchi, haqoratli, huquqlarni buzuvchi, zararli yoki maxfiylikni buzuvchi kontent uchun foydalanmang. Biz kontentni rad etishimiz yoki kirishni cheklashimiz mumkin."],
      ["6. Yordam", "Yordam uchun @Aurax_ai_bot’da /support, to‘lov uchun /paysupport yuboring. Shartlar o‘zgarishi mumkin; xaridga ko‘rsatilgan versiya qo‘llanadi."],
    ],
    privacy: [
      ["1. Olinadigan ma’lumotlar", "Biz Telegram taqdim etgan ID, ism, username va tilni olamiz, shuningdek so‘rovlar, rasmlar, vazifalar, credits balansi va yordam xabarlarini qayta ishlaymiz."],
      ["2. Ma’lumotlardan foydalanish", "Ma’lumotlar autentifikatsiya, yaratish, takroriy to‘lov va vazifalarni oldini olish, balansni yuritish, natijani yetkazish, suiiste’molning oldini olish va yordam ko‘rsatish uchun ishlatiladi."],
      ["3. To‘lovlar", "Stars to‘lovlarini Telegram qayta ishlaydi. Biz tekshirish va credits qo‘shish uchun zarur bo‘lgan tranzaksiya ID si, mahsulot, summa va holatni olamiz. Parol, tasdiqlash kodi yoki bank karta ma’lumotlarini olmaymiz."],
      ["4. Xizmat ko‘rsatuvchilar", "Ma’lumotlar faqat zarur Telegram, infratuzilma yoki yaratish provayderlari bilan yoxud qonun talabi asosida ulashiladi. Biz shaxsiy ma’lumotlarni sotmaymiz."],
      ["5. Saqlash va xavfsizlik", "Yozuvlar xizmat, xavfsizlik, nizolar va huquqiy majburiyatlar uchun oqilona muddat saqlanadi. Kirish nazorati va imzolangan so‘rovlardan foydalanamiz, ammo hech bir onlayn xizmat mutlaq xavfsiz emas."],
      ["6. Tanlov va yordam", "Xizmatdan foydalanishni istalgan payt to‘xtatishingiz mumkin. Ma’lumot so‘rovi uchun @Aurax_ai_bot’ga /support, to‘lov uchun /paysupport yuboring."],
    ],
    termsNotice: "AI natijasi noto‘g‘ri yoki kutilmagan bo‘lishi mumkin. Uni e’lon qilishdan oldin tekshiring.",
    privacyNotice: "Yordam xizmatiga parol, Telegram tasdiqlash kodi yoki to‘liq to‘lov ma’lumotlarini yubormang.",
  },
  kk: {
    terms: [
      ["1. Қызмет", "Fantivo AI мәтіннен немесе суреттен AI-видео жасайды, тапсырмаларды көрсетеді және credits-ті басқарады. Қолжетімділік, модельдер, жылдамдық және сапа өзгеруі мүмкін."],
      ["2. Сіздің контентіңіз", "Жіберген әрбір мәтінге, суретке және материалға қажетті құқықтар мен рұқсаттарға ие болуыңыз керек. Кіріс деректері мен нәтижені пайдалану үшін сіз жауаптысыз."],
      ["3. Credits және Telegram Stars", "Цифрлық credits Telegram Stars арқылы сатып алынады және Telegram төлемнің сәтті өткенін ресми растағаннан кейін ғана қосылады. Олар ақша емес, берілмейді және қызметтен тыс құны жоқ."],
      ["4. Сәтсіз немесе тоқтатылған тапсырмалар", "Сәтсіз немесе талапқа сай тоқтатылған тапсырмалар үшін credits платформа күйі мен ережелеріне сәйкес қайтарылады. Аяқталған тапсырма нәтиже субъективті талғамға сәйкес келмегені үшін ғана қайтарылмайды."],
      ["5. Рұқсат етілген пайдалану", "Қызметті заңсыз, алдамшы, қорлайтын, құқықтарды бұзатын, зиянды немесе құпиялықты бұзатын контент үшін пайдаланбаңыз. Біз контентті қабылдамауымыз немесе қолжетімділікті шектеуіміз мүмкін."],
      ["6. Қолдау", "Көмек үшін @Aurax_ai_bot ішінде /support, ал төлем үшін /paysupport жіберіңіз. Шарттар өзгеруі мүмкін; сатып алуға көрсетілген нұсқа қолданылады."],
    ],
    privacy: [
      ["1. Алынатын деректер", "Біз Telegram ұсынған ID, аты, username және тілді аламыз, сондай-ақ сұрауларды, суреттерді, тапсырмаларды, credits балансын және қолдау хабарларын өңдейміз."],
      ["2. Деректерді пайдалану", "Деректер аутентификация, жасау, қайталанатын төлемдер мен тапсырмаларды болдырмау, балансты жүргізу, нәтижені жеткізу, теріс пайдалануды болдырмау және қолдау үшін пайдаланылады."],
      ["3. Төлемдер", "Stars төлемдерін Telegram өңдейді. Біз тек тексеру және credits қосу үшін қажет транзакция ID-сін, өнімді, соманы және күйді аламыз. Құпиясөзді, растау кодын немесе банк картасының деректерін алмаймыз."],
      ["4. Қызмет көрсетушілер", "Деректер тек қажетті Telegram, инфрақұрылым немесе жасау провайдерлерімен не заң талабы бойынша бөлісіледі. Біз жеке деректерді сатпаймыз."],
      ["5. Сақтау және қауіпсіздік", "Жазбалар қызмет, қауіпсіздік, даулар және заңды міндеттер үшін орынды мерзім сақталады. Біз қолжетімділікті басқару мен қол қойылған сұрауларды қолданамыз, бірақ ешбір онлайн қызмет толық қауіпсіз емес."],
      ["6. Таңдау және қолдау", "Қызметті пайдалануды кез келген уақытта тоқтата аласыз. Деректер сұрауы үшін @Aurax_ai_bot-қа /support, төлем үшін /paysupport жіберіңіз."],
    ],
    termsNotice: "AI нәтижесі қате немесе күтпеген болуы мүмкін. Жарияламас бұрын тексеріңіз.",
    privacyNotice: "Қолдау қызметіне құпиясөздерді, Telegram растау кодтарын немесе толық төлем деректерін жібермеңіз.",
  },
  es: {
    terms: [
      ["1. Servicio", "Fantivo AI crea vídeos con IA a partir de texto o imágenes, muestra trabajos y gestiona credits. La disponibilidad, los modelos, la velocidad y la calidad pueden cambiar."],
      ["2. Tu contenido", "Debes contar con los derechos y permisos para todo texto, imagen o material enviado. Eres responsable de las entradas y del uso de los resultados."],
      ["3. Credits y Telegram Stars", "Los credits digitales se compran con Telegram Stars y solo se añaden tras la confirmación oficial de pago de Telegram. No son dinero, no se transfieren y no tienen valor fuera del servicio."],
      ["4. Trabajos fallidos o cancelados", "Los trabajos fallidos o las cancelaciones válidas se reembolsan según el estado y las reglas de la plataforma. Un trabajo completado no se reembolsa solo por preferencias subjetivas."],
      ["5. Uso permitido", "No uses el servicio para contenido ilegal, engañoso, abusivo, infractor, dañino o que vulnere la privacidad. Podemos rechazar contenido o limitar el acceso."],
      ["6. Soporte", "Abre @Aurax_ai_bot y envía /support para ayuda o /paysupport para pagos. Los términos pueden cambiar; la compra usa la versión mostrada."],
    ],
    privacy: [
      ["1. Datos recibidos", "Recibimos el ID, nombre, usuario e idioma que proporciona Telegram, y procesamos instrucciones, imágenes, trabajos, saldo de credits y mensajes de soporte."],
      ["2. Uso de los datos", "Los usamos para autenticar, generar contenido, evitar cobros o trabajos duplicados, mantener saldos, entregar resultados, prevenir abusos y prestar soporte."],
      ["3. Pagos", "Telegram procesa Stars. Solo recibimos el identificador, producto, importe y estado necesarios para verificar y acreditar. No recibimos contraseñas, códigos de verificación ni datos bancarios."],
      ["4. Proveedores", "Los datos solo se comparten con Telegram y proveedores de infraestructura o generación necesarios, o por obligación legal. No vendemos datos personales."],
      ["5. Conservación y seguridad", "Conservamos registros el tiempo razonable para el servicio, la seguridad, disputas y obligaciones legales. Usamos controles de acceso y solicitudes firmadas, pero ningún servicio en línea es absolutamente seguro."],
      ["6. Opciones y soporte", "Puedes dejar de usar el servicio. Envía /support a @Aurax_ai_bot para solicitudes de datos o /paysupport para pagos."],
    ],
    termsNotice: "Los resultados de IA pueden ser inexactos o inesperados. Revísalos antes de publicarlos.",
    privacyNotice: "No envíes contraseñas, códigos de Telegram ni credenciales de pago completas al soporte.",
  },
  "pt-BR": {
    terms: [
      ["1. Serviço", "O Fantivo AI cria vídeos de IA a partir de texto ou imagens, mostra trabalhos e gerencia credits. Disponibilidade, modelos, velocidade e qualidade podem mudar."],
      ["2. Seu conteúdo", "Você deve ter os direitos e permissões para todo texto, imagem ou material enviado. Você é responsável pelas entradas e pelo uso dos resultados."],
      ["3. Credits e Telegram Stars", "Os credits digitais são comprados com Telegram Stars e só entram após a confirmação oficial do Telegram. Não são dinheiro, não podem ser transferidos e não têm valor fora do serviço."],
      ["4. Trabalhos com falha ou cancelados", "Falhas e cancelamentos elegíveis são reembolsados conforme o status e as regras da plataforma. Um trabalho concluído não é reembolsado apenas por preferência subjetiva."],
      ["5. Uso permitido", "Não use o serviço para conteúdo ilegal, enganoso, abusivo, infrator, nocivo ou que viole a privacidade. Podemos rejeitar conteúdo ou limitar o acesso."],
      ["6. Suporte", "Abra @Aurax_ai_bot e envie /support para ajuda ou /paysupport para pagamentos. Os Termos podem mudar; a compra usa a versão exibida."],
    ],
    privacy: [
      ["1. Dados recebidos", "Recebemos ID, nome, usuário e idioma fornecidos pelo Telegram e processamos prompts, imagens, trabalhos, saldo de credits e mensagens de suporte."],
      ["2. Uso dos dados", "Usamos os dados para autenticação, geração, prevenção de cobranças ou trabalhos duplicados, saldo, entrega, prevenção de abuso e suporte."],
      ["3. Pagamentos", "O Telegram processa Stars. Recebemos apenas identificador, produto, valor e status necessários para verificar e creditar. Não recebemos senha, código de verificação ou dados do cartão."],
      ["4. Provedores", "Os dados são compartilhados somente com Telegram e provedores de infraestrutura ou geração necessários, ou por lei. Não vendemos dados pessoais."],
      ["5. Retenção e segurança", "Mantemos registros pelo tempo razoável para serviço, segurança, disputas e obrigações legais. Usamos controle de acesso e solicitações assinadas, mas nenhum serviço on-line é absolutamente seguro."],
      ["6. Escolhas e suporte", "Você pode parar de usar o serviço. Envie /support a @Aurax_ai_bot para dados ou /paysupport para pagamentos."],
    ],
    termsNotice: "A saída da IA pode ser imprecisa ou inesperada. Revise antes de publicar.",
    privacyNotice: "Não envie senhas, códigos do Telegram ou credenciais completas de pagamento ao suporte.",
  },
  ar: {
    terms: [
      ["1. الخدمة", "ينشئ Fantivo AI مقاطع فيديو بالذكاء الاصطناعي من النصوص أو الصور ويعرض المهام ويدير credits. قد تتغير الإتاحة والنماذج والسرعة والجودة."],
      ["2. المحتوى الخاص بك", "يجب أن تملك الحقوق والأذونات لكل نص أو صورة أو مادة ترسلها. أنت مسؤول عن المدخلات واستخدام النتائج."],
      ["3. Credits وTelegram Stars", "تُشترى credits الرقمية عبر Telegram Stars ولا تُضاف إلا بعد تأكيد الدفع الرسمي من Telegram. ليست نقودًا ولا يمكن نقلها ولا قيمة لها خارج الخدمة."],
      ["4. المهام الفاشلة أو الملغاة", "تُعاد credits للمهام الفاشلة أو الإلغاءات المؤهلة وفق حالة المنصة وقواعدها. لا تُرد تكلفة مهمة مكتملة لمجرد عدم موافقة النتيجة لتفضيل شخصي."],
      ["5. الاستخدام المقبول", "لا تستخدم الخدمة لمحتوى غير قانوني أو مخادع أو مسيء أو منتهك أو ضار أو يمس الخصوصية. قد نرفض المحتوى أو نقيّد الوصول."],
      ["6. الدعم", "افتح @Aurax_ai_bot وأرسل /support للمساعدة أو /paysupport للدفع. قد تتغير الشروط؛ ينطبق الإصدار المعروض عند الشراء."],
    ],
    privacy: [
      ["1. البيانات التي نستلمها", "نستلم معرّف Telegram والاسم واسم المستخدم واللغة، ونعالج الأوامر والصور والمهام ورصيد credits ورسائل الدعم."],
      ["2. استخدام البيانات", "نستخدم البيانات للمصادقة والإنشاء ومنع الرسوم أو المهام المكررة وإدارة الرصيد وتسليم النتائج ومنع الإساءة وتقديم الدعم."],
      ["3. المدفوعات", "يعالج Telegram مدفوعات Stars. نستلم فقط معرّف المعاملة والمنتج والمبلغ والحالة للتحقق والإضافة، ولا نستلم كلمة المرور أو رمز التحقق أو بيانات البطاقة."],
      ["4. مزودو الخدمة", "لا تُشارك البيانات إلا مع Telegram ومزودي البنية أو الإنشاء الضروريين أو عند طلب القانون. لا نبيع البيانات الشخصية."],
      ["5. الاحتفاظ والأمان", "نحتفظ بالسجلات للمدة المعقولة للتشغيل والأمان والنزاعات والالتزامات القانونية. نستخدم ضوابط وصول وطلبات موقعة، لكن لا توجد خدمة إلكترونية آمنة تمامًا."],
      ["6. خياراتك والدعم", "يمكنك التوقف عن الاستخدام. أرسل /support إلى @Aurax_ai_bot لطلبات البيانات أو /paysupport للدفع."],
    ],
    termsNotice: "قد تكون مخرجات الذكاء الاصطناعي غير دقيقة أو غير متوقعة. راجعها قبل النشر.",
    privacyNotice: "لا ترسل كلمات المرور أو رموز Telegram أو بيانات الدفع الكاملة إلى الدعم.",
  },
  tr: {
    terms: [
      ["1. Hizmet", "Fantivo AI metin veya görsellerden yapay zekâ videoları üretir, işleri gösterir ve credits yönetir. Kullanılabilirlik, modeller, hız ve kalite değişebilir."],
      ["2. İçeriğiniz", "Gönderdiğiniz her metin, görsel ve materyal için gerekli haklara sahip olmalısınız. Girdilerden ve sonuçların kullanımından siz sorumlusunuz."],
      ["3. Credits ve Telegram Stars", "Dijital credits Telegram Stars ile alınır ve yalnızca Telegram'ın resmi ödeme onayından sonra eklenir. Para değildir, devredilemez ve hizmet dışında değeri yoktur."],
      ["4. Başarısız veya iptal işler", "Başarısız veya uygun iptal edilen işler platform durumu ve kurallarına göre iade edilir. Tamamlanan iş yalnızca öznel tercihe uymadığı için iade edilmez."],
      ["5. Kabul edilebilir kullanım", "Hizmeti yasa dışı, aldatıcı, taciz edici, hak ihlali oluşturan, zararlı veya gizliliği ihlal eden içerik için kullanmayın. İçeriği reddedebilir veya erişimi sınırlayabiliriz."],
      ["6. Destek", "Yardım için @Aurax_ai_bot içinde /support, ödeme için /paysupport gönderin. Koşullar değişebilir; satın alımda gösterilen sürüm uygulanır."],
    ],
    privacy: [
      ["1. Aldığımız veriler", "Telegram'ın sağladığı kullanıcı kimliği, ad, kullanıcı adı ve dili alır; istemleri, görselleri, işleri, credits bakiyesini ve destek mesajlarını işleriz."],
      ["2. Veri kullanımı", "Verileri kimlik doğrulama, üretim, yinelenen ücret veya işleri önleme, bakiye, sonuç teslimi, kötüye kullanımı önleme ve destek için kullanırız."],
      ["3. Ödemeler", "Stars ödemelerini Telegram işler. Doğrulama ve credits ekleme için yalnızca işlem kimliği, ürün, tutar ve durum alınır; parola, doğrulama kodu veya kart bilgisi alınmaz."],
      ["4. Sağlayıcılar", "Veriler yalnızca gerekli Telegram, altyapı veya üretim sağlayıcılarıyla ya da yasa gereği paylaşılır. Kişisel veri satmayız."],
      ["5. Saklama ve güvenlik", "Kayıtları hizmet, güvenlik, anlaşmazlık ve yasal yükümlülükler için makul süre tutarız. Erişim kontrolü ve imzalı istekler kullanırız; ancak hiçbir çevrim içi hizmet tamamen güvenli değildir."],
      ["6. Seçimler ve destek", "Kullanmayı bırakabilirsiniz. Veri talebi için @Aurax_ai_bot'a /support, ödeme için /paysupport gönderin."],
    ],
    termsNotice: "Yapay zekâ çıktısı hatalı veya beklenmedik olabilir. Yayınlamadan önce inceleyin.",
    privacyNotice: "Desteğe parola, Telegram doğrulama kodu veya tam ödeme bilgisi göndermeyin.",
  },
  fa: {
    terms: [
      ["1. سرویس", "Fantivo AI از متن یا تصویر ویدیوی هوش مصنوعی می‌سازد، کارها را نمایش می‌دهد و credits را مدیریت می‌کند. دسترسی، مدل‌ها، سرعت و کیفیت ممکن است تغییر کند."],
      ["2. محتوای شما", "باید حقوق و مجوز لازم برای هر متن، تصویر یا محتوای ارسالی را داشته باشید. مسئول ورودی‌ها و استفاده از نتایج هستید."],
      ["3. Credits وTelegram Stars", "credits دیجیتال با Telegram Stars خریداری و فقط پس از تأیید رسمی پرداخت تلگرام افزوده می‌شود. پول نیست، قابل انتقال نیست و بیرون سرویس ارزش ندارد."],
      ["4. کار ناموفق یا لغوشده", "کار ناموفق یا لغو واجد شرایط طبق وضعیت و قوانین پلتفرم بازپرداخت می‌شود. کار کامل‌شده صرفاً به دلیل سلیقه شخصی بازپرداخت نمی‌شود."],
      ["5. استفاده مجاز", "از سرویس برای محتوای غیرقانونی، فریبنده، آزاردهنده، ناقض حقوق، زیان‌آور یا ناقض حریم خصوصی استفاده نکنید. ممکن است محتوا رد یا دسترسی محدود شود."],
      ["6. پشتیبانی", "در @Aurax_ai_bot برای کمک /support و برای پرداخت /paysupport بفرستید. شرایط ممکن است تغییر کند؛ نسخه نمایش‌داده‌شده هنگام خرید اعمال می‌شود."],
    ],
    privacy: [
      ["1. داده‌های دریافتی", "شناسه، نام، نام کاربری و زبان ارائه‌شده توسط تلگرام و همچنین درخواست‌ها، تصاویر، کارها، موجودی credits و پیام‌های پشتیبانی پردازش می‌شوند."],
      ["2. کاربرد داده", "داده برای احراز هویت، تولید، جلوگیری از هزینه یا کار تکراری، مدیریت موجودی، تحویل نتیجه، جلوگیری از سوءاستفاده و پشتیبانی استفاده می‌شود."],
      ["3. پرداخت", "Telegram پرداخت Stars را پردازش می‌کند. فقط شناسه تراکنش، محصول، مبلغ و وضعیت لازم برای تأیید و شارژ دریافت می‌شود؛ رمز، کد تأیید یا اطلاعات کارت دریافت نمی‌شود."],
      ["4. ارائه‌دهندگان", "داده فقط با Telegram و ارائه‌دهندگان ضروری زیرساخت یا تولید، یا طبق قانون به اشتراک گذاشته می‌شود. داده شخصی فروخته نمی‌شود."],
      ["5. نگهداری و امنیت", "سوابق برای مدت معقول جهت سرویس، امنیت، اختلاف و تعهد قانونی نگهداری می‌شود. کنترل دسترسی و درخواست امضاشده استفاده می‌کنیم، اما هیچ سرویس آنلاین کاملاً امن نیست."],
      ["6. انتخاب و پشتیبانی", "می‌توانید استفاده را متوقف کنید. برای درخواست داده در @Aurax_ai_bot دستور /support و برای پرداخت /paysupport بفرستید."],
    ],
    termsNotice: "خروجی هوش مصنوعی ممکن است نادرست یا غیرمنتظره باشد. پیش از انتشار بررسی کنید.",
    privacyNotice: "رمز، کد تأیید تلگرام یا اطلاعات کامل پرداخت را برای پشتیبانی نفرستید.",
  },
  hi: {
    terms: [
      ["1. सेवा", "Fantivo AI टेक्स्ट या इमेज से AI वीडियो बनाता है, कार्य दिखाता है और credits संभालता है। उपलब्धता, मॉडल, गति और गुणवत्ता बदल सकती है।"],
      ["2. आपकी सामग्री", "भेजे गए हर टेक्स्ट, इमेज और सामग्री के लिए आपके पास जरूरी अधिकार और अनुमति होनी चाहिए। इनपुट और परिणाम के उपयोग की जिम्मेदारी आपकी है।"],
      ["3. Credits और Telegram Stars", "डिजिटल credits Telegram Stars से खरीदे जाते हैं और Telegram की आधिकारिक सफल भुगतान पुष्टि के बाद ही जुड़ते हैं। वे नकद नहीं हैं, हस्तांतरित नहीं होते और सेवा के बाहर उनका मूल्य नहीं है।"],
      ["4. विफल या रद्द कार्य", "विफल या योग्य रद्द कार्य का भुगतान प्लेटफ़ॉर्म की स्थिति और नियमों के अनुसार लौटता है। पूरा कार्य केवल व्यक्तिगत पसंद के कारण वापस नहीं किया जाता।"],
      ["5. स्वीकार्य उपयोग", "सेवा का उपयोग गैरकानूनी, भ्रामक, अपमानजनक, अधिकारों का उल्लंघन करने वाली, हानिकारक या गोपनीयता भंग करने वाली सामग्री के लिए न करें। हम सामग्री अस्वीकार या पहुँच सीमित कर सकते हैं।"],
      ["6. सहायता", "मदद के लिए @Aurax_ai_bot में /support और भुगतान के लिए /paysupport भेजें। शर्तें बदल सकती हैं; खरीद पर दिखाया संस्करण लागू होता है।"],
    ],
    privacy: [
      ["1. प्राप्त डेटा", "हम Telegram से मिली यूज़र ID, नाम, यूज़रनेम और भाषा लेते हैं तथा प्रॉम्प्ट, इमेज, कार्य, credits बैलेंस और सहायता संदेश संसाधित करते हैं।"],
      ["2. डेटा का उपयोग", "डेटा का उपयोग पहचान, जनरेशन, दोहरे शुल्क या कार्य रोकने, बैलेंस, परिणाम देने, दुरुपयोग रोकने और सहायता के लिए होता है।"],
      ["3. भुगतान", "Stars भुगतान Telegram संभालता है। सत्यापन और credits जोड़ने के लिए केवल लेनदेन ID, उत्पाद, राशि और स्थिति मिलती है; पासवर्ड, सत्यापन कोड या बैंक कार्ड डेटा नहीं मिलता।"],
      ["4. सेवा प्रदाता", "डेटा केवल जरूरी Telegram, बुनियादी ढाँचा या जनरेशन प्रदाताओं से, या कानून के अनुसार साझा होता है। हम व्यक्तिगत डेटा नहीं बेचते।"],
      ["5. रखरखाव और सुरक्षा", "रिकॉर्ड सेवा, सुरक्षा, विवाद और कानूनी दायित्व के लिए उचित समय तक रखे जाते हैं। हम पहुँच नियंत्रण और हस्ताक्षरित अनुरोध उपयोग करते हैं, पर कोई ऑनलाइन सेवा पूर्णतः सुरक्षित नहीं है।"],
      ["6. विकल्प और सहायता", "आप सेवा उपयोग बंद कर सकते हैं। डेटा अनुरोध के लिए @Aurax_ai_bot में /support और भुगतान के लिए /paysupport भेजें।"],
    ],
    termsNotice: "AI परिणाम गलत या अप्रत्याशित हो सकता है। प्रकाशित करने से पहले जाँचें।",
    privacyNotice: "सहायता को पासवर्ड, Telegram सत्यापन कोड या पूरी भुगतान जानकारी न भेजें।",
  },
};

for (const [locale, meta] of Object.entries(addedLocaleMeta)) {
  copy[locale] = {
    back: meta.back,
    updated: meta.updated,
    terms: { ...copy.en.terms, eyebrow: meta.terms[0], title: meta.terms[1], intro: meta.terms[2], sections: addedLocaleSections[locale].terms, notice: addedLocaleSections[locale].termsNotice },
    privacy: { ...copy.en.privacy, eyebrow: meta.privacy[0], title: meta.privacy[1], intro: meta.privacy[2], sections: addedLocaleSections[locale].privacy, notice: addedLocaleSections[locale].privacyNotice },
  };
}

const analyticsPrivacySections = {
  en: ["7. Product analytics", "We use PostHog to collect limited product-usage events, such as Mini App opens, generation submissions and outcomes, wallet and payment-flow interactions, language, and platform. We do not send prompt or image content, file names, payment credentials, or Telegram authentication data to PostHog. This data is used to understand reliability and improve the service, and browser Do Not Track preferences are respected."],
  "zh-CN": ["7. 产品分析", "我们使用 PostHog 收集有限的产品使用事件，例如小程序打开、生成提交与结果、钱包及支付流程交互、语言和平台。我们不会向 PostHog 发送提示词或图片内容、文件名、支付凭证或 Telegram 身份验证数据。这些数据仅用于了解服务可靠性和改进产品，并遵循浏览器的“请勿跟踪”设置。"],
  ru: ["7. Аналитика продукта", "Мы используем PostHog для сбора ограниченных событий использования: открытия Mini App, отправки и результаты генерации, взаимодействия с кошельком и оплатой, язык и платформу. Мы не передаём PostHog тексты запросов, содержимое изображений, имена файлов, платёжные данные или данные аутентификации Telegram. Эти данные нужны для оценки надёжности и улучшения сервиса; настройки браузера «Не отслеживать» учитываются."],
  uk: ["7. Аналітика продукту", "Ми використовуємо PostHog для збору обмежених подій використання: відкриття Mini App, надсилання й результати генерації, взаємодії з гаманцем і оплатою, мову та платформу. Ми не передаємо PostHog тексти запитів, вміст зображень, назви файлів, платіжні дані або дані автентифікації Telegram. Ці дані потрібні для оцінювання надійності й покращення сервісу; налаштування браузера «Не відстежувати» враховуються."],
  uz: ["7. Mahsulot tahlili", "Biz PostHog orqali faqat cheklangan foydalanish hodisalarini yig‘amiz: Mini App ochilishi, yaratish so‘rovlari va natijalari, hamyon va to‘lov jarayoni bilan o‘zaro harakat, til va platforma. PostHog’ga so‘rov yoki rasm mazmuni, fayl nomlari, to‘lov ma’lumotlari yoxud Telegram autentifikatsiya ma’lumotlarini yubormaymiz. Bu ma’lumotlar ishonchlilikni tushunish va xizmatni yaxshilash uchun ishlatiladi; brauzerning «Kuzatilmasin» sozlamasi hurmat qilinadi."],
  kk: ["7. Өнім аналитикасы", "Біз PostHog арқылы шектеулі пайдалану оқиғаларын жинаймыз: Mini App ашылуы, жасау сұраулары мен нәтижелері, әмиян және төлем үдерісімен әрекеттесу, тіл және платформа. PostHog-қа сұрау немесе сурет мазмұнын, файл атауларын, төлем деректерін не Telegram аутентификация деректерін жібермейміз. Бұл деректер сенімділікті түсіну және қызметті жақсарту үшін пайдаланылады; браузердің «Бақыламау» параметрі ескеріледі."],
  vi: ["7. Phân tích sản phẩm", "Chúng tôi sử dụng PostHog để thu thập một số sự kiện sử dụng giới hạn như mở Mini App, gửi và nhận kết quả tạo nội dung, tương tác với ví và quy trình thanh toán, ngôn ngữ và nền tảng. Chúng tôi không gửi nội dung câu lệnh hoặc hình ảnh, tên tệp, thông tin thanh toán hay dữ liệu xác thực Telegram cho PostHog. Dữ liệu này chỉ dùng để đánh giá độ ổn định và cải thiện dịch vụ; thiết lập Không theo dõi của trình duyệt được tôn trọng."],
  id: ["7. Analitik produk", "Kami menggunakan PostHog untuk mengumpulkan peristiwa penggunaan terbatas seperti pembukaan Mini App, pengiriman dan hasil pembuatan, interaksi dompet dan alur pembayaran, bahasa, serta platform. Kami tidak mengirim isi prompt atau gambar, nama file, kredensial pembayaran, atau data autentikasi Telegram ke PostHog. Data ini digunakan untuk memahami keandalan dan meningkatkan layanan; preferensi Jangan Lacak pada browser dihormati."],
  ms: ["7. Analitik produk", "Kami menggunakan PostHog untuk mengumpul peristiwa penggunaan terhad seperti pembukaan Mini App, penyerahan dan hasil penjanaan, interaksi dompet dan aliran pembayaran, bahasa serta platform. Kami tidak menghantar kandungan prompt atau imej, nama fail, bukti kelayakan pembayaran atau data pengesahan Telegram kepada PostHog. Data ini digunakan untuk memahami kebolehpercayaan dan menambah baik perkhidmatan; tetapan Jangan Jejak pelayar dihormati."],
  th: ["7. การวิเคราะห์ผลิตภัณฑ์", "เราใช้ PostHog เพื่อเก็บเหตุการณ์การใช้งานที่จำกัด เช่น การเปิด Mini App การส่งงานและผลการสร้าง การโต้ตอบกับกระเป๋าและขั้นตอนชำระเงิน ภาษา และแพลตฟอร์ม เราไม่ส่งเนื้อหาพรอมต์หรือรูปภาพ ชื่อไฟล์ ข้อมูลรับรองการชำระเงิน หรือข้อมูลยืนยันตัวตน Telegram ไปยัง PostHog ข้อมูลนี้ใช้เพื่อประเมินความน่าเชื่อถือและปรับปรุงบริการ และเราเคารพการตั้งค่าไม่ติดตามของเบราว์เซอร์"],
  es: ["7. Analítica del producto", "Usamos PostHog para recopilar eventos limitados de uso, como aperturas de la Mini App, envíos y resultados de generación, interacciones con la cartera y el flujo de pago, idioma y plataforma. No enviamos a PostHog el contenido de instrucciones o imágenes, nombres de archivos, credenciales de pago ni datos de autenticación de Telegram. Los datos se usan para conocer la fiabilidad y mejorar el servicio; respetamos la preferencia No rastrear del navegador."],
  "pt-BR": ["7. Análise do produto", "Usamos o PostHog para coletar eventos limitados de uso, como abertura do Mini App, envios e resultados de geração, interações com a carteira e o fluxo de pagamento, idioma e plataforma. Não enviamos ao PostHog conteúdo de prompts ou imagens, nomes de arquivos, credenciais de pagamento nem dados de autenticação do Telegram. Os dados são usados para entender a confiabilidade e melhorar o serviço; respeitamos a preferência Não rastrear do navegador."],
  ar: ["7. تحليلات المنتج", "نستخدم PostHog لجمع أحداث استخدام محدودة، مثل فتح Mini App وإرسال مهام التوليد ونتائجها والتفاعل مع المحفظة ومسار الدفع واللغة والمنصة. لا نرسل إلى PostHog محتوى المطالبات أو الصور أو أسماء الملفات أو بيانات اعتماد الدفع أو بيانات مصادقة Telegram. تُستخدم هذه البيانات لفهم موثوقية الخدمة وتحسينها، ونحترم إعداد عدم التتبع في المتصفح."],
  tr: ["7. Ürün analitiği", "PostHog'u Mini App'in açılması, üretim gönderimleri ve sonuçları, cüzdan ve ödeme akışı etkileşimleri, dil ve platform gibi sınırlı kullanım olaylarını toplamak için kullanırız. İstem veya görsel içeriğini, dosya adlarını, ödeme bilgilerini ya da Telegram kimlik doğrulama verilerini PostHog'a göndermeyiz. Bu veriler güvenilirliği anlamak ve hizmeti geliştirmek için kullanılır; tarayıcının İzleme tercihi dikkate alınır."],
  fa: ["7. تحلیل محصول", "ما از PostHog برای جمع‌آوری رویدادهای محدود استفاده، مانند باز شدن Mini App، ارسال و نتیجه تولید، تعامل با کیف پول و فرایند پرداخت، زبان و پلتفرم استفاده می‌کنیم. محتوای دستور یا تصویر، نام فایل، اطلاعات پرداخت یا داده‌های احراز هویت Telegram را به PostHog ارسال نمی‌کنیم. این داده‌ها برای سنجش قابلیت اطمینان و بهبود سرویس استفاده می‌شوند و تنظیم «ردیابی نشود» مرورگر رعایت می‌شود."],
  hi: ["7. उत्पाद विश्लेषण", "हम PostHog से सीमित उपयोग घटनाएँ एकत्र करते हैं, जैसे Mini App खोलना, जनरेशन सबमिशन और परिणाम, वॉलेट व भुगतान प्रवाह की गतिविधियाँ, भाषा और प्लेटफ़ॉर्म। हम prompt या चित्र की सामग्री, फ़ाइल नाम, भुगतान क्रेडेंशियल या Telegram प्रमाणीकरण डेटा PostHog को नहीं भेजते। डेटा का उपयोग विश्वसनीयता समझने और सेवा सुधारने के लिए होता है तथा ब्राउज़र की ‘ट्रैक न करें’ प्राथमिकता का सम्मान किया जाता है।"],
};

for (const [locale, section] of Object.entries(analyticsPrivacySections)) {
  copy[locale].privacy.sections.push(section);
}

function resolveLocale(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim().toLowerCase().replace("_", "-");
    if (!normalized) continue;
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("pt")) return "pt-BR";
    const match = LOCALES.find(([locale]) => locale.toLowerCase() === normalized || normalized.startsWith(`${locale.toLowerCase()}-`));
    if (match) return match[0];
  }
  return "en";
}

function initialLocale() {
  let saved = "";
  try { saved = localStorage.getItem("aurax_locale") || ""; } catch { /* storage can be disabled */ }
  let requested = "";
  try {
    const candidate = new URLSearchParams(location.search).get("lang") || "";
    const normalized = candidate.trim().toLowerCase().replace("_", "-");
    const supported = normalized.startsWith("zh") || normalized.startsWith("pt") || LOCALES.some(([locale]) => normalized === locale.toLowerCase() || normalized.startsWith(`${locale.toLowerCase()}-`));
    if (supported) requested = resolveLocale(candidate);
  } catch { /* location can be unavailable */ }
  if (requested) {
    try { localStorage.setItem("aurax_locale", requested); } catch { /* storage can be disabled */ }
  }
  return resolveLocale(requested, saved, ...navigator.languages, navigator.language);
}

function render(locale) {
  const page = document.body.dataset.legalPage === "privacy" ? "privacy" : "terms";
  const strings = copy[locale] || (["uk", "uz", "kk"].includes(locale) ? copy.ru : copy.en);
  const content = strings[page];
  document.documentElement.lang = locale;
  document.documentElement.dir = rtlLocales.has(locale) ? "rtl" : "ltr";
  document.title = `${content.title} · Fantivo AI`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", `Fantivo AI · ${content.title}`);
  document.getElementById("legal-back").textContent = strings.back;

  const root = document.getElementById("legal-content");
  root.replaceChildren();
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = content.eyebrow;
  const title = document.createElement("h1");
  title.textContent = content.title;
  const intro = document.createElement("p");
  intro.textContent = content.intro;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = strings.updated;
  root.append(eyebrow, title, intro, meta);

  for (const [heading, body] of content.sections) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = heading;
    const paragraph = document.createElement("p");
    paragraph.textContent = body;
    section.append(h2, paragraph);
    root.append(section);
  }
  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent = content.notice;
  root.append(notice);
}

const select = document.getElementById("legal-language");
for (const [value, label] of LOCALES) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}
let locale = initialLocale();
select.value = locale;
select.addEventListener("change", () => {
  locale = resolveLocale(select.value);
  try { localStorage.setItem("aurax_locale", locale); } catch { /* storage can be disabled */ }
  render(locale);
});
render(locale);
