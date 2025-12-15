import { GoogleGenAI, Type } from "@google/genai";
import { GameStats } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are "AstroWing Command", a battle-hardened, tactical AI flight commander for a futuristic fighter jet pilot.
Your role is to provide short, punchy, military-style commentary based on the pilot's performance.
Tone: Professional, urgent, encouraging but strict. Sci-fi military jargon is encouraged.
Keep responses under 25 words.
Respond in English.
`;

export const generateBriefing = async (): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Generate a mission start briefing. The pilot is launching into a hostile sector filled with enemy drones. Brief, urgent command.",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
      }
    });
    return response.text || "Systems online. Engage hostiles at will.";
  } catch (error) {
    console.error("Gemini briefing failed", error);
    return "Comms link unstable. Proceed with caution.";
  }
};

export const generateTacticalUpdate = async (event: string, score: number): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Event: ${event}. Current Score: ${score}. Give a quick tactical comment.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.9,
      }
    });
    return response.text || "Data received. Keep fighting.";
  } catch (error) {
    return "Signal interference detected.";
  }
};

export const generateDebrief = async (stats: GameStats): Promise<{ rank: string; message: string }> => {
  try {
    const prompt = `
      Mission Report:
      - Score: ${stats.score}
      - Wave Reached: ${stats.wave}
      - Enemies Destroyed: ${stats.enemiesDestroyed}
      - Survival Time: ${stats.timeSurvived}s
      - Accuracy: ${Math.round((stats.shotsHit / (stats.shotsFired || 1)) * 100)}%

      Provide a Mission Debrief.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rank: {
              type: Type.STRING,
              description: "One word rank (e.g. ROOKIE, ACE, LEGEND, ELITE, DISGRACE)",
            },
            message: {
              type: Type.STRING,
              description: "A 1-2 sentence evaluation of performance.",
            },
          },
          propertyOrdering: ["rank", "message"],
        },
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("No response");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Debrief failed", error);
    return { rank: "UNKNOWN", message: "Flight data corrupted. Return to base." };
  }
};