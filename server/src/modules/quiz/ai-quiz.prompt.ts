export const AI_QUIZ_PROMPT = `You are an AI quiz generator. Generate a quiz based on the given lecture transcript or topic. 
Return the quiz in strict JSON format with the following structure:
{
  "topic": "string",
  "questions": [
    {
      "difficulty": "easy|medium|hard",
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string",
      "topic": "string"
    }
  ]
}`;
