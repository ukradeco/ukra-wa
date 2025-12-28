const { Client, RemoteAuth } = require('whatsapp-web.js');
const { AwsS3Store } = require('wwebjs-aws-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const express = require('express');
const QRCodeImage = require('qrcode'); // المكتبة الجديدة

const app = express();
app.use(express.json());

// متغير لحفظ الـ QR Code الحالي
let currentQR = null;

// إعداد الاتصال بـ Supabase Storage
const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY,
        secretAccessKey: process.env.SUPABASE_SECRET_KEY
    },
    forcePathStyle: true
});

const store = new AwsS3Store({
    bucketName: 'whatsapp-sessions',
    remoteDataPath: 'auth/session',
    s3Client: s3
});

const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 60000
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// --- التعديل هنا: حفظ QR بدلاً من طباعته فقط ---
client.on('qr', (qr) => {
    console.log('QR RECEIVED (Check /qr route to scan)');
    currentQR = qr; // تحديث المتغير بالكود الجديد
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
    currentQR = null; // مسح الـ QR بعد الاتصال لأنه لم يعد مطلوباً
});

client.on('remote_session_saved', () => {
    console.log('💾 Session saved to Supabase successfully!');
});

// --- مسار جديد لعرض الـ QR في المتصفح ---
app.get('/qr', async (req, res) => {
    if (currentQR) {
        try {
            // تحويل النص إلى صورة Base64
            const url = await QRCodeImage.toDataURL(currentQR);
            // عرض الصورة في صفحة HTML بسيطة
            res.send(`
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column;">
                    <h1>Scan this QR Code</h1>
                    <img src="${url}" style="width:300px; height:300px; border:1px solid #ccc;">
                    <p>Refresh page if expired</p>
                </div>
            `);
        } catch (err) {
            res.status(500).send('Error generating QR image');
        }
    } else {
        res.send(`
            <div style="text-align:center; padding-top:50px;">
                <h1>Client is Ready or QR not generated yet</h1>
                <p>Check logs if stuck.</p>
            </div>
        `);
    }
});

// API إرسال الرسائل
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

const PORT = process.env.PORT || 3000;
client.initialize();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});