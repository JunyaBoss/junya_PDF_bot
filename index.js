const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");

const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA";

// Express for 24/7 hosting
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// Per-user data: { photos: [file_ids], lastIndex: number }
const userData = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userData[chatId] = { photos: [], lastIndex: 0 };
  bot.sendMessage(chatId, "📸 Photos bhejo, phir /done karke PDF banao.\nHar /done sirf **naye** photos ki PDF banayega.");
});

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (!userData[chatId]) userData[chatId] = { photos: [], lastIndex: 0 };
  const photo = msg.photo[msg.photo.length - 1];
  userData[chatId].photos.push(photo.file_id);
  bot.sendMessage(chatId, `✅ Photo save (Total: ${userData[chatId].photos.length})`);
});

bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;
  const data = userData[chatId];
  if (!data || data.photos.length === data.lastIndex) {
    return bot.sendMessage(chatId, "❌ Koi nayi photo nahi hai. Pehle photos bhejo.");
  }

  // Sirf un photos ko lo jo last /done ke baad aayi hain
  const newPhotos = data.photos.slice(data.lastIndex);
  const total = newPhotos.length;

  // ✅ Pehle hi lastIndex update karo taaki agar user dubara /done dabaye toh koi duplicate na ho
  data.lastIndex = data.photos.length;

  bot.sendMessage(chatId, `⏳ ${total} nayi photos se PDF ban raha hai...`);

  try {
    const pdfPath = `Converted_Document_${chatId}_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    let processed = 0, skipped = 0;

    for (let i = 0; i < newPhotos.length; i++) {
      try {
        const fileLink = await bot.getFileLink(newPhotos[i]);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const { width, height } = sizeOf(imageBuffer);

        doc.addPage({ size: [width, height] });
        doc.image(imageBuffer, 0, 0, { width, height });
        processed++;

        // Progress update sirf tab jab 20+ photos ho aur har 10 par
        if (total > 20 && (processed % 10 === 0 || processed === total)) {
          await bot.sendMessage(chatId, `📌 ${processed}/${total} images added.`);
        }
      } catch (err) {
        skipped++;
        console.error(`Image ${i+1} failed:`, err.message);
      }
    }

    doc.end();
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // ✅ Ek hi PDF bhejo
    await bot.sendDocument(chatId, pdfPath, {
      caption: `✅ PDF ready!\n✅ Added: ${processed}\n⚠️ Skipped: ${skipped}`
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    // Next /done ke liye hint
    bot.sendMessage(chatId, "📌 Ab aur photos bhejo aur /done karo – sirf naye photos ki PDF banegi.");

  } catch (error) {
    bot.sendMessage(chatId, "❌ Error! Try again.");
    console.error(error);
  }
});
