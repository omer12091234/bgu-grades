# BGU Grade Distribution Explorer

A Next.js web app for viewing course grade distributions at Ben-Gurion University.

## Quick start (local)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — try department `361`, degree `1`, course `2251`.

## Deploy to Vercel (~2 minutes)

1. Push this folder to a GitHub repo
2. Go to vercel.com → **New Project** → import the repo
3. Framework is auto-detected as Next.js → click **Deploy**

No environment variables needed.

## Key files

| File | What it does |
|---|---|
| `app/api/series/route.ts` | Proxy: receives the browser's request, POSTs to BGU, returns JSON |
| `lib/fetcher.ts` | Term expansion, sequential upstream calls, in-memory cache, rate limiting |
| `lib/parser.ts` | XML→normalized TermDistribution. **Adjust field names here** after capturing a real response |
| `types/index.ts` | Shared TypeScript types |
| `components/GradeChart.tsx` | Bar chart (Chart.js) |
| `components/StatsTable.tsx` | Stats table with CSV export |
| `app/page.tsx` | Main RTL Hebrew UI |

## Adjusting the XML parser

In `lib/parser.ts`, change these constants to match your real fixture:

```ts
const XML_GRADE_FIELD      = "GRADE";      // actual element name for grade value
const XML_COUNT_FIELD      = "CNT";        // actual element name for student count
const XML_COURSE_NAME_FIELD = "COURSE_NAME";
const XML_DEPT_NAME_FIELD   = "DEPT_NAME";
```

## Privacy & compliance

- `P_FOR_STUDENT=0` is hardcoded server-side; client cannot override it.
- Terms with fewer than 5 students are suppressed.
- No response bodies are logged.
