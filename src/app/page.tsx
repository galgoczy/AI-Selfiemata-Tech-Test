"use client";

import { useState, useRef, useCallback } from "react";

const TARGET_WIDTH = 1800;
const TARGET_HEIGHT = 1200;

function cropAndResizeImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = TARGET_WIDTH;
        canvas.height = TARGET_HEIGHT;
        const ctx = canvas.getContext("2d")!;

        const targetAspect = TARGET_WIDTH / TARGET_HEIGHT;
        const imgAspect = img.width / img.height;

        let sx = 0,
          sy = 0,
          sw = img.width,
          sh = img.height;

        if (imgAspect > targetAspect) {
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAspect;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageDataRef = useRef<{ base64: string; mimeType: string } | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResultUrl(null);
    setElapsed(null);
    setResponseText(null);

    try {
      const { base64, mimeType } = await cropAndResizeImage(file);
      imageDataRef.current = { base64, mimeType };
      setPreviewUrl(`data:${mimeType};base64,${base64}`);
    } catch {
      setError("Failed to process the image.");
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!imageDataRef.current) return;

    setLoading(true);
    setError(null);
    setResultUrl(null);
    setElapsed(null);
    setResponseText(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataRef.current.base64,
          mimeType: imageDataRef.current.mimeType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "API request failed");
        if (data.elapsedMs) setElapsed(data.elapsedMs);
        return;
      }

      setElapsed(data.elapsedMs);
      setResponseText(data.text || null);

      if (data.image && data.mimeType) {
        setResultUrl(`data:${data.mimeType};base64,${data.image}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setPreviewUrl(null);
    setResultUrl(null);
    setElapsed(null);
    setError(null);
    setResponseText(null);
    imageDataRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Viking Image Generator
          </h1>
          <p className="mt-2 text-lg text-slate-400">
            Gemini 2.5 Flash &middot; Image Editing Tech Demo
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Tölts fel egy fotót, és a Gemini viking jelenetre alakítja!
          </p>
        </header>

        {/* Prompt display */}
        <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Prompt
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            &ldquo;A fényképen szereplők hátterét cseréld egy tengeren hullámzó
            Viking hajóra. A fotóalanyok kapjanak viking kinézetet (ruházat,
            kiegészítők, stb.)&rdquo;
          </p>
        </div>

        {/* Upload area */}
        {!previewUrl && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/30 py-20 transition hover:border-amber-500 hover:bg-slate-800/60">
            <svg
              className="mb-4 h-12 w-12 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
              />
            </svg>
            <span className="text-lg font-medium text-slate-300">
              Kép feltöltése
            </span>
            <span className="mt-1 text-sm text-slate-500">
              JPG, PNG &middot; Automatikus crop {TARGET_WIDTH}&times;{TARGET_HEIGHT}px
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}

        {/* Preview + Result */}
        {previewUrl && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Original */}
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Eredeti (cropolt)
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-700">
                  <img
                    src={previewUrl}
                    alt="Original"
                    className="w-full object-cover"
                  />
                </div>
              </div>

              {/* Result */}
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Eredmény
                </p>
                <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50">
                  {loading && (
                    <div className="flex flex-col items-center gap-3 py-16">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                      <span className="text-sm text-slate-400">
                        Gemini dolgozik...
                      </span>
                    </div>
                  )}
                  {resultUrl && !loading && (
                    <img
                      src={resultUrl}
                      alt="Viking result"
                      className="w-full object-cover"
                    />
                  )}
                  {!resultUrl && !loading && (
                    <span className="text-slate-600 text-sm">
                      Nyomd meg a &ldquo;Generálás&rdquo; gombot
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            {elapsed !== null && (
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Válaszidő
                  </span>
                  <p className="text-2xl font-bold text-amber-400">
                    {(elapsed / 1000).toFixed(2)}s
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Modell
                  </span>
                  <p className="text-lg font-medium text-slate-200">
                    gemini-2.5-flash-image
                  </p>
                </div>
              </div>
            )}

            {/* Response text */}
            {responseText && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Gemini szöveges válasz
                </span>
                <p className="mt-1 text-sm text-slate-300">{responseText}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-900/30 px-5 py-3 text-red-300">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="rounded-lg bg-amber-600 px-6 py-3 font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Generálás..." : "Generálás"}
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="rounded-lg border border-slate-600 px-6 py-3 font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
              >
                Új kép feltöltése
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
