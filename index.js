const { Client, RemoteAuth } = require('whatsapp-web.js');
const { AwsS3Store } = require('wwebjs-aws-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// إعداد الاتصال بـ Supabase Storage كأنه S3
const s3 = new S3Client({
    region: 'us-east-1', // قيمة افتراضية مطلوبة
    endpoint: process.env.SUPABASE_S3_ENDPOINT, // سنجلبه من إعدادات Supabase
    credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY,
        secretAccessKey: process.env.SUPABASE_SECRET_KEY
    },
    forcePathStyle: true // ضروري لـ Supabase
});

// تهيئة المخزن لحفظ الجلسة
const store = new AwsS3Store({
    bucketName: 'whatsapp-sessions',
    remoteDataPath: 'auth/session', // مسار الملف داخل البكت
    s3Client: s3
});

// إعداد عميل الواتساب
const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 60000 // حفظ الجلسة كل دقيقة احتياطياً
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // ضروري لـ Render
    }
});

// توليد رمز QR
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
});

client.on('remote_session_saved', () => {
    console.log('💾 Session saved to Supabase successfully!');
});

// API لإرسال الرسائل (الذي ستستدعيه Edge Function)
app.post('/send-text', async (req, res) => {
    const { target, message } = req.body;
    try {
        const chatId = target.includes('@') ? target : `${target}@c.us`;
        await client.sendMessage(chatId, message);
        res.json({ status: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', error: error.toString() });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
client.initialize();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});