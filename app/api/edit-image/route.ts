import { NextResponse } from "next/server";
import sharp from "sharp";

const FIXED_PROMPT =
  "A fényképen szereplők hátterét cseréld egy tengeren hullámzó Viking hajó. A fotóalanyok kapjanak viking kinézetet (ruházat, kiegészítők, stb.)";
const TARGET_WIDTH = 1800;
const TARGET_HEIGHT = 1200;
const MODEL = "gemini-2.5-flash-image-preview";

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
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Hiányzó GOOGLE_API_KEY környezeti változó." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const imageFile = formData.get("image");

  if (!(imageFile instanceof File)) {
    return NextResponse.json(
      { error: "A kérésben nem található kép." },
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

  const payload = (await geminiResponse.json()) as GeminiResponse;

  if (!geminiResponse.ok) {
    return NextResponse.json(
      {
        error:
          payload.error?.message ??
          "Gemini API hiba történt a feldolgozás során.",
      },
      { status: geminiResponse.status },
    );
  }

  const imagePart = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data);

  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    return NextResponse.json(
      {
        error:
          "A Gemini válasza nem tartalmazott képet. Ellenőrizd az API jogosultságokat/modellt.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    elapsedMs,
    usedPrompt: FIXED_PROMPT,
    outputImageBase64: imagePart.inlineData.data,
    outputMimeType: imagePart.inlineData.mimeType,
  });
}
