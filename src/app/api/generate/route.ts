import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt =
      "A fényképen szereplők hátterét cseréld egy tengeren hullámzó Viking hajóra. A fotóalanyok kapjanak viking kinézetet (ruházat, kiegészítők, stb.)";

    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: image,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const elapsedMs = Date.now() - startTime;

    let resultImage: string | null = null;
    let resultMimeType: string | null = null;
    let resultText: string | null = null;

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          resultImage = part.inlineData.data ?? null;
          resultMimeType = part.inlineData.mimeType ?? null;
        }
        if (part.text) {
          resultText = part.text;
        }
      }
    }

    if (!resultImage) {
      return NextResponse.json(
        {
          error: "No image returned from Gemini",
          text: resultText,
          elapsedMs,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      image: resultImage,
      mimeType: resultMimeType,
      text: resultText,
      elapsedMs,
    });
  } catch (error: unknown) {
    console.error("Gemini API error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
