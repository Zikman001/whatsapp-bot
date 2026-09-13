/**
 * WhatsApp Cool Bot — main entry point.
 *
 * Uses Baileys (multi-device WhatsApp Web protocol) to connect via QR code.
 * Runs a tiny Express server so Render's free web service has a port to
 * bind to, and also exposes the QR code as a webpage (handy because Render's
 * free tier gives you no terminal to scan a QR from).
 */

const express = require("express");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { handleMessage } = require("./commands");
const { handleStatusUpdate } = require("./lib/status");

const AUTH_DIR = path.join(__dirname, "auth_info");
const PORT = process.env.PORT || 3000;

// In-memory holder for the latest QR so the web page can display it.
let latestQR = null;
let connectionStatus = "starting"; // starting | qr | connected | disconnected

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }), // set to "info" if you want verbose logs
    printQRInTerminal: false, // we handle QR ourselves (terminal + web)
    browser: ["Cool Bot", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      connectionStatus = "qr";
      qrcodeTerminal.generate(qr, { small: true });
      console.log("Scan the QR code above (or visit /qr) with WhatsApp > Linked Devices.");
    }

    if (connection === "close") {
      connectionStatus = "disconnected";
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log("Logged out. Delete auth_info/ and restart to re-link.");
      }
    } else if (connection === "open") {
      connectionStatus = "connected";
      latestQR = null;
      console.log("✅ Connected to WhatsApp.");
    }
  });

  // Incoming messages (normal chats + groups)
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      try {
        if (msg.key.remoteJid === "status@broadcast") {
          await handleStatusUpdate(sock, msg);
        } else {
          await handleMessage(sock, msg);
        }
      } catch (err) {
        console.error("Error handling message:", err);
      }
    }
  });

  return sock;
}

startBot().catch((err) => {
  console.error("Fatal error starting bot:", err);
  process.exit(1);
});

// --- Minimal web server: health check + QR page (needed for Render) ---
const app = express();

app.get("/", (req, res) => {
  res.send(`<h2>WhatsApp Bot</h2><p>Status: ${connectionStatus}</p><p><a href="/qr">View QR code</a></p>`);
});

app.get("/qr", async (req, res) => {
  if (connectionStatus === "connected") {
    return res.send("<h3>Already connected ✅</h3>");
  }
  if (!latestQR) {
    return res.send("<h3>No QR yet — refresh in a few seconds.</h3>");
  }
  const dataUrl = await QRCode.toDataURL(latestQR);
  res.send(`<h3>Scan with WhatsApp > Linked Devices</h3><img src="${dataUrl}" />`);
});

app.get("/health", (req, res) => res.json({ status: connectionStatus }));

app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));
