import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server as IOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import authRouter from "./routes/auth";
import inventoryRouter from "./routes/inventory";
import servicesRouter from "./routes/services";
import auditLogsRouter from "./routes/auditLogs";
import repairRequestsRouter from "./routes/repairRequests";
import publicRouter from "./routes/public";
import { connectMongo } from "./utils/mongo";
import { startGoogleSync } from './utils/googleSync';
import { verifyAccessToken, type JwtAccessPayload } from "./utils/jwt";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const isProd = (process.env.NODE_ENV || 'development') === 'production';
const configuredFrontendOrigins = parseOrigins(process.env.FRONTEND_ORIGIN);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / server-to-server

  if (!isProd) {
    // When opening a static HTML page directly from disk (file://), browsers send Origin: null
    if (origin === 'null') return true;
    if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
    if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;
  }

  return configuredFrontendOrigins.includes(origin);
}

// allow frontend dev server (Vite) to call the API
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin || undefined)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  }
}));

// security
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// In dev, avoid CSP interfering with Vite's dynamic ports.
// In prod, you should set a strict CSP at your reverse proxy (nginx) or here.
if (isProd) {
  app.use((_req, res, next) => {
    const allowed = configuredFrontendOrigins.length ? configuredFrontendOrigins.join(' ') : "'self'";
    const csp = [
      "default-src 'self'",
      `connect-src 'self' ${allowed}`,
      "img-src 'self' data:",
      "media-src 'self' data:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'"
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    next();
  });
}

// If someone opens the API root in the browser, redirect to the frontend dev server
app.get('/', (_req, res) => {
  const fallback = 'http://localhost:5173';
  const frontend = configuredFrontendOrigins[0] || process.env.FRONTEND_ORIGIN || fallback;
  return res.redirect(frontend);
});
const port = process.env.PORT || 4000;

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/services", servicesRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/repair-requests", repairRequestsRouter);
app.use("/api/public", publicRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/detailed", async (_req, res) => {
  const payload: any = {
    status: "ok",
    database: { status: "unknown" },
    mongodb: { status: "unknown" },
    googleSheets: { status: "unknown" },
    timestamp: new Date().toISOString(),
  };

  let overallOk = true;

  // database (postgres via Prisma)
  try {
    await prisma.$queryRaw`SELECT 1`;
    payload.database.status = "ok";
  } catch (e: any) {
    overallOk = false;
    payload.database.status = "error";
    payload.database.error = e?.message || String(e);
  }

  // mongodb (mongoose connection state)
  const mongoState = mongoose.connection.readyState;
  payload.mongodb.readyState = mongoState;
  if (mongoState === 1) {
    payload.mongodb.status = "ok";
  } else {
    overallOk = false;
    payload.mongodb.status = "error";
  }

  // googleSheets (config presence; actual API test is handled by npm run verify)
  const credsPath = path.join(process.cwd(), 'config', 'google-credentials.json');
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  payload.googleSheets.credentialsFileExists = fs.existsSync(credsPath);
  payload.googleSheets.spreadsheetIdConfigured = Boolean(spreadsheetId);

  if (payload.googleSheets.credentialsFileExists && payload.googleSheets.spreadsheetIdConfigured) {
    payload.googleSheets.status = "configured";
  } else {
    overallOk = false;
    payload.googleSheets.status = "error";
    const missing: string[] = [];
    if (!payload.googleSheets.credentialsFileExists) missing.push('config/google-credentials.json');
    if (!payload.googleSheets.spreadsheetIdConfigured) missing.push('GOOGLE_SPREADSHEET_ID');
    payload.googleSheets.error = `Missing: ${missing.join(', ')}`;
  }

  payload.status = overallOk ? "ok" : "degraded";
  return res.status(overallOk ? 200 : 503).json(payload);
});

// create HTTP server and attach socket.io
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin || undefined)) return cb(null, true);
      return cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

io.use((socket, next) => {
  const raw =
    (socket.handshake.auth as any)?.token ||
    (socket.handshake.headers?.authorization ? String(socket.handshake.headers.authorization).split(' ')[1] : undefined) ||
    (socket.handshake.query as any)?.token;

  const token = raw ? String(raw) : '';
  if (!token) return next(new Error('Unauthorized'));

  const payload = verifyAccessToken<JwtAccessPayload>(token);
  if (!payload) return next(new Error('Unauthorized'));

  (socket.data as any).user = payload;
  return next();
});

io.on('connection', (socket) => {
  const payload = (socket.data as any).user as JwtAccessPayload | undefined;
  if (!payload) return;
  const userRoom = `user:${payload.userId}`;
  socket.join(userRoom);
  if (payload.role === 'ADMIN') socket.join('admin');
});
app.set('io', io);

// connect to MongoDB (for logs / realtime storage)
connectMongo().catch(err => console.error('Mongo connection error', err));

// start Google Sheets sync (if configured)
startGoogleSync(io);

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error('❌ Puerto 4000 ocupado. Ejecuta: npm run stop');
    process.exit(1);
  }
  console.error('Server error', err);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
