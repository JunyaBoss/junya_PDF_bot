const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require('express');

// 👇 Apna Token yahan daal dena
const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA";

// Render ke liye Dummy Web Server
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running 24/7!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// User ki photos store karne ke liye "Memory"
const userPhotos = {}; 

console.log("🤖 Multiple Photo wala Bot start ho gaya hai...");

// Jab koi /start command bhejega
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = []; // Naya user aate hi memory clear karo
  bot.sendMessage(
    chatId,
    "Welcome! 📄 \nMujhe ek-ek karke ya ek sath bohot saari Photos bhejo. \n\nJab saari photos bhej do, toh PDF banane ke liye /done type karna!"
  );
});

// Jab koi Image (Photo) bhejega
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  
  // Agar user ki memory nahi bani hai, toh bana do
  if (!userPhotos[chatId]) {
    userPhotos[chatId] = [];
  }

  // Sabse achi quality wali photo uthao aur memory mein save karo
  const photo = msg.photo[msg.photo.length - 1];
  userPhotos[chatId].push(photo.file_id);

  bot.sendMessage(chatId, `✅ Photo save ho gayi! (Total Photos: ${userPhotos[chatId].length})\nAur photos bhejo ya PDF banane ke liye /done dabao.`);
});

// Jab user /done bhejega (Saari photos ko 1 PDF mein jodne ke liye)
bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;

  // Check karo ki user ne koi photo bheji bhi hai ya nahi
  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle mujhe kuch photos toh bhejo bhai!");
  }

  bot.sendMessage(chatId, `⏳ Processing ${userPhotos[chatId].length} photos... PDF ban raha hai, kripya thoda wait karein...`);

  try {
    const pdfPath = `Converted_Document_${chatId}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Ek-ek karke saari photos download karo aur PDF mein dalo
    for (let i = 0; i < userPhotos[chatId].length; i++) {
      const fileId = userPhotos[chatId][i];
      const fileLink = await bot.getFileLink(fileId);
      const imagePath = `temp_image_${chatId}_${i}.jpg`;

      // Photo Download
      const response = await axios({ url: fileLink, responseType: "stream" });
      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);

      // Download hone ka wait karo
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Photo ko PDF mein page banakar daalo
      const img = doc.openImage(imagePath);
      doc.addPage({ size: [img.width, img.height] });
      doc.image(imagePath, 0, 0);

      // System clean rakhne ke liye download ki hui photo delete kar do
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    doc.end();

    // Jab PDF puri ban jaye toh user ko bhej do
    writeStream.on('finish', () => {
      bot.sendDocument(chatId, pdfPath).then(() => {
        // Bhejne ke baad PDF file bhi delete kar do aur memory clear kar do
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        userPhotos[chatId] = []; // Next time ke liye memory zero kar di
      }).catch((err) => console.error("Document send error:", err));
    });

  } catch (error) {
    bot.sendMessage(chatId, "❌ Kuch gadbad ho gayi. Kripya phirse try karein.");
    console.error(error);
  }
});
