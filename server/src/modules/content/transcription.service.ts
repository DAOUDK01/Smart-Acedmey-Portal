import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { fetchTranscript } from "youtube-transcript";
import { isConfiguredApiKey } from "../quiz/quiz.provider";

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

// Groq Whisper caps audio duration per request at ~10 minutes.
const CHUNK_SECONDS = 540;
const MAX_WHISPER_BLOCKS = 12;
const BLOCK_TARGET_CHARS = 260;

type WhisperConfig = {
  url: string;
  apiKey: string;
  model: string;
};

type TranscriptLine = { text: string; start: number };

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  /**
   * Extracts audio from an uploaded video and runs real speech-to-text (Whisper).
   * Returns a timestamped [Segment N @ mm:ss] transcript, or null when it cannot.
   */
  async transcribeVideoFile(filePath: string): Promise<string | null> {
    if (!existsSync(filePath)) return null;

    const config = this.resolveWhisperConfig();
    if (!config) return null;

    const audioPath = await this.extractAudio(filePath);
    if (!audioPath) return null;

    try {
      const transcript = await this.transcribeAudioChunks(audioPath, config);
      if (transcript?.trim()) {
        this.logger.log(`Transcribed uploaded file (${transcript.length} chars)`);
      }
      return transcript;
    } finally {
      rmSync(audioPath, { force: true });
    }
  }

  /**
   * Fetches the real captions of a YouTube video, plus the video length implied by the last caption
   * (YouTube links have no file to probe).
   */
  async transcribeYouTube(
    videoUrl: string,
  ): Promise<{ transcript: string; durationSeconds?: number } | null> {
    const id = this.extractYouTubeId(videoUrl);
    if (!id) return null;

    try {
      const captions = await fetchTranscript(id);
      // youtube-transcript reports offset/duration in milliseconds for the srv3 caption format but in
      // seconds for the classic one. Caption lines last a few seconds, so a median duration above 60
      // can only be milliseconds.
      const durations = captions
        .map((line) => Number(line.duration) || 0)
        .sort((a, b) => a - b);
      const toSeconds = (durations[Math.floor(durations.length / 2)] ?? 0) > 60 ? 1 / 1000 : 1;

      const lines = captions
        .map((line) => ({
          text: this.cleanCaptionText(line.text),
          start: (Number(line.offset) || 0) * toSeconds,
        }))
        .filter((line) => line.text.length > 0);

      if (lines.length === 0) return null;
      this.logger.log(`Fetched YouTube captions (${lines.length} lines)`);

      const last = captions[captions.length - 1];
      const endSeconds = Math.round(
        ((Number(last?.offset) || 0) + (Number(last?.duration) || 0)) * toSeconds,
      );
      return {
        transcript: this.buildStructuredTranscript(lines),
        durationSeconds: endSeconds > 0 ? endSeconds : undefined,
      };
    } catch (error) {
      this.logger.warn(`YouTube transcript fetch failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async transcribeAudioChunks(
    audioPath: string,
    config: WhisperConfig,
  ): Promise<string | null> {
    const durationMs = await this.audioDurationMs(audioPath);
    if (durationMs === null) {
      return null;
    }

    if (durationMs <= CHUNK_SECONDS * 1000) {
      const lines = await this.whisperTranscribe(audioPath, config, 0);
      return lines && lines.length > 0 ? this.buildStructuredTranscript(lines) : null;
    }

    const chunkDir = mkdtempSync(join(tmpdir(), "sap-whisper-chunks-"));
    try {
      await execFileAsync(
        FFMPEG,
        [
          "-y",
          "-i",
          audioPath,
          "-f",
          "segment",
          "-segment_time",
          String(CHUNK_SECONDS),
          "-c",
          "copy",
          join(chunkDir, "chunk_%03d.mp3"),
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 600_000 },
      );

      const chunkFiles = readdirSync(chunkDir)
        .filter((name) => name.endsWith(".mp3"))
        .sort()
        .map((name) => join(chunkDir, name));

      const allLines: TranscriptLine[] = [];
      for (const [index, chunkFile] of chunkFiles.entries()) {
        const partial = await this.whisperTranscribe(chunkFile, config, index * CHUNK_SECONDS);
        if (!partial || partial.length === 0) {
          return null;
        }
        allLines.push(...partial);
      }

      return this.buildStructuredTranscript(allLines);
    } catch (error) {
      this.logger.warn(`Audio chunking failed: ${(error as Error).message}`);
      return null;
    } finally {
      rmSync(chunkDir, { recursive: true, force: true });
    }
  }

  private async extractAudio(videoPath: string): Promise<string | null> {
    const dir = mkdtempSync(join(tmpdir(), "sap-whisper-"));
    const audioPath = join(dir, "audio.mp3");
    try {
      await execFileAsync(
        FFMPEG,
        [
          "-y",
          "-i",
          videoPath,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-b:a",
          "32k",
          audioPath,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 600_000 },
      );
      return audioPath;
    } catch (error) {
      this.logger.warn(`Audio extraction failed: ${(error as Error).message}`);
      rmSync(dir, { recursive: true, force: true });
      return null;
    }
  }

  /**
   * Length of a YouTube video in seconds, read from the public watch page (no API key needed).
   * Falls back to the end of the last caption when the page cannot be read.
   */
  async youTubeDurationSeconds(videoUrl: string): Promise<number | null> {
    const id = this.extractYouTubeId(videoUrl);
    if (!id) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${id}`, {
        signal: controller.signal,
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
      if (response.ok) {
        const page = await response.text();
        const seconds = Number(page.match(/"lengthSeconds":"(\d+)"/)?.[1]);
        if (seconds > 0) return seconds;
      }
    } catch (error) {
      this.logger.warn(`YouTube duration lookup failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    const captions = await this.transcribeYouTube(videoUrl);
    return captions?.durationSeconds ?? null;
  }

  /** Length of an audio or video file in whole seconds, or null when ffprobe cannot read it. */
  async mediaDurationSeconds(filePath: string): Promise<number | null> {
    const durationMs = await this.audioDurationMs(filePath);
    return durationMs ? Math.round(durationMs / 1000) : null;
  }

  private async audioDurationMs(audioPath: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(
        FFPROBE,
        ["-v", "error", "-show_entries", "format=duration", "-of", "json", audioPath],
        { maxBuffer: 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
      return Math.round((Number(parsed.format?.duration) || 0) * 1000);
    } catch (error) {
      this.logger.warn(`Could not probe audio duration: ${(error as Error).message}`);
      return null;
    }
  }

  private async whisperTranscribe(
    audioPath: string,
    config: WhisperConfig,
    offsetSeconds: number,
  ): Promise<TranscriptLine[] | null> {
    try {
      const audio = readFileSync(audioPath);
      const form = new FormData();
      form.append("file", new Blob([audio], { type: "audio/mpeg" }), "audio.mp3");
      form.append("model", config.model);
      form.append("response_format", "verbose_json");

      const response = await fetch(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        this.logger.warn(`Whisper API ${response.status}: ${detail}`);
        return null;
      }

      const data = (await response.json()) as {
        text?: string;
        segments?: { start: number; text?: string }[];
      };

      const segments =
        data.segments
          ?.map((segment) => ({
            text: this.cleanCaptionText(segment.text),
            start: offsetSeconds + (Number(segment.start) || 0),
          }))
          .filter((segment) => segment.text.length > 0) ?? [];

      if (segments.length > 0) {
        return segments;
      }

      const text = this.cleanCaptionText(data.text);
      return text ? [{ text, start: offsetSeconds }] : null;
    } catch (error) {
      this.logger.warn(`Whisper request failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildStructuredTranscript(lines: TranscriptLine[]): string {
    const groups: TranscriptLine[] = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && last.text.length < BLOCK_TARGET_CHARS) {
        last.text = `${last.text} ${line.text}`.trim();
      } else {
        groups.push({ ...line });
      }
    }

    const merged = groups.slice(0, MAX_WHISPER_BLOCKS);
    const tail = groups.slice(MAX_WHISPER_BLOCKS);
    if (tail.length > 0) {
      merged[merged.length - 1].text = `${merged[merged.length - 1].text} ${tail
        .map((group) => group.text)
        .join(" ")}`.trim();
    }

    return merged
      .map((group, index) => `[Segment ${index + 1} @ ${formatClock(group.start)}]\n${group.text}`)
      .join("\n\n");
  }

  private resolveWhisperConfig(): WhisperConfig | null {
    if (isConfiguredApiKey(process.env.GROQ_API_KEY)) {
      return {
        url:
          process.env.GROQ_WHISPER_URL?.trim() ||
          "https://api.groq.com/openai/v1/audio/transcriptions",
        apiKey: process.env.GROQ_API_KEY!,
        model: process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3",
      };
    }
    if (isConfiguredApiKey(process.env.OPENAI_API_KEY)) {
      return {
        url:
          process.env.OPENAI_WHISPER_URL?.trim() ||
          "https://api.openai.com/v1/audio/transcriptions",
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1",
      };
    }
    return null;
  }

  private extractYouTubeId(url: string): string | null {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(
      /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    return match?.[1] ?? null;
  }

  private cleanCaptionText(text: string | undefined): string {
    return String(text ?? "")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}