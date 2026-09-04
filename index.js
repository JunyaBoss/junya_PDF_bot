const TelegramBot = require("node-telegram-bot-api");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const sizeOf = require("image-size");  // For getting image dimensions from Buffer

// 👇 Apna Token yahan daal dena
const token = "YOUR_TELEGRAM_BOT_TOKEN_HERE";

// Express Server (for Render/Railway 24/7)
const app = express();
app.get('/', (req, res) => res.send('PDF Bot is Running 24/7!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const bot = new TelegramBot(token, { polling: true });

// In‑memory store for each user's photo file_ids
const userPhotos = {};

console.log("🤖 Multi-Photo PDF Bot (optimised) start ho gaya hai...");

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userPhotos[chatId] = [];
  bot.sendMessage(
    chatId,
    "Welcome! 📄\nMujhe ek‑ek karke ya ek sath bohot saari Photos bhejo.\n\nJab saari photos bhej do, toh PDF banane ke liye /done type karna!"
  );
});

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (!userPhotos[chatId]) userPhotos[chatId] = [];

  const photo = msg.photo[msg.photo.length - 1];
  userPhotos[chatId].push(photo.file_id);

  bot.sendMessage(
    chatId,
    `✅ Photo save ho gayi! (Total: ${userPhotos[chatId].length})\nAur photos bhejo ya /done dabao.`
  );
});

bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;

  if (!userPhotos[chatId] || userPhotos[chatId].length === 0) {
    return bot.sendMessage(chatId, "❌ Pehle mujhe kuch photos toh bhejo bhai!");
  }

  // ✅ Copy and clear immediately to avoid double‑trigger
  const photosToProcess = [...userPhotos[chatId]];
  userPhotos[chatId] = [];

  const total = photosToProcess.length;
  bot.sendMessage(chatId, `⏳ Processing ${total} photos... PDF ban raha hai, kripya thoda wait karein...`);

  try {
    const pdfPath = `Converted_Document_${chatId}_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < photosToProcess.length; i++) {
      const fileId = photosToProcess[i];
      try {
        // 1. Get direct download link
        const fileLink = await bot.getFileLink(fileId);

        // 2. Download image as Buffer (no temp file)
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');

        // 3. Get image dimensions using image-size
        const dimensions = sizeOf(imageBuffer);
        const { width, height } = dimensions;

        // 4. Add a new page with image dimensions
        doc.addPage({ size: [width, height] });
        doc.image(imageBuffer, 0, 0, { width, height });

        processed++;

        // 5. Send progress update every 10 images
        if (processed % 10 === 0 || processed === total) {
          await bot.sendMessage(chatId, `📌 Progress: ${processed}/${total} images added to PDF.`);
        }

      } catch (err) {
        skipped++;
        console.error(`Failed to process image ${i+1}:`, err.message);
        // Continue with next image
      }
    }

    // Finalise PDF
    doc.end();

    // Wait for PDF to finish writing
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Send the PDF
    await bot.sendDocument(chatId, pdfPath, {
      caption: `✅ PDF ready!\n- Total images: ${total}\n- Successfully added: ${processed}\n- Skipped: ${skipped}`
    });

    // Clean up the temporary PDF file
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

  } catch (error) {
    bot.sendMessage(chatId, "❌ Kuch gadbad ho gayi. Kripya phirse try karein.");
    console.error("PDF generation error:", error);
  }
});
