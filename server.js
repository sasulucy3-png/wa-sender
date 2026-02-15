const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const P = require("pino");

const app = express();
app.use(express.json());

let sock = null;
let lastQR = null;
let isReady = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      console.log("📲 QR nuevo listo (abre /qr para verlo como imagen)");
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === "open") {
      isReady = true;
      console.log("✅ WhatsApp conectado");
    }

    if (connection === "close") {
      isReady = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("❌ WhatsApp desconectado. Reconnect:", shouldReconnect);

      if (shouldReconnect) startBot();
      else console.log("⚠️ Se deslogueó. Necesitas re-escanear QR.");
    }
  });
}

startBot();

app.get("/", (req, res) => {
  res.send("✅ WA Sender activo. Ve a /qr para escanear. /health para estado.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, ready: isReady });
});

app.get("/qr", async (req, res) => {
  if (isReady) return res.status(200).send("✅ Ya está conectado. No necesitas QR.");
  if (!lastQR) return res.status(404).send("⚠️ Aún no hay QR. Espera unos segundos y recarga.");

  try {
    const png = await QRCode.toBuffer(lastQR, { type: "png", scale: 8 });
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (e) {
    res.status(500).send("Error generando QR");
  }
});

app.post("/send", async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ ok: false, error: "Falta number o message" });
  }

  if (!sock || !isReady) {
    return res.status(503).json({ ok: false, error: "WhatsApp no está listo (escanea QR en /qr)" });
  }

  try {
    const to = String(number).replace(/\D/g, "");
    const jid = `${to}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ ok: true, status: "Mensaje enviado" });
  } catch (e) {
    console.error("Error enviando:", e);
    res.status(500).json({ ok: false, error: "No se pudo enviar" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Escuchando en puerto", PORT));

