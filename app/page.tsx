"use client";

import { FormEvent, useMemo, useState } from "react";

const FIXED_PROMPT =
  "A fényképen szereplők hátterét cseréld egy tengeren hullámzó Viking hajó. A fotóalanyok kapjanak viking kinézetet (ruházat, kiegészítők, stb.)";

type ApiResult = {
  elapsedMs: number;
  outputImageBase64: string;
  outputMimeType: string;
  usedPrompt: string;
};

type ApiError = {
  error?: string;
  requestId?: string;
  upstreamStatus?: number;
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const imagePreviewUrl = useMemo(() => {
    if (!file) {
      return null;
    }
    return URL.createObjectURL(file);
  }, [file]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Kérlek tölts fel egy képet.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("A fájl túl nagy. Maximum 15 MB méretű képet tölthetsz fel.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setIsLoading(true);
    try {
      const response = await fetch("/api/edit-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        const statusLabel = `HTTP ${response.status}`;
        const upstreamLabel =
          typeof payload?.upstreamStatus === "number"
            ? ` | Gemini: ${payload.upstreamStatus}`
            : "";
        const requestIdLabel = payload?.requestId ? ` | Azonosító: ${payload.requestId}` : "";

        throw new Error(
          `${payload?.error ?? "Ismeretlen hiba."} (${statusLabel}${upstreamLabel}${requestIdLabel})`,
        );
      }

      const payload = (await response.json()) as ApiResult;
      setResult(payload);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Hiba történt a feldolgozás során.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Gemini 2.5 (Nano Banana) – Viking Photo Demo</h1>
      <p className="subtitle">
        Tölts fel egy képet, elküldjük Gemini 2.5 image modellnek, és megmérjük
        mennyi idő alatt érkezik vissza az eredmény.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="image">Fotó feltöltése</label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <label htmlFor="prompt">Prompt (fix technikai brief)</label>
        <textarea id="prompt" value={FIXED_PROMPT} readOnly rows={4} />

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Feldolgozás..." : "Küldés Gemini 2.5-re"}
        </button>
      </form>

      {error ? <p className="error">Hiba: {error}</p> : null}

      <section className="results">
        {imagePreviewUrl ? (
          <article className="card">
            <h2>Eredeti kép (preview)</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt="Feltöltött eredeti" />
          </article>
        ) : null}

        {result ? (
          <article className="card">
            <h2>Gemini 2.5 válasz</h2>
            <p>
              <strong>Válaszidő:</strong> {result.elapsedMs} ms
            </p>
            <p>
              <strong>Használt prompt:</strong> {result.usedPrompt}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${result.outputMimeType};base64,${result.outputImageBase64}`}
              alt="Gemini által generált kép"
            />
          </article>
        ) : null}
      </section>
    </main>
  );
}
