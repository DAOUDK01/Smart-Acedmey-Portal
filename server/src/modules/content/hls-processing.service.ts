import { Injectable, Logger } from "@nestjs/common";
import { execFile, spawn } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { PrismaService } from "../../prisma.service";

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

const RENDITIONS = [
  { height: 1080, videoBitrate: "5000k", maxrate: "5350k", bufsize: "7500k", audioBitrate: "192k" },
  { height: 720, videoBitrate: "2800k", maxrate: "2996k", bufsize: "4200k", audioBitrate: "128k" },
  { height: 480, videoBitrate: "1400k", maxrate: "1498k", bufsize: "2100k", audioBitrate: "128k" },
  { height: 360, videoBitrate: "800k", maxrate: "856k", bufsize: "1200k", audioBitrate: "96k" },
] as const;

type ProbeResult = { width: number; height: number; durationMs: number };

@Injectable()
export class HlsProcessingService {
  private readonly logger = new Logger(HlsProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts HLS transcoding in the background for an uploaded lecture video.
   * Never blocks the calling request; the lecture is tracked via processingStatus.
   */
  startProcessing(lectureId: string, sourcePath: string, sourceUrl: string): void {
    void this.process(lectureId, sourcePath, sourceUrl).catch((error) => {
      this.logger.error(
        `Unhandled HLS processing error for lecture ${lectureId}: ${(error as Error).message}`,
      );
    });
  }

  private uploadsDir() {
    return join(process.cwd(), "uploads");
  }

  private async probe(input: string): Promise<ProbeResult> {
    const { stdout } = await execFileAsync(
      FFPROBE,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-show_entries", "format=duration",
        "-of", "json",
        input,
      ],
      { maxBuffer: 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number }[];
      format?: { duration?: string };
    };

    const stream = parsed.streams?.[0] ?? {};
    const width = Number(stream.width) || 0;
    const height = Number(stream.height) || 0;
    const durationMs = Math.round((Number(parsed.format?.duration) || 0) * 1000);

    if (!width || !height) {
      throw new Error("Could not read video resolution.");
    }

    return { width, height, durationMs };
  }

  private pickRenditions(sourceHeight: number) {
    const targets = RENDITIONS.filter((r) => r.height <= sourceHeight);
    if (targets.length === 0) {
      return [{ height: sourceHeight, videoBitrate: "600k", maxrate: "642k", bufsize: "900k", audioBitrate: "96k" }];
    }
    return targets;
  }

  private scaledWidth(sourceWidth: number, sourceHeight: number, targetHeight: number) {
    const raw = Math.round((sourceWidth * targetHeight) / sourceHeight);
    return raw % 2 === 0 ? raw : raw + 1;
  }

  private runFfmpeg(args: string[], onProgress?: (fraction: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        if (!onProgress) return;
        const text = chunk.toString();
        const match = text.match(/out_time_ms=(\d+)/);
        if (match) onProgress(Number(match[1]) / 1000);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        reject(new Error(`FFmpeg could not be started: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim().split("\n").slice(-3).join(" ") || `FFmpeg exited with code ${code}`));
        }
      });
    });
  }

  async process(lectureId: string, sourcePath: string, sourceUrl: string): Promise<void> {
    const outputDir = join(this.uploadsDir(), "hls", lectureId);
    const baseUrl = "/uploads/hls/" + lectureId;

    const markFailed = async (error: string) => {
      this.logger.error(`HLS processing failed for lecture ${lectureId}: ${error}`);
      try {
        if (existsSync(outputDir)) {
          rmSync(outputDir, { recursive: true, force: true });
        }
      } catch {
        // best-effort cleanup
      }
      try {
        await this.prisma.lecture.update({
          where: { id: lectureId },
          data: {
            processingStatus: "FAILED",
            processingError: error.slice(0, 500),
            hlsMasterUrl: null,
            thumbnailUrl: null,
          },
        });
      } catch (updateError) {
        this.logger.warn(
          `Lecture ${lectureId} was deleted before processing finished; skipped failed-status update (${(updateError as Error).message})`,
        );
      }
    };

    try {
      if (!existsSync(sourcePath)) {
        await markFailed("Source video file is missing.");
        return;
      }

      mkdirSync(outputDir, { recursive: true });

      const probe = await this.probe(sourcePath);
      const renditions = this.pickRenditions(probe.height);

      await this.prisma.lecture.update({
        where: { id: lectureId },
        data: {
          processingStatus: "PROCESSING",
          processingProgress: 5,
          processingError: null,
          sourceType: "UPLOAD",
        },
      });

      const variantEntries: string[] = [];
      const totalSeconds = probe.durationMs / 1000 || 1;

      for (let index = 0; index < renditions.length; index++) {
        const rendition = renditions[index];
        const height = rendition.height;
        const playlistName = `${height}p.m3u8`;
        const segmentPattern = join(outputDir, `${height}p_%03d.ts`);

        const width = this.scaledWidth(probe.width, probe.height, height);

        await this.runFfmpeg(
          [
            "-y",
            "-i", sourcePath,
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-maxrate", rendition.maxrate,
            "-bufsize", rendition.bufsize,
            "-vf", `scale=-2:${height}`,
            "-g", "48",
            "-sc_threshold", "0",
            "-c:a", "aac",
            "-b:a", rendition.audioBitrate,
            "-ac", "2",
            "-hls_time", "6",
            "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_filename", segmentPattern,
            "-progress", "pipe:1",
            "-nostats",
            "-f", "hls",
            join(outputDir, playlistName),
          ],
          (seconds) => {
            const fraction = Math.min(1, seconds / totalSeconds);
            const step = 90 / renditions.length;
            const progress = Math.round(5 + index * step + fraction * step);
            void this.prisma.lecture
              .update({
                where: { id: lectureId },
                data: { processingProgress: Math.min(95, progress) },
              })
              .catch(() => undefined);
          },
        );

        variantEntries.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(Number.parseInt(rendition.videoBitrate, 10) * 1000 + Number.parseInt(rendition.audioBitrate, 10) * 1000)},RESOLUTION=${width}x${height},NAME="${height}p"`,
          playlistName,
        );
      }

      // Thumbnail (prefer the frame at 1s, fall back to the first frame)
      let thumbnailOk = false;
      try {
        await this.runFfmpeg([
          "-y",
          "-i", sourcePath,
          "-ss", "1",
          "-frames:v", "1",
          "-vf", "scale=640:-2",
          join(outputDir, "thumbnail.jpg"),
        ]);
        thumbnailOk = true;
      } catch {
        try {
          await this.runFfmpeg([
            "-y",
            "-i", sourcePath,
            "-frames:v", "1",
            "-vf", "scale=640:-2",
            join(outputDir, "thumbnail.jpg"),
          ]);
          thumbnailOk = true;
        } catch {
          // thumbnail is optional
        }
      }

      // Master playlist with all variants
      const masterLines = [
        "#EXTM3U",
        "#EXT-X-VERSION:6",
        ...variantEntries,
        "",
      ];
      const { writeFile } = await import("fs/promises");
      await writeFile(join(outputDir, "master.m3u8"), masterLines.join("\n"), "utf8");

      await this.prisma.lecture.update({
        where: { id: lectureId },
        data: {
          processingStatus: "READY",
          processingProgress: 100,
          processingError: null,
          hlsMasterUrl: `${baseUrl}/master.m3u8`,
          thumbnailUrl: thumbnailOk ? `${baseUrl}/thumbnail.jpg` : null,
        },
      });

      this.logger.log(`HLS ready for lecture ${lectureId} (${renditions.length} variants).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof Error &&
        error.message.includes("Record to update not found")
      ) {
        this.logger.warn(`Lecture ${lectureId} was deleted before processing finished.`);
        return;
      }
      await markFailed(message);
    }
  }
}