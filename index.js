const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // أضفنا MessageMedia
const express = require('express');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// زيادة حجم البيانات المسموح بها لاستقبال ملفات PDF
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true }
});

let isClientReady = false;
let qrCodeImage = null;

client.on('qr', (qr) => {
    QRCode.toDataURL(qr, (err, url) => { qrCodeImage = url; });
});

client.on('ready', () => {
    console.log('✅ Client is ready!');
    isClientReady = true;
    qrCodeImage = null;
});

// ==========================================
// 1. الصفحة الرئيسية (تعرض الباركود + قائمة الجروبات)
// ==========================================
app.get('/', async (req, res) => {
    if (!isClientReady) {
        if (qrCodeImage) return res.send(`<div style="text-align:center;"><h2>Scan QR</h2><img src="${qrCodeImage}"></div>`);
        return res.send(`<h2>Initializing... Refresh shortly.</h2>`);
    }

    // عرض قائمة الجروبات لتسهيل معرفة ID الجروب
    let groupsHtml = '<h3>Connected! Here are your Groups:</h3><ul>';
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        groups.forEach(group => {
            groupsHtml += `<li><b>${group.name}</b>: <code style="background:#eee;padding:3px;">${group.id._serialized}</code></li>`;
        });
    } catch (e) { groupsHtml += `<li>Error fetching groups: ${e.toString()}</li>`; }
    groupsHtml += '</ul>';

    return res.send(`<div style="font-family:sans-serif; padding:20px;">${groupsHtml}</div>`);
});

// ==========================================
// 2. إرسال رسالة نصية (للأفراد أو الجروبات)
// ==========================================
app.post('/send-message', async (req, res) => {
    if (!isClientReady) return res.status(503).json({ status: 'error', message: 'Client not ready' });
    const { phone, message } = req.body; // phone can be a number OR group ID
    if (!phone || !message) return res.status(400).json({ status: 'error', message: 'Missing data' });

    try {
        let chatId = phone;
        // إذا لم يكن جروب (لا يحتوي على @g.us)، قم بتنظيف الرقم
        if (!chatId.includes('@g.us')) {
            chatId = chatId.replace(/\D/g, '');
            if (chatId.startsWith('05')) chatId = '966' + chatId.substring(1);
            if (!chatId.endsWith('@c.us')) chatId += '@c.us';
        }

        await client.sendMessage(chatId, message);
        return res.json({ status: 'success' });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.toString() });
    }
});

// ==========================================
// 3. إرسال وسائط (PDF / صور)
// ==========================================
app.post('/send-media', async (req, res) => {
    if (!isClientReady) return res.status(503).json({ status: 'error', message: 'Client not ready' });
    
    // fileData: Base64 string, fileName: name.pdf, caption: text
    const { phone, fileData, fileName, caption } = req.body; 
    
    if (!phone || !fileData) return res.status(400).json({ status: 'error', message: 'Missing data' });

    try {
        let chatId = phone;
        if (!chatId.includes('@g.us')) {
            chatId = chatId.replace(/\D/g, '');
            if (chatId.startsWith('05')) chatId = '966' + chatId.substring(1);
            if (!chatId.endsWith('@c.us')) chatId += '@c.us';
        }

        // إنشاء كائن الميديا
        const media = new MessageMedia('application/pdf', fileData, fileName); // أو mimetype آخر حسب الحاجة
        
        await client.sendMessage(chatId, media, { caption: caption || '' });
        return res.json({ status: 'success' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', message: error.toString() });
    }
});

client.initialize();
app.listen(port, () => console.log(`Server running on port ${port}`));