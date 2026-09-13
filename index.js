/**
 * WhatsApp Cool Bot — main entry point.
 *
 * Uses Baileys (multi-device WhatsApp Web protocol) to connect either via
 * QR code, or via an 8-character pairing code (useful when you only have
 * one phone — the code is typed into WhatsApp on that same phone, no
 * second screen needed).
 *
 * Runs a tiny Express server so Render's free web service has a port to
 * bind to, and also exposes the QR/pairing code as a webpage (handy
 * because Render's free tier gives you no terminal to see it in).
 */

const express = require("express");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");

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

// Set this to your WhatsApp number (digits only, with country code, no +
// or spaces — e.g. 15551234567) as an env var to use pairing-code linking
// instead of QR. Leave unset to use QR as normal.
const LINK_PHONE_NUMBER = process.env.LINK_PHONE_NUMBER;

let latestQR = null;
let pairingCode = null;
let connectionStatus = "starting"; // starting | qr | pairing | connected | disconnected

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Cool Bot", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  // If we want a pairing code and aren't already registered, request one.
  // Baileys needs a moment for the socket to actually open before this call
  // works — requesting immediately causes a "Connection Closed" error.
  if (LINK_PHONE_NUMBER && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const rawCode = await sock.requestPairingCode(LINK_PHONE_NUMBER.replace(/\D/g, ""));
        const code = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
        pairingCode = code;
        connectionStatus = "pairing";
        console.log(`Pairing code: ${code} (or visit /qr) — enter it in WhatsApp > Linked Devices > Link with phone number.`);
      } catch (err) {
        console.error("Couldn't request pairing code:", err.message);
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !LINK_PHONE_NUMBER) {
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
      pairingCode = null;
      console.log("✅ Connected to WhatsApp.");
    }
  });

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

// --- Minimal web server: health check + QR/pairing page (needed for Render) ---
const app = express();

app.get("/", (req, res) => {
  res.send(`<h2>WhatsApp Bot</h2><p>Status: ${connectionStatus}</p><p><a href="/qr">View QR / pairing code</a></p>`);
});

app.get("/qr", async (req, res) => {
  if (connectionStatus === "connected") {
    return res.send("<h3>Already connected ✅</h3>");
  }
  if (pairingCode) {
    return res.send(
      `<h3>Your pairing code: <span style="font-size:2em;letter-spacing:0.1em;">${pairingCode}</span></h3>` +
      `<p>On your phone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead" → enter this code.</p>`
    );
  }
  if (!latestQR) {
    return res.send("<h3>No QR/code yet — refresh in a few seconds.</h3>");
  }
  const dataUrl = await QRCode.toDataURL(latestQR);
  res.send(`<h3>Scan with WhatsApp > Linked Devices</h3><img src="${dataUrl}" />`);
});

app.get("/health", (req, res) => res.json({ status: connectionStatus }));

app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));
