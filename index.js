const { Client, RemoteAuth } = require('whatsapp-web.js');
const { AwsS3Store } = require('wwebjs-aws-s3');
// --- التعديل 1: استيراد الأوامر الضرورية ---
const { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand, 
    DeleteObjectCommand, 
    HeadObjectCommand 
} = require('@aws-sdk/client-s3');
const express = require('express');
const QRCodeImage = require('qrcode');

const app = express();
app.use(express.json());

let currentQR = null;

const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY,
        secretAccessKey: process.env.SUPABASE_SECRET_KEY
    },
    forcePathStyle: true
});

// --- التعديل 2: تمرير الأوامر للمكتبة ---
const store = new AwsS3Store({
    bucketName: 'whatsapp-sessions',
    remoteDataPath: 'auth/session',
    s3Client: s3,
    // هذه الأسطر هي التي ستحل المشكلة:
    putObjectCommand: PutObjectCommand,
    getObjectCommand: GetObjectCommand,
    deleteObjectCommand: DeleteObjectCommand,
    headObjectCommand: HeadObjectCommand
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

app.get('/qr', async (req, res) => {
    if (currentQR) {
        try {
            const url = await QRCodeImage.toDataURL(currentQR);
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