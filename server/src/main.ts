import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import * as express from "express";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

async function bootstrap() {
  const configuredFrontendUrls =
    process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "";
  const frontendOrigins = configuredFrontendUrls
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (frontendOrigins.length === 0) {
    throw new Error("FRONTEND_URL or FRONTEND_URLS is not configured");
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "", method: RequestMethod.GET },
      { path: "health", method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      // Requests without Origin are server-to-server calls and health checks.
      if (!origin || frontendOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }

      console.warn(`[CORS] Rejected origin: ${origin}`);
      callback(new Error("Origin is not allowed by CORS"), false);
    },
    credentials: true,
  });

  // Ensure uploads folder exists
  const uploadsPath = join(process.cwd(), "uploads");

  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  // Serve static files with explicit CORS and cache control for videos
  app.use(
    "/uploads",
    (req: any, res: any, next: any) => {
      const requestOrigin = String(req.headers.origin || "").replace(/\/$/, "");
      if (frontendOrigins.includes(requestOrigin)) {
        res.header("Access-Control-Allow-Origin", requestOrigin);
      }
      res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Range, Origin, Content-Type, Accept");
      res.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
      
      // Handle Range Requests manually if needed, but express.static usually does it.
      // We force Accept-Ranges header here.
      res.header("Accept-Ranges", "bytes");

      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    },
    express.static(uploadsPath, {
      maxAge: "1d",
      setHeaders: (res, path) => {
        res.header("Accept-Ranges", "bytes");
        if (path.endsWith(".mp4")) {
          res.header("Content-Type", "video/mp4");
        } else if (path.endsWith(".webm")) {
          res.header("Content-Type", "video/webm");
        }
      },
    }),
  );

  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
