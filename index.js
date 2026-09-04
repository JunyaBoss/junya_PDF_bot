const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");

const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA"; // 👈 Apna token

// Express for 24/7
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// Store photos per user
const userPhotos = {};
// Processing flag – extra protection against duplicate triggers
const isProcessing = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = [];
  isProcessing[chatId] = false;
  bot.sendMessage(chatId, "📸 PDF banane ke liye .jpg / .png photos bhejo.\nJab saari photos bhej den, toh /done karo.");
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

  // Agar already processing hai toh ignore karo
  if (isProcessing[chatId]) {
    return bot.sendMessage(chatId, "⏳ Pehle wali PDF abhi ban rahi hai, thoda wait karo...");
  }

  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle kuch photos bhejo!");
  }

  // Processing flag ON
  isProcessing[chatId] = true;

  // Copy photos and clear memory immediately
  const photosToProcess = [...userPhotos[chatId]];
  userPhotos[chatId] = []; // ✅ Purani photos delete

  const total = photosToProcess.length;
  bot.sendMessage(chatId, `⏳ ${total} photos ki ek PDF ban rahi hai...`);

  try {
    const pdfPath = `Converted_Document_${chatId}_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    let processed = 0, skipped = 0;

    for (let i = 0; i < photosToProcess.length; i++) {
      try {
        const fileLink = await bot.getFileLink(photosToProcess[i]);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const { width, height } = sizeOf(imageBuffer);

        doc.addPage({ size: [width, height] });
        doc.image(imageBuffer, 0, 0, { width, height });
        processed++;
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

    bot.sendMessage(chatId, "📌 Ab nayi photos bhejo aur /done karo – purani delete ho chuki hain.");

  } catch (error) {
    bot.sendMessage(chatId, "❌ Error! Try again.");
    console.error(error);
  } finally {
    // Processing flag OFF
    isProcessing[chatId] = false;
  }
});
