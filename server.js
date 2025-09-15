/**
 * Simple proxy server for Medanpedia and Telegram notification
 * - Run: npm install && copy .env.example to .env and fill values
 * - Start: npm start
 */

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";

dotenv.config();

const PORT = process.env.PORT || 3000;
const MEDANPEDIA_API_ID = process.env.MEDANPEDIA_API_ID;
const MEDANPEDIA_API_KEY = process.env.MEDANPEDIA_API_KEY;
const MEDANPEDIA_ENDPOINT = process.env.MEDANPEDIA_ENDPOINT || "https://api.medanpedia.co.id/services";
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

if (!MEDANPEDIA_API_ID || !MEDANPEDIA_API_KEY) {
  console.warn("Peringatan: MEDANPEDIA credentials belum di-set. Endpoint services akan gagal.");
}
if (!BOT_TOKEN || !CHAT_ID) {
  console.warn("Peringatan: Telegram BOT_TOKEN/CHAT_ID belum di-set. Endpoint order akan gagal.");
}

const app = express();

// Security middlewares
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

// CORS: atur allowed origin environment variable (di production sebaiknya spesifik)
app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN
}));

// Simple rate limiter to avoid abuse
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 60, // max 60 request per IP per window
  message: { error: "Terlalu banyak request, coba lagi nanti." }
});
app.use(limiter);

/**
 * GET /api/services
 * - Opsi: meneruskan query, namun kita kirim body sesuai spec Medanpedia
 * - Mengembalikan JSON respons dari Medanpedia (server-side)
 */
app.get("/api/services", async (req, res) => {
  try {
    const response = await axios.post(MEDANPEDIA_ENDPOINT, {
      api_id: MEDANPEDIA_API_ID,
      api_key: MEDANPEDIA_API_KEY
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("Error fetching services:", err?.response?.data ?? err.message);
    // Jika error, kembalikan error detail minimal ke client
    return res.status(502).json({ error: "Gagal memanggil Medanpedia API", detail: err?.message });
  }
});

/**
 * POST /api/services
 * - Forward body as-is plus credentials (jika ingin mendukung filter/param)
 * - Contoh: client dapat mengirim { custom: 'value' } dan proxy akan meneruskan
 */
app.post("/api/services", async (req, res) => {
  try {
    const payload = {
      api_id: MEDANPEDIA_API_ID,
      api_key: MEDANPEDIA_API_KEY,
      ...req.body
    };

    const response = await axios.post(MEDANPEDIA_ENDPOINT, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("Error posting services:", err?.response?.data ?? err.message);
    return res.status(502).json({ error: "Gagal memanggil Medanpedia API", detail: err?.message });
  }
});

/**
 * POST /api/order
 * - Mengirim notifikasi ke Telegram. Client harus mengirim:
 *   { serviceName, quantity, target, whatsapp, total }
 */
app.post("/api/order", async (req, res) => {
  try {
    const { serviceName, quantity, target, whatsapp, total } = req.body;
    if (!serviceName || !quantity || !target || !whatsapp || total == null) {
      return res.status(400).json({ error: "Field order tidak lengkap. Diperlukan: serviceName, quantity, target, whatsapp, total" });
    }

    const message = `🛒 Pesanan Baru
━━━━━━━━━━━━━━━
📌 Layanan: ${serviceName}
📦 Jumlah: ${quantity}
🎯 Target: ${target}
📱 WhatsApp: ${whatsapp}
💰 Total: Rp ${Number(total).toLocaleString('id-ID')}
`;

    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await axios.post(telegramUrl, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    }, { timeout: 10000 });

    if (response.data && response.data.ok) {
      return res.json({ ok: true, result: response.data.result });
    } else {
      return res.status(502).json({ ok: false, error: "Telegram API tidak mengembalikan ok:true", data: response.data });
    }
  } catch (err) {
    console.error("Error sending telegram:", err?.response?.data ?? err.message);
    return res.status(502).json({ error: "Gagal mengirim pesan ke Telegram", detail: err?.message });
  }
});

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Static fallback (optional)
app.get("/", (req, res) => {
  res.send("Medanpedia Proxy Server is running.");
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Allowed origin: ${ALLOWED_ORIGIN}`);
});
