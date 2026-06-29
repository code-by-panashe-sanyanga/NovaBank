import { NextFunction, Request, Response, RequestHandler } from "express";

// Express won't catch async errors on its own, so wrap handlers and forward to errorHandler.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
