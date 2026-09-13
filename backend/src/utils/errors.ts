import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodSchema } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, "BAD_REQUEST");
export const unauthorized = (msg = "Authentication required.") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "You do not have permission to do that.") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found.") => new HttpError(404, msg, "NOT_FOUND");
export const tooMany = (msg = "Too many requests. Slow down.") => new HttpError(429, msg, "RATE_LIMITED");

/** Wrap async handlers so rejections hit the error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Central error middleware — never leaks stack traces to clients. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed.",
      code: "VALIDATION_ERROR",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  // Mongoose duplicate key
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    res.status(409).json({ error: "Duplicate resource.", code: "DUPLICATE" });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { name?: string }).name === "ValidationError") {
    res.status(400).json({ error: "Validation failed.", code: "VALIDATION_ERROR" });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large.", code: "PAYLOAD_TOO_LARGE" });
    return;
  }
  console.error("[unhandled]", err); // full detail in server logs only
  res.status(500).json({ error: "Something went wrong. Please try again.", code: "INTERNAL" });
}

/** Zod body/query validation middleware. */
export function validate(shape: { body?: ZodSchema; query?: ZodSchema; params?: ZodSchema }): RequestHandler {
  return (req, _res, next) => {
    try {
      if (shape.body) req.body = shape.body.parse(req.body ?? {});
      if (shape.query) req.query = shape.query.parse(req.query) as typeof req.query;
      if (shape.params) req.params = shape.params.parse(req.params) as typeof req.params;
      next();
    } catch (e) {
      next(e);
    }
  };
}
