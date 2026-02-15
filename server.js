const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const P = require("pino");

const app = express();
app.use(express.json());

let sock;
let latestQr = null;
let ready = false;
let starting = false;

async function startBot() {
  if (starting) return;
  starting = true;

  const { state, saveCreds } = await useMultiFileAuthState("auth");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false, // IMPORTANTE: porque lo mostraremos por web
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      latestQr = qr;
      ready = false;
      console.log("📌 Nuevo QR generado");
    }

    if (connection === "open") {
      ready = true;
      latestQr = null;
      console.log("✅ Conectado a WhatsApp");
    }

    if (connection === "close") {
      ready = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ WhatsApp desconectado. Status:", statusCode);

      // Reintenta salvo que te hayan deslogueado (401)
      if (statusCode !== 401) {
        setTimeout(() => startBot().catch(console.error), 3000);
      } else {
        console.log("⚠️ Sesión inválida (401). Borra la carpeta auth y vuelve a escanear.");
      }
    }
  });

  starting = false;
}

startBot().catch(console.error);

app.get("/", (req, res) => res.send("Bot activo 🚀"));

app.get("/health", (req, res) => {
  res.json({ ok: true, ready });
});

app.get("/qr", async (req, res) => {
  if (ready) return res.send("✅ Ya está conectado. No hay QR.");

  if (!latestQr) {
    return res.status(404).send("⚠️ Aún no hay QR. Espera unos segundos y recarga.");
  }

  const dataUrl = await QRCode.toDataURL(latestQr);
  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding:24px">
        <h2>Escanea este QR con WhatsApp</h2>
        <img src="${dataUrl}" />
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
      </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: "Falta number o message" });
  if (!ready) return res.status(503).json({ error: "Aún no está conectado a WhatsApp" });

  try {
    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });
    res.json({ status: "Mensaje enviado" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on", PORT));
