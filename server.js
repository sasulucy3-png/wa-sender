const express = require("express");
const QRCode = require("qrcode"); // <-- agrega esto
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
app.use(express.json());

let sock;
let latestQR = null;
let isReady = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      latestQR = qr;           // <-- guarda QR
      isReady = false;
      console.log("📌 QR recibido (recarga /qr)");
    }

    if (connection === "open") {
      isReady = true;
      latestQR = null;
      console.log("✅ Bot conectado a WhatsApp");
    }
  });
}

startBot();

app.get("/health", (req, res) => {
  res.json({ ok: true, ready: isReady });
});

app.get("/qr", async (req, res) => {
  if (!latestQR) return res.send("⚠️ Aún no hay QR. Espera unos segundos y recarga.");

  const img = await QRCode.toDataURL(latestQR);
  res.send(`<h3>Escanea con WhatsApp</h3><img src="${img}" />`);
});

app.get("/", (req, res) => res.send("Bot activo 🚀"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on", PORT));
