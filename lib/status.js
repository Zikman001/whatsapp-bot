/**
 * Handles WhatsApp "Status" (stories) broadcasts:
 *  - Auto-reacts (likes) every status that comes through
 *  - Caches the most recent status per-contact in memory so !savestatus
 *    can resend it to you on request
 *
 * Note: statuses live in memory only (cleared on restart) and are capped
 * per-contact to avoid unbounded growth. This does NOT touch view-once
 * messages in normal chats — those are intentionally left alone.
 */

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const lastStatusByContact = new Map();

async function handleStatusUpdate(sock, msg) {
  const participant = msg.key.participant || msg.participant;
  if (!participant) return;

  // --- Auto-like the status ---
  try {
    await sock.sendMessage(
      "status@broadcast",
      { react: { text: "❤️", key: msg.key } },
      { statusJidList: [participant] }
    );
  } catch (err) {
    console.error("Couldn't react to status:", err.message);
  }

  // --- Cache the media/text so it can be resent via !savestatus ---
  try {
    const messageType = Object.keys(msg.message || {})[0];
    let content = null;

    if (messageType === "imageMessage") {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      content = { image: buffer, caption: msg.message.imageMessage.caption || "" };
    } else if (messageType === "videoMessage") {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      content = { video: buffer, caption: msg.message.videoMessage.caption || "" };
    } else if (messageType === "extendedTextMessage" || messageType === "conversation") {
      const text = msg.message.extendedTextMessage?.text || msg.message.conversation;
      content = { text: `Status: ${text}` };
    }

    if (content) {
      lastStatusByContact.set(participant, { content, timestamp: Date.now() });
    }
  } catch (err) {
    console.error("Couldn't cache status media:", err.message);
  }
}

function getLastStatusFor(jid) {
  return lastStatusByContact.get(jid) || null;
}

module.exports = { handleStatusUpdate, getLastStatusFor };
