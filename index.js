const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');

// إعداد السيرفر
const app = express();
const port = process.env.PORT || 3000;

// للسماح باستقبال بيانات JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// تهيئة عميل الواتساب
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// متغير للتأكد من جاهزية العميل
let isClientReady = false;

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Client is ready!');
    isClientReady = true;
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

// دالة مساعدة لتنسيق الرقم (مثال: تحويل 050XXXX إلى 96650XXXX@c.us)
function formatPhoneNumber(number) {
    // إزالة أي رموز غير رقمية
    let cleaned = number.toString().replace(/\D/g, '');

    // التحقق اذا كان الرقم يبدأ بـ 05 (سعودي محلي) نحوله لـ 966
    if (cleaned.startsWith('05')) {
        cleaned = '966' + cleaned.substring(1);
    }
    
    // إذا كان الرقم لا يحتوي على مفتاح دولة (أقل من 10 أرقام مثلاً)، قد يحتاج معالجة
    // هنا نفترض أن الرقم سيصلنا كاملاً أو محلياً

    // إضافة اللاحقة الخاصة بواتساب
    if (!cleaned.endsWith('@c.us')) {
        cleaned += '@c.us';
    }
    return cleaned;
}

// ==========================================
// نقطة الاتصال (API Endpoint)
// الرابط سيكون: /send-message
// ==========================================
app.post('/send-message', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ status: 'error', message: 'WhatsApp client not ready yet' });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ status: 'error', message: 'Phone and message are required' });
    }

    try {
        const chatId = formatPhoneNumber(phone);
        
        // التحقق من أن الرقم مسجل في واتساب
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.status(404).json({ status: 'error', message: 'Number not registered on WhatsApp' });
        }

        // إرسال الرسالة
        await client.sendMessage(chatId, message);
        console.log(`Message sent to ${phone}`);
        
        return res.json({ status: 'success', message: 'Message sent successfully' });

    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to send message' });
    }
});

// تشغيل الواتساب
client.initialize();

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});