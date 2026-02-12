# AI-Selfiemata Tech Test – Gemini 2.5 Nano Banana Demo

Egyszerű Next.js app, ami:

1. feltölt egy képet,
2. 1800×1200-as méretre croppolja,
3. elküldi a fix prompttal a **Gemini 2.5** image modellnek (`gemini-2.5-flash-image-preview`),
4. méri a válaszidőt,
5. és megjeleníti a visszakapott képet.

## Indítás

```bash
npm install
npm run dev
```

## Környezeti változók

Másold az `.env.example` fájlt `.env.local` néven, és töltsd ki:

```bash
GOOGLE_API_KEY="..."
```

> Fontos: a kulcs szerver oldalon marad (`/api/edit-image` route), nem kerül kliensbe.

## Deploy Vercelre

- Framework: Next.js
- Environment Variable: `GOOGLE_API_KEY`
- Build command: `npm run build`
- Start command: `npm start`

