// server.js
import express from "express";
import { WebSocketServer } from "ws";
import { Telegraf } from "telegraf";
import bodyParser from "body-parser";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const bots = new Map();

// 🛰 WebSocket real-time kanal
const wss = new WebSocketServer({ noServer: true });
const sockets = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  sockets.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// 🧩 HTTP endpointlar
app.post("/api/create", async (req, res) => {
  const { name, token } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: "Token kerak" });

  try {
    const botId = uuidv4();
    const bot = new Telegraf(token);

    bot.on("text", async (ctx) => {
      const msg = ctx.message.text;
      await ctx.reply(`Salom, men ${name}man! Siz yozdingiz: ${msg}`);
      broadcast({ bot: name, msg });
    });

    await bot.launch();
    bots.set(botId, { bot, name, status: "running" });

    broadcast({ type: "bot_created", name });
    res.json({ ok: true, botId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/bots", (req, res) => {
  res.json([...bots.entries()].map(([id, b]) => ({ id, name: b.name, status: b.status })));
});

app.post("/api/bots/:id/start", async (req, res) => {
  const b = bots.get(req.params.id);
  if (!b) return res.status(404).json({ ok: false });
  await b.bot.launch();
  b.status = "running";
  broadcast({ type: "status", name: b.name, status: "running" });
  res.json({ ok: true });
});

app.post("/api/bots/:id/stop", async (req, res) => {
  const b = bots.get(req.params.id);
  if (!b) return res.status(404).json({ ok: false });
  await b.bot.stop();
  b.status = "stopped";
  broadcast({ type: "status", name: b.name, status: "stopped" });
  res.json({ ok: true });
});

app.delete("/api/bots/:id", async (req, res) => {
  const b = bots.get(req.params.id);
  if (!b) return res.status(404).json({ ok: false });
  await b.bot.stop();
  bots.delete(req.params.id);
  broadcast({ type: "deleted", name: b.name });
  res.json({ ok: true });
});

// 🔌 WebSocket integratsiyasi
const server = app.listen(PORT, () => console.log(`🚀 Rela Control server ${PORT} portda ishlayapti`));
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    sockets.add(ws);
    ws.on("close", () => sockets.delete(ws));
  });
});