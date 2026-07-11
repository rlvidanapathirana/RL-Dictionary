# RL Dictionary

A free, offline-first trilingual dictionary web app — **English ⇄ Sinhala** and **English ⇄ Tamil** — with a built-in Sinhala phonetic typing engine (type Sinhala using your English keyboard), pronunciation, and light/dark themes. Installable as an app on mobile and desktop.

Built by **V.P.R. Lakshan Vidanapathirana** — [lakshan.vercel.app](https://lakshan.vercel.app)

> ⚠️ **Important:** don't just double-click `index.html` to test it. Browsers block a page from loading its own data files (`fetch()`) when opened directly from disk (`file://…`), so the dictionary will look empty / search won't return anything. Always run it through a local web server (see below) or a real host like GitHub Pages. The app itself detects this and will show a banner if you do open it directly.

## Features

- **Trilingual, all directions** — English ⇄ Sinhala, English ⇄ Tamil, and Sinhala ⇄ Tamil (the last one is bridged through the English data, since there's no direct Sinhala-Tamil dataset — results are labelled "bridged via English")
- **Type Sinhala without a Sinhala keyboard** — a rule-based phonetic (Singlish) engine converts English letters to Sinhala Unicode live as you type, plus a live "decode strip" preview, a typing cheat-sheet, and fuzzy spelling matching (so `kohomada` and `kohomadha` both find the same word)
- **Pronunciation** — tap the speaker icon to hear a word read aloud (uses your device's text-to-speech; falls back to a phonetic approximation when a Sinhala/Tamil voice isn't installed)
- **Installable app (PWA)** — "Add to Home Screen" on mobile or "Install" on desktop; works fully offline after the first visit
- **Light & dark themes** — a Ceylon-tea-green palette, remembers your preference
- **No backend, no tracking** — pure static site, all search happens in your browser

## Running locally

No build step needed — it's a static site.

```bash
cd dist
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploying to GitHub Pages

1. Create a new GitHub repository (e.g. `rl-dictionary`).
2. Push the contents of the `dist/` folder to the repository root (or to a `docs/` folder — either works).
3. In the repo **Settings → Pages**, set the source branch/folder accordingly.
4. Your app will be live at `https://<your-username>.github.io/rl-dictionary/`.

```bash
cd dist
git init
git add .
git commit -m "RL Dictionary — initial release"
git branch -M main
git remote add origin https://github.com/<your-username>/rl-dictionary.git
git push -u origin main
```

Then enable GitHub Pages for the `main` branch in the repository settings.

## Project structure

```
dist/
├── index.html            # app shell
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # service worker (offline caching)
├── css/styles.css        # design system + layout
├── js/
│   ├── app.js             # search, rendering, TTS, PWA install, theming
│   └── transliterate.js   # Singlish → Sinhala phonetic engine
├── data/
│   ├── en_si.json         # English → Sinhala (curated)
│   ├── si_en.json         # Sinhala → English (inverted index)
│   ├── si_sg.json         # Sinhala word → Singlish spellings
│   ├── sg_si.json         # Singlish spelling → Sinhala word(s)
│   ├── fuzzy_sg_si.json   # loose phonetic key → Sinhala word(s), for forgiving search
│   ├── en_ta.json         # English → Tamil (curated)
│   └── ta_en.json         # Tamil (granular tokens) → English
└── icons/                 # app icons & favicon
```

## Typing guide (Sinhala phonetic scheme)

| Type | Get | Type | Get | Type | Get |
|---|---|---|---|---|---|
| a | අ | k | ක | n | න |
| aa | ආ | g | ග | N | ණ |
| ae | ඇ | ch | ච | p | ප |
| i | ඉ | j | ජ | b | බ |
| ii | ඊ | t | ත | m | ම |
| u | උ | th | ථ | y | ය |
| uu | ඌ | T | ට | r | ර |
| e | එ | Th | ඨ | l | ල |
| ee | ඒ | d | ද | L | ළ |
| o | ඔ | dh | ධ | v / w | ව |
| oo | ඕ | D | ඩ | s | ස |
| | | Dh | ඪ | sh | ශ |
| | | | | Sh | ෂ |

Example: `kohomada` → කොහොමද, `stuti` → ස්තුති, `mama` → මම

## Data sources

Dictionary data was assembled and cleaned from community open-source Sinhala/Tamil language datasets. Data quality is community-sourced — corrections and extensions are welcome via pull request.

## License

Code: MIT. Dictionary data retains the license terms of its original open-source sources.
