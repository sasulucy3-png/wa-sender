const express = require("express");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const P = require("pino");

const app = express();
app.use(express.json());

let sock;

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
            console.log("Escanea este QR:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ Bot conectado a WhatsApp");
        }
    });
}

startBot();

app.get("/", (req, res) => {
    res.send("Bot activo 🚀");
});

app.post("/send", async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: "Falta número o mensaje" });
    }

    try {
        await sock.sendMessage(number + "@s.whatsapp.net", { text: message });
        res.json({ status: "Mensaje enviado" });
    } catch (error) {
