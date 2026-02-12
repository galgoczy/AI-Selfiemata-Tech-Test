import { NextResponse } from "next/server";
import sharp from "sharp";

const FIXED_PROMPT =
  "A fényképen szereplők hátterét cseréld egy tengeren hullámzó Viking hajó. A fotóalanyok kapjanak viking kinézetet (ruházat, kiegészítők, stb.)";
const TARGET_WIDTH = 1800;
const TARGET_HEIGHT = 1200;
const MODEL = "gemini-2.5-flash-image-preview";

const MAX_ERROR_BODY_LOG_LENGTH = 1200;

type GeminiPart = {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
    status?: string;
    code?: number;
  };
};

const createRequestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error(`[edit-image][${requestId}] Missing GOOGLE_API_KEY environment variable.`);

      return NextResponse.json(
        { error: "Hiányzó GOOGLE_API_KEY környezeti változó.", requestId },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get("image");

    if (!(imageFile instanceof File)) {
      return NextResponse.json(
        { error: "A kérésben nem található kép.", requestId },
        { status: 400 },
      );
    }

    const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
    const croppedBuffer = await sharp(originalBuffer)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: "cover",
        position: "centre",
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const startedAt = performance.now();
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: croppedBuffer.toString("base64"),
                    mimeType: "image/jpeg",
                  },
                },
                { text: FIXED_PROMPT },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      },
    );
    const elapsedMs = Math.round(performance.now() - startedAt);

    const rawResponseText = await geminiResponse.text();
    let payload: GeminiResponse | null = null;

    if (rawResponseText) {
      try {
        payload = JSON.parse(rawResponseText) as GeminiResponse;
      } catch {
        console.error(
          `[edit-image][${requestId}] Gemini returned non-JSON response: ${rawResponseText.slice(0, MAX_ERROR_BODY_LOG_LENGTH)}`,
        );
      }
    }

    if (!geminiResponse.ok) {
      const detail = payload?.error?.message ?? "Gemini API hiba történt a feldolgozás során.";

      console.error(
        `[edit-image][${requestId}] Gemini error. status=${geminiResponse.status}, code=${payload?.error?.code ?? "n/a"}, apiStatus=${payload?.error?.status ?? "n/a"}, detail=${detail}`,
      );

      if (!payload?.error?.message && rawResponseText) {
        console.error(
          `[edit-image][${requestId}] Gemini raw error payload: ${rawResponseText.slice(0, MAX_ERROR_BODY_LOG_LENGTH)}`,
        );
      }

      return NextResponse.json(
        {
          error: detail,
          requestId,
          upstreamStatus: geminiResponse.status,
        },
        { status: geminiResponse.status },
      );
    }

    const imagePart = payload?.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
      console.error(
        `[edit-image][${requestId}] Gemini response did not include an image. response=${rawResponseText.slice(0, MAX_ERROR_BODY_LOG_LENGTH)}`,
      );

      return NextResponse.json(
        {
          error:
            "A Gemini válasza nem tartalmazott képet. Ellenőrizd az API jogosultságokat/modellt.",
          requestId,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      elapsedMs,
      usedPrompt: FIXED_PROMPT,
      outputImageBase64: imagePart.inlineData.data,
      outputMimeType: imagePart.inlineData.mimeType,
      requestId,
    });
  } catch (error) {
    console.error(`[edit-image][${requestId}] Unexpected route error:`, error);

    return NextResponse.json(
      {
        error: "Váratlan szerverhiba történt a kép feldolgozása közben.",
        requestId,
      },
      { status: 500 },
    );
  }
}
