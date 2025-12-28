const { Client, RemoteAuth } = require('whatsapp-web.js');
const { AwsS3Store } = require('wwebjs-aws-s3');
const { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand, 
    DeleteObjectCommand, 
    HeadObjectCommand 
} = require('@aws-sdk/client-s3');
const express = require('express');
const QRCodeImage = require('qrcode');
const cors = require('cors'); // إضافة CORS

const app = express();
app.use(cors()); // تفعيل CORS للسماح للموقع بالاتصال
app.use(express.json());

let currentQR = null;

// إعداد S3
const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY,
        secretAccessKey: process.env.SUPABASE_SECRET_KEY
    },
    forcePathStyle: true
});

// إعداد المخزن مع تمرير الأوامر (مهم جداً لحفظ الجلسة)
const store = new AwsS3Store({
    bucketName: 'whatsapp-sessions',
    remoteDataPath: 'auth/session',
    s3Client: s3,
    putObjectCommand: PutObjectCommand,
    getObjectCommand: GetObjectCommand,
    deleteObjectCommand: DeleteObjectCommand,
    headObjectCommand: HeadObjectCommand
});

const client = new Client({
    authStrategy: new RemoteAuth({
        clientId: 'vchocolate-main-session', // <--- هذا السطر هو الأهم! اسم ثابت للجلسة
        store: store,
        backupSyncIntervalMs: 60000 // حفظ احتياطي كل دقيقة
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED (Check /qr route to scan)');
    currentQR = qr;
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
    currentQR = null;
});

client.on('remote_session_saved', () => {
    console.log('💾 Session saved to Supabase successfully!');
});

// مسار عرض الـ QR
app.get('/qr', async (req, res) => {
    if (currentQR) {
        try {
            const url = await QRCodeImage.toDataURL(currentQR);
            res.send(`
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; font-family:sans-serif;">
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
            <div style="text-align:center; padding-top:50px; font-family:sans-serif;">
                <h1>Client is Ready ✅</h1>
                <p>Session is active. You don't need to scan again.</p>
            </div>
        `);
    }
});

// مسار إرسال الرسائل (مع إصلاح الأرقام)
app.post('/send-text', async (req, res) => {
    let { target, message } = req.body;
    
    try {
        if (!target) return res.status(400).json({status: 'error', message: 'Target is required'});

        // 1. تنظيف الرقم
        target = target.toString().replace(/\D/g, ''); 
        
        // 2. إصلاح الرقم السعودي (تحويل 05 إلى 9665)
        if (target.startsWith('05')) {
            target = '966' + target.substring(1);
        }
        
        const chatId = target.includes('@') ? target : `${target}@c.us`;

        if (!client.info) {
            return res.status(503).json({ status: 'error', message: 'Client not ready yet' });
        }

        await client.sendMessage(chatId, message);
        res.json({ status: 'success' });

    } catch (error) {
        console.error("Send Error:", error);
        res.status(500).json({ status: 'error', error: error.toString() });
    }
});

const PORT = process.env.PORT || 3000;
client.initialize();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});