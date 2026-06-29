import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

export const gemini = new GoogleGenAI(
    apiKey ? { apiKey } : {}
);
