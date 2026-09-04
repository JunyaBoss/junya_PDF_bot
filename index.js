const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");

const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA"; // 👈 Apna token

// Express server for 24/7 (Railway/Render)
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// Store photos per user
const userPhotos = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = [];
  bot.sendMessage(chatId, "📸 PDF file banane ke liye .jpg ya .png photos bhejo.\nJab saari photos bhej den, toh /done karke PDF bana lo.");
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
    return bot.sendMessage(chatId, "❌ Pehle kuch photos bhejo!");
  }

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

    // Send single PDF
    await bot.sendDocument(chatId, pdfPath, {
      caption: `✅ PDF ready!\n✅ Added: ${processed}\n⚠️ Skipped: ${skipped}`
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    bot.sendMessage(chatId, "📌 Ab nayi photos bhejo aur /done karo – purani photos delete ho chuki hain.");

  } catch (error) {
    bot.sendMessage(chatId, "❌ Error! Please try again.");
    console.error(error);
  }
});
