import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";

export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const GEMINI_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
] as const;

const OPENAI_MODELS = ["gpt-image-1.5"] as const;

const ALL_MODELS = [...GEMINI_MODELS, ...OPENAI_MODELS] as const;
type AllowedModel = (typeof ALL_MODELS)[number];

function isGeminiModel(model: string): model is (typeof GEMINI_MODELS)[number] {
  return (GEMINI_MODELS as readonly string[]).includes(model);
}

function isOpenAIModel(model: string): model is (typeof OPENAI_MODELS)[number] {
  return (OPENAI_MODELS as readonly string[]).includes(model);
}

async function generateWithGemini(
  model: (typeof GEMINI_MODELS)[number],
  prompt: string,
  image: string,
  mimeType: string
) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model,
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

  return { resultImage, resultMimeType, resultText };
}

async function generateWithOpenAI(
  model: (typeof OPENAI_MODELS)[number],
  prompt: string,
  image: string,
  mimeType: string
) {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const imageBuffer = Buffer.from(image, "base64");
  const ext = mimeType.includes("png") ? "png" : "jpeg";
  const file = await toFile(imageBuffer, `input.${ext}`, { type: mimeType || "image/jpeg" });

  const response = await openai.images.edit({
    model,
    image: file,
    prompt,
  });

  const resultData = response.data?.[0];

  let resultImage: string | null = null;
  let resultMimeType: string | null = null;

  if (resultData?.b64_json) {
    resultImage = resultData.b64_json;
    resultMimeType = "image/png";
  } else if (resultData?.url) {
    // Fetch the image from URL and convert to base64
    const imgResponse = await fetch(resultData.url);
    const arrayBuffer = await imgResponse.arrayBuffer();
    resultImage = Buffer.from(arrayBuffer).toString("base64");
    resultMimeType = imgResponse.headers.get("content-type") || "image/png";
  }

  return { resultImage, resultMimeType, resultText: null as string | null };
}

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType, model, prompt } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const selectedModel: AllowedModel =
      (ALL_MODELS as readonly string[]).includes(model)
        ? (model as AllowedModel)
        : "gemini-2.5-flash-image";

    const startTime = Date.now();

    let resultImage: string | null = null;
    let resultMimeType: string | null = null;
    let resultText: string | null = null;

    if (isOpenAIModel(selectedModel)) {
      ({ resultImage, resultMimeType, resultText } = await generateWithOpenAI(
        selectedModel,
        prompt,
        image,
        mimeType
      ));
    } else if (isGeminiModel(selectedModel)) {
      ({ resultImage, resultMimeType, resultText } = await generateWithGemini(
        selectedModel,
        prompt,
        image,
        mimeType
      ));
    }

    const elapsedMs = Date.now() - startTime;

    if (!resultImage) {
      return NextResponse.json(
        {
          error: "No image returned from the model",
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
      model: selectedModel,
    });
  } catch (error: unknown) {
    console.error("API error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
