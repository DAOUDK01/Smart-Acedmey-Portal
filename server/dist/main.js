"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const express = __importStar(require("express"));
const path_1 = require("path");
const fs_1 = require("fs");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    app.enableCors({
        origin: true,
        credentials: true,
    });
    // Ensure uploads folder exists
    const uploadsPath = (0, path_1.join)(process.cwd(), "uploads");
    if (!(0, fs_1.existsSync)(uploadsPath)) {
        (0, fs_1.mkdirSync)(uploadsPath, { recursive: true });
    }
    // Serve static files with explicit CORS and cache control for videos
    app.use("/uploads", (req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
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
    }, express.static(uploadsPath, {
        maxAge: "1d",
        setHeaders: (res, path) => {
            res.header("Accept-Ranges", "bytes");
            if (path.endsWith(".mp4")) {
                res.header("Content-Type", "video/mp4");
            }
            else if (path.endsWith(".webm")) {
                res.header("Content-Type", "video/webm");
            }
        },
    }));
    const port = Number(process.env.PORT ?? 4010);
    await app.listen(port, "0.0.0.0");
}
void bootstrap();
