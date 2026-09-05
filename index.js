const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");

const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA"; // 👈 Apna token daalein

const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// Keyboard with "Create PDF" button
const mainKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📄 Create PDF" }]],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

const userPhotos = {};
const isProcessing = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = [];
  isProcessing[chatId] = false;
  bot.sendMessage(
    chatId,
    "📸 PDF banane ke liye .jpg / .png photos bhejo.\nJab saari photos bhej den, toh neeche '📄 Create PDF' button dabao.",
    mainKeyboard
  );
});

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (!userPhotos[chatId]) userPhotos[chatId] = [];
  const photo = msg.photo[msg.photo.length - 1];
  userPhotos[chatId].push(photo.file_id);
  bot.sendMessage(
    chatId,
    `✅ Photo save (Total: ${userPhotos[chatId].length})`,
    mainKeyboard
  );
});

// Handle button click OR /done command
bot.onText(/📄 Create PDF|/\/done/, async (msg) => {
  const chatId = msg.chat.id;

  if (isProcessing[chatId]) {
    return bot.sendMessage(chatId, "⏳ Pehle wali PDF abhi ban rahi hai, thoda wait karo...");
  }

  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle kuch photos bhejo!", mainKeyboard);
  }

  isProcessing[chatId] = true;

  // Copy & clear
  const photosToProcess = [...userPhotos[chatId]];
  userPhotos[chatId] = [];

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

    await bot.sendDocument(chatId, pdfPath, {
      caption: `✅ PDF ready!\n✅ Added: ${processed}\n⚠️ Skipped: ${skipped}`
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    bot.sendMessage(
      chatId,
      "📌 Ab nayi photos bhejo aur '📄 Create PDF' dabao – purani delete ho chuki hain.",
      mainKeyboard
    );

  } catch (error) {
    bot.sendMessage(chatId, "❌ Error! Please try again.", mainKeyboard);
    console.error(error);
  } finally {
    isProcessing[chatId] = false;
  }
});
