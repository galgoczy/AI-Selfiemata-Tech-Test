import { NextResponse } from "next/server";
import sharp from "sharp";

const FIXED_PROMPT =
  "A fényképen szereplők hátterét cseréld egy tengeren hullámzó Viking hajó. A fotóalanyok kapjanak viking kinézetet (ruházat, kiegészítők, stb.)";
const TARGET_WIDTH = 1800;
const TARGET_HEIGHT = 1200;
const MODEL = "gemini-2.5-flash-image-preview";

const MAX_ERROR_BODY_LOG_LENGTH = 1200;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_GEMINI_IMAGE_BYTES = 2.5 * 1024 * 1024;
const JPEG_QUALITIES = [90, 82, 74, 66, 58];

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

async function prepareImageForGemini(originalBuffer: Buffer) {
  const resized = sharp(originalBuffer).resize(TARGET_WIDTH, TARGET_HEIGHT, {
    fit: "cover",
    position: "centre",
  });

  for (const quality of JPEG_QUALITIES) {
    const buffer = await resized.clone().jpeg({ quality }).toBuffer();
    if (buffer.length <= MAX_GEMINI_IMAGE_BYTES || quality === JPEG_QUALITIES[JPEG_QUALITIES.length - 1]) {
      return { buffer, quality };
    }
  }

  return { buffer: await resized.jpeg({ quality: 58 }).toBuffer(), quality: 58 };
}

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

    if (imageFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: "A feltöltött kép túl nagy. Maximum 15 MB fájl tölthető fel.",
          requestId,
        },
        { status: 413 },
      );
    }

    const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
    const { buffer: croppedBuffer, quality } = await prepareImageForGemini(originalBuffer);

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
      const isPayloadTooLarge = geminiResponse.status === 413;
      const detail = isPayloadTooLarge
        ? "A Gemini visszautasította a képet (413 Payload Too Large). Próbálj kisebb felbontású vagy jobban tömörített képet feltölteni."
        : payload?.error?.message ?? "Gemini API hiba történt a feldolgozás során.";

      console.error(
        `[edit-image][${requestId}] Gemini error. status=${geminiResponse.status}, code=${payload?.error?.code ?? "n/a"}, apiStatus=${payload?.error?.status ?? "n/a"}, detail=${detail}, requestImageBytes=${croppedBuffer.length}, jpegQuality=${quality}`,
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
