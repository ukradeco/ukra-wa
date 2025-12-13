const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const QRCode = require('qrcode'); // المكتبة الجديدة

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

let isClientReady = false;
let qrCodeImage = null; // متغير لحفظ صورة الباركود

client.on('qr', (qr) => {
    console.log('QR Code received via stream');
    // تحويل كود الباركود إلى صورة يمكن عرضها في المتصفح
    QRCode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generating QR', err);
            return;
        }
        qrCodeImage = url;
    });
});

client.on('ready', () => {
    console.log('✅ Client is ready!');
    isClientReady = true;
    qrCodeImage = null; // لا نحتاج الباركود بعد الاتصال
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

// ==========================================
// الصفحة الرئيسية (لعرض الحالة أو الباركود)
// ==========================================
app.get('/', (req, res) => {
    if (isClientReady) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: green;">✅ System is Ready</h1>
                <p>WhatsApp is connected successfully.</p>
            </div>
        `);
    }

    if (qrCodeImage) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Scan this QR Code</h1>
                <p>Please open WhatsApp > Linked Devices > Link a Device</p>
                <img src="${qrCodeImage}" alt="QR Code" style="width: 300px; height: 300px; border: 1px solid #ccc;">
                <p>Refresh page if code expires.</p>
            </div>
        `);
    }

    return res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>⏳ Initializing...</h1>
            <p>Please wait a moment and refresh the page.</p>
        </div>
    `);
});

// ==========================================
// نقطة الإرسال (API)
// ==========================================
app.post('/send-message', async (req, res) => {
    if (!isClientReady) return res.status(503).json({ status: 'error', message: 'Client not ready' });
    
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ status: 'error', message: 'Missing data' });

    try {
        let chatId = phone.replace(/\D/g, '');
        if (chatId.startsWith('05')) chatId = '966' + chatId.substring(1);
        if (!chatId.endsWith('@c.us')) chatId += '@c.us';

        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) return res.status(404).json({ status: 'error', message: 'Number not found' });

        await client.sendMessage(chatId, message);
        return res.json({ status: 'success', message: 'Message sent' });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.toString() });
    }
});

client.initialize();

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});