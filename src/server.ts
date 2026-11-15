import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { farmersRouter } from "./modules/farmers/farmers.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { communitiesRouter } from "./modules/communities/communities.routes.js";
import {
  whatsappRouter,
  whatsappWebhookRouter,
} from "./modules/whatsapp/whatsapp.routes.js";
import { registrationRouter } from "./modules/registration/registration.routes.js";
import { publicRouter } from "./modules/registration/public.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { auditRouter } from "./modules/reports/audit.routes.js";
import { locationsRouter } from "./modules/locations/locations.routes.js";
import { interestsRouter } from "./modules/interests/interests.routes.js";
import {
  contentPublicRouter,
  contentAdminRouter,
} from "./modules/content/content.routes.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(compression());
app.use(cookieParser());
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: "Too many login attempts. Try again later." },
  },
});
app.use("/api/auth/login", authLimiter);
// Webhook must be mounted before express.json so the raw bytes can be signature-verified.
app.use(
  "/api/whatsapp/webhook",
  express.raw({ type: "application/json", limit: "1mb" })
);
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) =>
  res.json({ success: true, status: "ok", service: "farmer-community-api" })
);
app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api/public/content", contentPublicRouter);
app.use(
  "/api/registration",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  registrationRouter
);
app.use("/api/whatsapp", whatsappWebhookRouter);
app.use("/api/admin", requireAdmin);
app.use("/api/admin/dashboard", dashboardRouter);
app.use("/api/admin/farmers", farmersRouter);
app.use("/api/admin/communities", communitiesRouter);
app.use("/api/admin/whatsapp", whatsappRouter);
app.use("/api/admin/reports", reportsRouter);
app.use("/api/admin/audit-logs", auditRouter);
app.use("/api/admin/locations", locationsRouter);
app.use("/api/admin/interests", interestsRouter);
app.use("/api/admin/content", contentAdminRouter);
app.use((_req, res) =>
  res
    .status(404)
    .json({ success: false, error: { message: "Route not found" } })
);
app.use(errorHandler);
app.listen(env.PORT, () =>
  console.log(`Farmer Community API listening on :${env.PORT}`)
);
