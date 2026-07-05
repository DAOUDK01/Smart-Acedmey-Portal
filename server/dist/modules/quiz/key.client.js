"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizApiClient = void 0;
class QuizApiClient {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async generateQuiz(topic, transcript) {
        const url = this.baseUrl || "https://api.example.com/generate";
        const prompt = transcript || topic;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                    "x-api-key": this.apiKey,
                },
                body: JSON.stringify({ prompt, topic, format: "json" }),
            });
            if (response.ok) {
                const data = await response.json();
                return data;
            }
            throw new Error(`API request failed: ${response.status}`);
        }
        catch (error) {
            console.error("Quiz API client error:", error);
            throw error;
        }
    }
}
exports.QuizApiClient = QuizApiClient;
