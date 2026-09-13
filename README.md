# WhatsApp Cool Bot

A multi-feature WhatsApp bot built on Baileys (no Meta Business API needed — it links like WhatsApp Web, via QR code).

## Features
- !ping — health check
- !help — list commands
- !pp <number> — fetch a contact's profile picture
- Auto-like every status that comes through your contacts
- !savestatus — reply to a cached status to have it resent to you
- !play <song name> — searches YouTube and sends the audio
- !code — AI coding & engineering tutor (needs ANTHROPIC_API_KEY set)

## 1. Run it locally first (recommended)

npm install
npm start

A QR code prints in your terminal. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan it.

## 2. Deploy to Render (free tier)

1. Push this project to a GitHub repo.
2. On render.com, click New → Web Service, connect your repo.
3. Settings: Build command `npm install`, Start command `npm start`, Instance type Free.
4. Add an environment variable ANTHROPIC_API_KEY if you want the AI tutor to work.
5. Deploy, then open https://<your-app>.onrender.com/qr to scan the QR.
6. Check https://<your-app>.onrender.com/ to confirm status says connected.

### Limitation on Render's free tier
Free web services spin down after inactivity and disk isn't persistent across redeploys — you may need to re-scan the QR at /qr after a redeploy.

## Project structure
index.js         - connects to WhatsApp, runs the web server (QR page + health check)
commands.js       - command router
lib/status.js     - status auto-like + caching for !savestatus
lib/tutor.js      - AI coding/engineering tutor
