const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require('express');

// 👇 Apna Token yahan daal dena
const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA";

// Express Server Render/Railway ke liye
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running 24/7!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// Users ki photos store karne ke liye memory
const userPhotos = {}; 

console.log("🤖 Multi-Photo PDF Bot start ho gaya hai...");

// Jab koi /start command bhejega
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = []; 
  bot.sendMessage(
    chatId,
    "Welcome! 📄 \nMujhe ek-ek karke ya ek sath bohot saari Photos bhejo. \n\nJab saari photos bhej do, toh PDF banane ke liye /done type karna!"
  );
});

// Jab koi Image (Photo) bhejega
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  
  if (!userPhotos[chatId]) {
    userPhotos[chatId] = [];
  }

  const photo = msg.photo[msg.photo.length - 1];
  userPhotos[chatId].push(photo.file_id);

  bot.sendMessage(chatId, `✅ Photo save ho gayi! (Total Photos: ${userPhotos[chatId].length})\nAur photos bhejo ya PDF banane ke liye /done dabao.`);
});

// Jab user /done bhejega (Fix kiya hua secure block)
bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;

  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle mujhe kuch photos toh bhejo bhai!");
  }

  // ✅ FIX: Photos ko turant alag nikal lo aur memory clear kar do taaki double trigger na ho
  const photosToProcess = [...userPhotos[chatId]];
  userPhotos[chatId] = []; 

  bot.sendMessage(chatId, `⏳ Processing ${photosToProcess.length} photos... PDF ban raha hai, kripya thoda wait karein...`);

  try {
    const pdfPath = `Converted_Document_${chatId}_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    for (let i = 0; i < photosToProcess.length; i++) {
      const fileId = photosToProcess[i];
      const fileLink = await bot.getFileLink(fileId);
      const imagePath = `temp_image_${chatId}_${i}_${Date.now()}.jpg`;

      const response = await axios({ url: fileLink, responseType: "stream" });
      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const img = doc.openImage(imagePath);
      doc.addPage({ size: [img.width, img.height] });
      doc.image(imagePath, 0, 0);

      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    doc.end();

    writeStream.on('finish', () => {
      bot.sendDocument(chatId, pdfPath).then(() => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      }).catch((err) => console.error("Document send error:", err));
    });

  } catch (error) {
    bot.sendMessage(chatId, "❌ Kuch gadbad ho gayi. Kripya phirse try karein.");
    console.error(error);
  }
});

