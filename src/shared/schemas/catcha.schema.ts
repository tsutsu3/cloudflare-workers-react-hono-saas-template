import { z } from "zod";

// Captcha token is optional on the schema level
// Server-side validation enforces it when TURNSTILE_SECRET_KEY is configured
export const catchaSchema = z.string().optional();
