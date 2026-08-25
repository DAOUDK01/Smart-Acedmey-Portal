import { Injectable, Logger } from "@nestjs/common";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pool } from "pg";
import {
  resolveEmbeddingModel,
  resolveEmbeddingProvider,
} from "./tutor.provider";

const TABLE_NAME = "tutor_documents";

export type VectorMetadataFilter = Record<string, string>;

@Injectable()
export class TutorVectorStore {
  private readonly logger = new Logger(TutorVectorStore.name);
  private pool: Pool | null = null;
  private embeddings: OpenAIEmbeddings | null = null;
  private readyPromise: Promise<void> | null = null;

  get enabled(): boolean {
    return resolveEmbeddingProvider() !== null;
  }

  private getPool(): Pool {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    if (!this.pool) {
      this.pool = new Pool({ connectionString });
    }
    return this.pool;
  }

  private createEmbeddings(): OpenAIEmbeddings {
    const provider = resolveEmbeddingProvider();
    const model = resolveEmbeddingModel();
    if (!provider || !model) {
      throw new Error("No embedding provider configured");
    }

    if (provider === "openai") {
      return new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        model,
      });
    }

    return new OpenAIEmbeddings({
      apiKey: process.env.GROQ_API_KEY,
      model,
      configuration: {
        baseURL: "https://api.groq.com/openai/v1",
      },
    });
  }

  private getEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      this.embeddings = this.createEmbeddings();
    }
    return this.embeddings;
  }

  private ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = this.getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id BIGSERIAL PRIMARY KEY,
          page_content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          embedding REAL[] NOT NULL
        )`,
      )
      .then(() => undefined)
      .catch((error) => {
        this.readyPromise = null;
        this.logger.error(`Failed to prepare vector table: ${error}`);
        throw error;
      });
    return this.readyPromise;
  }

  private buildWhere(filter?: VectorMetadataFilter): {
    clause: string;
    values: string[];
  } {
    if (!filter || Object.keys(filter).length === 0) {
      return { clause: "", values: [] };
    }
    const entries = Object.entries(filter);
    const clause = entries
      .map((_, index) => `metadata->>$${index + 1} = $${index + 2}`)
      .join(" AND ");
    const values = entries.flatMap(([key, value]) => [key, value]);
    return { clause: `WHERE ${clause}`, values };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async similaritySearch(
    query: string,
    k: number,
    filter?: VectorMetadataFilter,
  ): Promise<{ pageContent: string; metadata: Record<string, unknown> }[]> {
    await this.ensureReady();
    const [queryVector] = await this.getEmbeddings().embedDocuments([query]);
    const { clause, values } = this.buildWhere(filter);
    const result = await this.getPool().query<{
      page_content: string;
      metadata: Record<string, unknown>;
      embedding: number[];
    }>(
      `SELECT page_content, metadata, embedding FROM ${TABLE_NAME} ${clause}`,
      values,
    );

    return result.rows
      .map((row) => ({
        pageContent: row.page_content,
        metadata: row.metadata,
        score: this.cosineSimilarity(queryVector, row.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ pageContent, metadata }) => ({ pageContent, metadata }));
  }

  async addDocuments(
    documents: { pageContent: string; metadata: Record<string, unknown> }[],
  ): Promise<void> {
    if (documents.length === 0) return;
    await this.ensureReady();
    const texts = documents.map((doc) => doc.pageContent);
    const vectors = await this.getEmbeddings().embedDocuments(texts);
    const pool = this.getPool();
    for (let i = 0; i < documents.length; i += 1) {
      await pool.query(
        `INSERT INTO ${TABLE_NAME} (page_content, metadata, embedding)
         VALUES ($1, $2::jsonb, $3::real[])`,
        [documents[i].pageContent, JSON.stringify(documents[i].metadata), vectors[i]],
      );
    }
  }

  async delete(filter: VectorMetadataFilter) {
    const { clause, values } = this.buildWhere(filter);
    await this.getPool().query(`DELETE FROM ${TABLE_NAME} ${clause}`, values);
  }

  async truncateAll() {
    await this.ensureReady();
    await this.getPool().query(`TRUNCATE TABLE ${TABLE_NAME}`);
  }

  async count(): Promise<number> {
    await this.ensureReady();
    const result = await this.getPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE_NAME}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async end() {
    if (this.pool) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;
      this.embeddings = null;
      this.readyPromise = null;
    }
  }
}