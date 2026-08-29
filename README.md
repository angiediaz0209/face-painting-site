# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# face-painting-ca

## Tests

Unit tests use [Vitest](https://vitest.dev) and live next to the code they cover
(`shared/pricing.js` → `shared/pricing.test.js`). Test files are excluded from
the production build.

```bash
npm test            # run once
npm run test:watch  # re-run on save
```

## Address autocomplete (Google Places)

Sky's booking card and the client's booking page suggest real addresses and
venues as the client types, biased to Marin / SF / Santa Rosa. It switches on
when `VITE_GOOGLE_MAPS_BROWSER_KEY` is set (Vercel env var for production,
`.env.local` for local dev) and falls back to a plain text box otherwise.

Creating the key (Google Cloud Console, same Google account as the calendar):

1. APIs & Services → Library → enable **Places API (New)** and **Maps JavaScript API**.
2. Credentials → Create credentials → API key.
3. Restrict it: Application restrictions → **Websites** →
   `https://face-painting-site.vercel.app/*` (plus your custom domain and
   `http://localhost:5178/*` for dev). API restrictions → the two APIs above.
4. Billing must be enabled on the project; usage at this volume stays inside
   Google's monthly free credit.
