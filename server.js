const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل الملفات الواجهة الأمامية (HTML)
app.use(express.static(__dirname));

// لو حد فتح الموقع يفتح له صفحة index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار تجريبي للتأكد أن السيرفر يعمل
app.get('/api/status', (req, res) => {
    res.json({ message: "سيرفر إياد شغال أونلاين وزي الفل!" });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
