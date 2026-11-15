import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, HttpError } from "../../utils/http.js";

export const authRouter = Router();
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const validEmail =
      input.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
    const validPassword = await bcrypt.compare(
      input.password,
      env.ADMIN_PASSWORD_HASH
    );
    if (!validEmail || !validPassword)
      throw new HttpError(401, "Invalid email or password");
    const token = jwt.sign(
      { email: env.ADMIN_EMAIL, role: "admin" },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
        issuer: "farmer-community-api",
        audience: "farmer-community-admin",
      }
    );
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ success: true, data: { email: env.ADMIN_EMAIL } });
  })
);
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  });
  res.json({ success: true });
});
authRouter.get("/me", requireAdmin, (req, res) =>
  res.json({ success: true, data: { email: req.admin?.email, role: "admin" } })
);
