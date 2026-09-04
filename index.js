const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");

const token = "YOUR_TELEGRAM_BOT_TOKEN_HERE";

// Express server for 24/7 hosting
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

const userPhotos = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = [];
  bot.sendMessage(chatId, "Welcome! 📄\nMujhe photos bhejo, phir /done karke PDF banao.");
});

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (!userPhotos[chatId]) userPhotos[chatId] = [];
  const photo = msg.photo[msg.photo.length - 1];
  userPhotos[chatId].push(photo.file_id);
  bot.sendMessage(chatId, `✅ Photo save (Total: ${userPhotos[chatId].length})`);
});

bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;

  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle photos bhejo!");
  }

  // ⚡ Immediately clear the list to prevent duplicate processing
  const photosToProcess = [...userPhotos[chatId]];
  userPhotos[chatId] = [];

  const total = photosToProcess.length;
  bot.sendMessage(chatId, `⏳ ${total} photos se PDF ban raha hai...`);

  try {
    const pdfPath = `Converted_Document_${chatId}_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < photosToProcess.length; i++) {
      try {
        const fileLink = await bot.getFileLink(photosToProcess[i]);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const { width, height } = sizeOf(imageBuffer);

        doc.addPage({ size: [width, height] });
        doc.image(imageBuffer, 0, 0, { width, height });
        processed++;

        // 📊 Progress update only if more than 20 photos, and every 10
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

    await bot.sendDocument(chatId, pdfPath, {
      caption: `✅ PDF ready!\n✅ Added: ${processed}\n⚠️ Skipped: ${skipped}`
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

  } catch (error) {
    bot.sendMessage(chatId, "❌ Error! Please try again.");
    console.error(error);
  }
});
