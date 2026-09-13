const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const { getLastStatusFor } = require("./lib/status");
const { askTutor } = require("./lib/tutor");

const PREFIX = "!";

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    "";

  if (!text.startsWith(PREFIX)) return;

  const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const command = cmd.toLowerCase();

  switch (command) {
    case "ping": {
      await sock.sendMessage(jid, { text: "pong 🏓" }, { quoted: msg });
      break;
    }

    case "help": {
      await sock.sendMessage(
        jid,
        {
          text:
            "*Commands*\n" +
            "!ping — check the bot is alive\n" +
            "!pp <name or number> — get someone's profile picture\n" +
            "!savestatus — reply to a saved status to have it resent to you\n" +
            "!play <song name> — send an audio clip\n" +
            "!code <question> — ask the AI coding & engineering tutor anything\n" +
            "\nStatus auto-like is on by default (see lib/status.js).",
        },
        { quoted: msg }
      );
      break;
    }

    case "code": {
      const question = args.join(" ");
      if (!question) {
        await sock.sendMessage(
          jid,
          { text: "Ask me anything! e.g. !code explain recursion, or !code what is a race condition" },
          { quoted: msg }
        );
        break;
      }
      await sock.sendMessage(jid, { text: "Thinking... 🤔" }, { quoted: msg });
      const answer = await askTutor(jid, question);
      await sock.sendMessage(jid, { text: answer }, { quoted: msg });
      break;
    }

    case "pp": {
      const target = args[0];
      if (!target) {
        await sock.sendMessage(jid, { text: "Usage: !pp <phone number, e.g. 15551234567>" }, { quoted: msg });
        break;
      }
      const targetJid = target.includes("@") ? target : `${target.replace(/\D/g, "")}@s.whatsapp.net`;
      try {
        const url = await sock.profilePictureUrl(targetJid, "image");
        await sock.sendMessage(jid, { image: { url }, caption: `Profile picture for ${target}` }, { quoted: msg });
      } catch (err) {
        await sock.sendMessage(jid, { text: "Couldn't fetch that profile picture (private, or number wrong)." }, { quoted: msg });
      }
      break;
    }

    case "savestatus": {
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const saved = getLastStatusFor(quotedParticipant) || getLastStatusFor(jid);
      if (!saved) {
        await sock.sendMessage(jid, { text: "No recent saved status found from that contact." }, { quoted: msg });
        break;
      }
      await sock.sendMessage(jid, saved.content, { quoted: msg });
      break;
    }

    case "play": {
      const query = args.join(" ");
      if (!query) {
        await sock.sendMessage(jid, { text: "Usage: !play <song name>" }, { quoted: msg });
        break;
      }
      try {
        const { videos } = await yts(query);
        const video = videos?.[0];
        if (!video) {
          await sock.sendMessage(jid, { text: "Couldn't find that song." }, { quoted: msg });
          break;
        }
        await sock.sendMessage(jid, { text: `Fetching: ${video.title} (${video.timestamp})...` }, { quoted: msg });

        const stream = ytdl(video.url, { filter: "audioonly", quality: "highestaudio" });
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        await sock.sendMessage(
          jid,
          { audio: buffer, mimetype: "audio/mp4", ptt: false, fileName: `${video.title}.m4a` },
          { quoted: msg }
        );
      } catch (err) {
        console.error("Play command error:", err);
        await sock.sendMessage(jid, { text: "Couldn't fetch that track right now." }, { quoted: msg });
      }
      break;
    }

    default: {
      await sock.sendMessage(jid, { text: `Unknown command. Try ${PREFIX}help` }, { quoted: msg });
    }
  }
}

module.exports = { handleMessage };
