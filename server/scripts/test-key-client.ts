import "dotenv/config";
import { QuizApiClient } from "../src/modules/quiz/key.client";

async function testKeyClient() {
  console.log("Testing Quiz API Key Client...");

  if (!process.env.QUIZ_API_KEY) {
    console.warn("QUIZ_API_KEY not found, using mock data");
    const mockQuiz = {
      topic: "Mock Test Topic",
      questions: [
        { difficulty: "easy", question: "What is 2+2?", options: ["3", "4", "5", "6"], correctAnswer: "4", topic: "Math" },
        { difficulty: "medium", question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correctAnswer: "Paris", topic: "Geography" },
      ],
    };
    console.log("Mock Quiz Data:", JSON.stringify(mockQuiz, null, 2));
    return mockQuiz;
  }

  try {
    const client = new QuizApiClient(process.env.QUIZ_API_KEY, process.env.QUIZ_API_URL);
    const quiz = await client.generateQuiz("Test Topic", "Sample transcript text");
    console.log("Quiz Generated Successfully:", JSON.stringify(quiz, null, 2));
    return quiz;
  } catch (error) {
    console.error("Test failed:", error);
    throw error;
  }
}

testKeyClient().catch(console.error);
