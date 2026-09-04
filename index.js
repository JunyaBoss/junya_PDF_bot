// ✅ Yahan dhyan se dekho, koi { } brackets nahi hain
const TelegramBot = require("node-telegram-bot-api"); 
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");

// 👇 Apna naya Token yahan daal dena
const token = "8526381843:AAGRIq9lAEwb9PYfS4gjoWdrMQGKsCOr8HA";

// Yeh raha tumhara constructor jo ab 100% kaam karega
const bot = new TelegramBot(token, { polling: true });

console.log("🤖 Bot start ho gaya hai...");

// Jab koi /start command bhejega
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome! Mujhe apni koi bhi Photo bhejo, aur main turant usko PDF mein convert karke dunga. 📄",
  );
});

// Jab koi Image (Photo) bhejega
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "⏳ Processing image... bas ek second...");

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    const fileLink = await bot.getFileLink(fileId);

    const imagePath = `temp_image_${chatId}.jpg`;
    const pdfPath = `Converted_Document_${chatId}.pdf`;

    const response = await axios({ url: fileLink, responseType: "stream" });
    const writer = fs.createWriteStream(imagePath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      const doc = new PDFDocument({ autoFirstPage: false });
      doc.pipe(fs.createWriteStream(pdfPath));

      const img = doc.openImage(imagePath);
      doc.addPage({ size: [img.width, img.height] });
      doc.image(imagePath, 0, 0);
      doc.end();

      setTimeout(() => {
        bot
          .sendDocument(chatId, pdfPath)
          .then(() => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
          })
          .catch((err) => console.error("Document send error:", err));
      }, 1500);
    });
  } catch (error) {
    bot.sendMessage(
      chatId,
      "❌ Kuch gadbad ho gayi. Kripya phirse try karein.",
    );
    console.error(error);
  }
});