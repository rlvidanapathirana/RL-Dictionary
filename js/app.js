(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 0. Small DOM helpers
   * ------------------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  const searchInput = $("#search-input");
  const clearBtn = $("#clearBtn");
  const resultsList = $("#resultsList");
  const resultsMeta = $("#resultsMeta");
  const emptyState = $("#emptyState");
  const noResults = $("#noResults");
  const noResultsSub = $("#noResultsSub");
  const decodeStrip = $("#decodeStrip");
  const decodeOutput = $("#decodeOutput");
  const singlishToggle = $("#singlishToggle");
  const guideToggle = $("#guideToggle");
  const typingGuide = $("#typingGuide");
  const quickChips = $("#quickChips");
  const toastEl = $("#toast");

  const SI_RE = /[\u0D80-\u0DFF]/;
  const TA_RE = /[\u0B80-\u0BFF]/;

  /* ---------------------------------------------------------------------
   * 1. State
   * ------------------------------------------------------------------- */
  const state = {
    pair: "en-si",       // "en-si" | "en-ta"
    singlish: false,     // singlish typing mode (Sinhala only)
    query: "",
  };

  const EXAMPLES = {
    "en-si": ["water", "school", "beautiful", "kohomada", "stuti", "friend"],
    "en-ta": ["water", "school", "beautiful", "friend", "welcome", "book"],
    "si-ta": ["ජලය", "පාසල", "මිතුරා", "stuti", "kohomada", "poth"],
  };

  /* ---------------------------------------------------------------------
   * 2. Lazy dataset loader + binary-search index
   * ------------------------------------------------------------------- */
  const cache = {}; // name -> sorted [[key, value], ...]
  const loading = {};

  function loadData(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    if (loading[name]) return loading[name];
    loading[name] = fetch(`data/${name}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${name}`);
        return r.json();
      })
      .then((arr) => {
        cache[name] = arr;
        return arr;
      })
      .catch((err) => {
        console.error(err);
        showToast("Could not load dictionary data. Check your connection.");
        return [];
      });
    return loading[name];
  }

  function lowerBound(arr, key) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] < key) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function exactLookup(arr, key) {
    const i = lowerBound(arr, key);
    if (i < arr.length && arr[i][0] === key) return arr[i][1];
    return null;
  }

  function prefixLookup(arr, prefix, limit) {
    const out = [];
    if (!prefix) return out;
    let i = lowerBound(arr, prefix);
    while (i < arr.length && arr[i][0].startsWith(prefix) && out.length < limit) {
      out.push(arr[i]);
      i++;
    }
    return out;
  }

  /* ---------------------------------------------------------------------
   * 3. Search
   * ------------------------------------------------------------------- */
  let searchToken = 0;

  async function runSearch(rawQuery) {
    const myToken = ++searchToken;
    const q = rawQuery.trim();
    state.query = q;

    if (!q) {
      showEmpty();
      return;
    }

    let results = [];
    let meta = "";

    if (state.pair === "en-si") {
      const [enSi, siEn, siSg, sgSi, fuzzySgSi] = await Promise.all([
        loadData("en_si"), loadData("si_en"), loadData("si_sg"), loadData("sg_si"), loadData("fuzzy_sg_si"),
      ]);
      if (myToken !== searchToken) return;

      if (state.singlish && !SI_RE.test(q)) {
        // Singlish phonetic mode: treat latin input as phonetic Sinhala
        const guess = window.RLTransliterate.toSinhala(q);
        const seen = new Set();

        // 1) dataset's own singlish spellings, fuzzy-matched (forgives spelling
        //    variants like "kohomada" vs the dataset's "kohomadha")
        const fuzzyKey = window.RLTransliterate.canonicalize(q);
        for (const [, siWords] of prefixLookup(fuzzySgSi, fuzzyKey, 30)) {
          for (const siWord of siWords) {
            if (seen.has(siWord)) continue;
            seen.add(siWord);
            const engWords = exactLookup(siEn, siWord) || [];
            results.push(makeSiResult(siWord, engWords, siSg));
          }
          if (results.length >= 40) break;
        }
        // 2) exact-spelling dataset match (case-insensitive prefix)
        const qLower = q.toLowerCase();
        for (const [, siWords] of prefixLookup(sgSi, qLower, 20)) {
          for (const siWord of siWords) {
            if (seen.has(siWord)) continue;
            seen.add(siWord);
            const engWords = exactLookup(siEn, siWord) || [];
            results.push(makeSiResult(siWord, engWords, siSg));
          }
        }
        // 3) direct engine-converted guess against the curated Sinhala index
        for (const [siWord, engWords] of prefixLookup(siEn, guess, 15)) {
          if (seen.has(siWord)) continue;
          seen.add(siWord);
          results.push(makeSiResult(siWord, engWords, siSg));
        }
        meta = `Typed “${q}” → ${guess}`;
      } else if (SI_RE.test(q)) {
        // Direct Sinhala unicode search
        const exact = exactLookup(siEn, q);
        const entries = exact
          ? [[q, exact]]
          : prefixLookup(siEn, q, 40);
        for (const [siWord, engWords] of entries) {
          results.push(makeSiResult(siWord, engWords, siSg));
        }
      } else {
        // Plain English search
        const qLower = q.toLowerCase();
        const exact = exactLookup(enSi, qLower);
        let entries = exact ? [[qLower, exact]] : [];
        entries = entries.concat(prefixLookup(enSi, qLower, 40).filter((e) => e[0] !== qLower));
        for (const [enWord, meanings] of entries.slice(0, 40)) {
          results.push(makeEnSiResult(enWord, meanings, siSg));
        }
      }
    } else if (state.pair === "en-ta") {
      const [enTa, taEn] = await Promise.all([loadData("en_ta"), loadData("ta_en")]);
      if (myToken !== searchToken) return;

      if (TA_RE.test(q)) {
        const exact = exactLookup(taEn, q);
        const entries = exact ? [[q, exact]] : prefixLookup(taEn, q, 40);
        for (const [taPhrase, enWords] of entries) {
          results.push(makeTaResult(taPhrase, enWords));
        }
      } else {
        const qLower = q.toLowerCase();
        const exact = exactLookup(enTa, qLower);
        let entries = exact ? [[qLower, exact]] : [];
        entries = entries.concat(prefixLookup(enTa, qLower, 40).filter((e) => e[0] !== qLower));
        for (const [enWord, meanings] of entries.slice(0, 40)) {
          results.push(makeEnTaResult(enWord, meanings));
        }
      }
    } else {
      // si-ta — Sinhala ⇄ Tamil, bridged through the English data
      // (there is no direct Sinhala-Tamil dataset, so we pivot via English).
      const [enSi, siEn, siSg, sgSi, fuzzySgSi, enTa, taEn] = await Promise.all([
        loadData("en_si"), loadData("si_en"), loadData("si_sg"), loadData("sg_si"),
        loadData("fuzzy_sg_si"), loadData("en_ta"), loadData("ta_en"),
      ]);
      if (myToken !== searchToken) return;

      if (state.singlish && !SI_RE.test(q) && !TA_RE.test(q)) {
        const guess = window.RLTransliterate.toSinhala(q);
        const heads = new Set();
        const fuzzyKey = window.RLTransliterate.canonicalize(q);
        for (const [, siWords] of prefixLookup(fuzzySgSi, fuzzyKey, 20)) {
          for (const w of siWords) heads.add(w);
        }
        const qLower = q.toLowerCase();
        for (const [, siWords] of prefixLookup(sgSi, qLower, 15)) {
          for (const w of siWords) heads.add(w);
        }
        for (const [siWord] of prefixLookup(siEn, guess, 10)) heads.add(siWord);
        for (const siWord of heads) results.push(bridgeSiToTa(siWord, siEn, siSg, enTa));
        meta = `Typed “${q}” → ${guess} (bridged via English)`;
      } else if (SI_RE.test(q)) {
        const exact = exactLookup(siEn, q);
        const entries = exact ? [q] : prefixLookup(siEn, q, 20).map((e) => e[0]);
        for (const siWord of entries) results.push(bridgeSiToTa(siWord, siEn, siSg, enTa));
        meta = "Sinhala → Tamil (bridged via English)";
      } else if (TA_RE.test(q)) {
        const exact = exactLookup(taEn, q);
        const entries = exact ? [q] : prefixLookup(taEn, q, 20).map((e) => e[0]);
        for (const taWord of entries) results.push(bridgeTaToSi(taWord, taEn, enSi, siSg));
        meta = "Tamil → Sinhala (bridged via English)";
      } else {
        showToast("Type in Sinhala or Tamil script, or turn on Singlish typing.");
      }
      // Show real bridges first; keep a few no-bridge-found entries visible too
      // (rather than hiding them) so the person can see the word was recognised.
      results.sort((a, b) => (b.bridged.length > 0) - (a.bridged.length > 0));
      results = results.slice(0, 25);
    }

    if (myToken !== searchToken) return;
    renderResults(results, meta);
  }

  function makeSiResult(siWord, engWords, siSgArr) {
    const singlish = exactLookup(siSgArr, siWord);
    return {
      kind: "si",
      headword: siWord,
      headwordScript: "si",
      phonetic: singlish && singlish[0] ? singlish[0] : null,
      meanings: engWords || [],
      meaningsScript: "latin",
    };
  }

  function makeEnSiResult(enWord, meanings, siSgArr) {
    return {
      kind: "en-si",
      headword: enWord,
      headwordScript: "latin",
      phonetic: null,
      meanings,
      meaningsScript: "si",
    };
  }

  const POS_RE = /^\s*(?:-\d+\s+)?([a-zA-Z]{1,6}(?:\.[a-zA-Z]{0,6}){0,2}\.)\s*/;
  const LONG_MEANING_LIMIT = 220;

  function makeTaResult(taPhrase, enWords) {
    return {
      kind: "ta",
      headword: taPhrase,
      headwordScript: "ta",
      phonetic: null,
      meanings: enWords || [],
      meaningsScript: "latin",
    };
  }

  function makeEnTaResult(enWord, meanings) {
    return {
      kind: "en-ta",
      headword: enWord,
      headwordScript: "latin",
      phonetic: null,
      meanings,
      meaningsScript: "ta",
    };
  }

  function bridgeSiToTa(siWord, siEn, siSg, enTa) {
    const singlish = exactLookup(siSg, siWord);
    const enWords = exactLookup(siEn, siWord) || [];
    const bridged = [];
    const seenText = new Set();
    for (const enWord of enWords.slice(0, 5)) {
      const taMeanings = exactLookup(enTa, enWord);
      if (!taMeanings) continue;
      for (const t of taMeanings.slice(0, 2)) {
        if (seenText.has(t)) continue;
        seenText.add(t);
        bridged.push({ text: t, via: enWord });
      }
    }
    return {
      kind: "si-ta",
      headword: siWord,
      headwordScript: "si",
      phonetic: singlish && singlish[0] ? singlish[0] : null,
      bridged,
      bridgedScript: "ta",
    };
  }

  function bridgeTaToSi(taWord, taEn, enSi, siSg) {
    const enWords = exactLookup(taEn, taWord) || [];
    const bridged = [];
    const seenText = new Set();
    for (const enWord of enWords.slice(0, 5)) {
      const siMeanings = exactLookup(enSi, enWord);
      if (!siMeanings) continue;
      for (const s of siMeanings.slice(0, 3)) {
        if (seenText.has(s)) continue;
        seenText.add(s);
        const singlish = exactLookup(siSg, s);
        bridged.push({ text: s, via: enWord, phonetic: singlish && singlish[0] ? singlish[0] : null });
      }
    }
    return {
      kind: "ta-si",
      headword: taWord,
      headwordScript: "ta",
      phonetic: null,
      bridged,
      bridgedScript: "si",
    };
  }

  /* ---------------------------------------------------------------------
   * 4. Rendering
   * ------------------------------------------------------------------- */
  function showEmpty() {
    resultsList.innerHTML = "";
    resultsMeta.classList.add("hidden");
    noResults.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }

  function renderResults(results, meta) {
    emptyState.classList.add("hidden");
    resultsList.innerHTML = "";

    if (!results.length) {
      noResults.classList.remove("hidden");
      resultsMeta.classList.add("hidden");
      noResultsSub.textContent = state.singlish
        ? "No matching Sinhala word found for that spelling. Try adjusting it, or check the typing guide."
        : "Try a different spelling, or switch the language pair above.";
      return;
    }

    noResults.classList.add("hidden");
    if (meta) {
      resultsMeta.textContent = meta;
      resultsMeta.classList.remove("hidden");
    } else {
      resultsMeta.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
      resultsMeta.classList.remove("hidden");
    }

    const frag = document.createDocumentFragment();
    results.slice(0, 40).forEach((r) => frag.appendChild(renderCard(r)));
    resultsList.appendChild(frag);
  }

  function scriptClass(script) {
    if (script === "si") return "script-si";
    if (script === "ta") return "script-ta";
    return "";
  }

  function speakLangFor(script) {
    if (script === "si") return "si-LK";
    if (script === "ta") return "ta-IN";
    return "en-US";
  }

  function renderCard(r) {
    const card = el("li", "entry-card");

    const head = el("div", "entry-head");
    const headWrap = el("div", "entry-headword-wrap");
    const hw = el("div", `entry-headword ${scriptClass(r.headwordScript)}`);
    hw.textContent = r.headword;
    headWrap.appendChild(hw);
    if (r.phonetic) {
      const ph = el("div", "entry-phonetic");
      ph.textContent = "/ " + r.phonetic + " /";
      headWrap.appendChild(ph);
    }
    head.appendChild(headWrap);

    const speakBtn = el("button", "speak-btn");
    speakBtn.type = "button";
    speakBtn.title = "Pronounce";
    speakBtn.setAttribute("aria-label", "Pronounce " + r.headword);
    speakBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/></svg>';
    speakBtn.addEventListener("click", () => speak(r.headword, r.headwordScript, r.phonetic, speakBtn));
    head.appendChild(speakBtn);

    card.appendChild(head);

    if (r.bridged) {
      if (r.bridged.length) {
        const list = el("ol", "entry-meanings" + (r.bridgedScript === "ta" ? " tab-ta-active" : ""));
        r.bridged.slice(0, 10).forEach((b) => {
          const li = document.createElement("li");
          const textSpan = el("span", `bridged-text ${scriptClass(r.bridgedScript)}`);
          textSpan.textContent = b.text;
          li.appendChild(textSpan);
          const via = el("span", "entry-cross-inline");
          via.textContent = ` (via English: ${b.via})`;
          li.appendChild(via);
          list.appendChild(li);
        });
        card.appendChild(list);
        const note = el("div", "bridge-note", "Bridged translation via English — meanings may be approximate.");
        card.appendChild(note);
      } else {
        const none = el("div", "entry-cross", "No Tamil/Sinhala bridge found for this word yet.");
        card.appendChild(none);
      }
      return card;
    }

    if (r.meanings && r.meanings.length) {
      const list = el("ol", "entry-meanings" + (r.meaningsScript === "ta" ? " tab-ta-active" : ""));
      r.meanings.slice(0, 12).forEach((m) => {
        const li = document.createElement("li");
        const cleaned = cleanMeaning(m, r.meaningsScript);
        const isLong = cleaned.text.length > LONG_MEANING_LIMIT;
        const textSpan = el("span", "meaning-text");
        textSpan.textContent = isLong ? cleaned.text.slice(0, LONG_MEANING_LIMIT).trim() + "\u2026" : cleaned.text;
        li.appendChild(textSpan);
        if (cleaned.pos) {
          const pos = el("span", "entry-pos");
          pos.textContent = cleaned.pos;
          li.insertBefore(pos, textSpan);
        }
        if (isLong) {
          const moreBtn = el("button", "more-btn");
          moreBtn.type = "button";
          moreBtn.textContent = "Show more";
          let expanded = false;
          moreBtn.addEventListener("click", () => {
            expanded = !expanded;
            textSpan.textContent = expanded ? cleaned.text : cleaned.text.slice(0, LONG_MEANING_LIMIT).trim() + "\u2026";
            moreBtn.textContent = expanded ? "Show less" : "Show more";
          });
          li.appendChild(moreBtn);
        }
        list.appendChild(li);
      });
      card.appendChild(list);
    } else {
      const none = el("div", "entry-cross", "No translation on file for this entry yet.");
      card.appendChild(none);
    }

    return card;
  }

  function cleanMeaning(text, script) {
    if (script === "ta") {
      const m = text.match(POS_RE);
      if (m) {
        const pos = m[1].trim();
        const rest = text.slice(m[0].length).trim();
        return { text: rest, pos };
      }
    }
    return { text, pos: null };
  }

  /* ---------------------------------------------------------------------
   * 5. Text-to-speech (with graceful fallback for scripts without voices)
   * ------------------------------------------------------------------- */
  let voicesCache = null;
  function getVoices() {
    if (voicesCache && voicesCache.length) return voicesCache;
    voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return voicesCache;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { voicesCache = window.speechSynthesis.getVoices(); };
  }

  function findVoice(langPrefix) {
    const voices = getVoices();
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
  }

  function speak(text, script, phonetic, btn) {
    if (!window.speechSynthesis) {
      showToast("Pronunciation isn't supported on this browser.");
      return;
    }
    window.speechSynthesis.cancel();

    let utterText = text;
    let lang = "en-US";
    const nativeVoice = script === "si" ? findVoice("si") : script === "ta" ? findVoice("ta") : findVoice("en");

    if (script === "si" && !nativeVoice) {
      // No Sinhala voice on this device — approximate using the Singlish
      // spelling read by an English voice, which is closer than silence.
      utterText = phonetic || text;
      lang = "en-US";
      showToast("No Sinhala voice on this device — reading a close phonetic approximation.");
    } else if (script === "ta" && !nativeVoice) {
      lang = "en-US";
      showToast("No Tamil voice on this device — pronunciation may be approximate.");
    } else {
      lang = script === "si" ? "si-LK" : script === "ta" ? "ta-IN" : "en-US";
    }

    const utter = new SpeechSynthesisUtterance(utterText);
    utter.lang = lang;
    if (nativeVoice) utter.voice = nativeVoice;
    utter.rate = 0.92;

    if (btn) {
      btn.classList.add("speaking");
      utter.onend = () => btn.classList.remove("speaking");
      utter.onerror = () => btn.classList.remove("speaking");
    }
    window.speechSynthesis.speak(utter);
  }

  /* ---------------------------------------------------------------------
   * 6. Decode strip (signature live-transliteration element)
   * ------------------------------------------------------------------- */
  function updateDecodeStrip(query) {
    const singlishCapable = state.pair === "en-si" || state.pair === "si-ta";
    if (!(singlishCapable && state.singlish && query && !SI_RE.test(query) && !TA_RE.test(query))) {
      decodeStrip.classList.add("hidden");
      return;
    }
    const converted = window.RLTransliterate.toSinhala(query);
    decodeStrip.classList.remove("hidden");
    decodeOutput.innerHTML = "";
    const frag = document.createDocumentFragment();
    [...converted].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "ch";
      span.style.animationDelay = (i * 14) + "ms";
      span.textContent = ch;
      frag.appendChild(span);
    });
    decodeOutput.appendChild(frag);
  }

  /* ---------------------------------------------------------------------
   * 7. UI wiring
   * ------------------------------------------------------------------- */
  let debounceTimer = null;
  searchInput.addEventListener("input", (e) => {
    const v = e.target.value;
    clearBtn.classList.toggle("hidden", !v);
    updateDecodeStrip(v);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(v), 120);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    decodeStrip.classList.add("hidden");
    searchInput.focus();
    showEmpty();
  });

  function placeholderFor(pair) {
    if (pair === "en-si") return "Search a word in English or Sinhala…";
    if (pair === "en-ta") return "Search a word in English or Tamil…";
    return "Type in Sinhala or Tamil script…";
  }

  function setActivePair(pair) {
    state.pair = pair;
    document.querySelectorAll(".lang-tab").forEach((t) => {
      const active = t.dataset.pair === pair;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    searchInput.placeholder = placeholderFor(pair);
    const singlishCapable = pair === "en-si" || pair === "si-ta";
    singlishToggle.classList.toggle("hidden", !singlishCapable);
    if (!singlishCapable) {
      state.singlish = false;
      singlishToggle.setAttribute("aria-pressed", "false");
      decodeStrip.classList.add("hidden");
      typingGuide.classList.add("hidden");
      guideToggle.setAttribute("aria-pressed", "false");
    }
    renderQuickChips();
    if (searchInput.value) runSearch(searchInput.value);
    else showEmpty();
  }

  document.querySelectorAll(".lang-tab").forEach((tab) => {
    tab.addEventListener("click", () => setActivePair(tab.dataset.pair));
  });

  singlishToggle.addEventListener("click", () => {
    state.singlish = !state.singlish;
    singlishToggle.setAttribute("aria-pressed", String(state.singlish));
    searchInput.placeholder = state.singlish
      ? "Type phonetically, e.g. kohomada, stuti…"
      : placeholderFor(state.pair);
    updateDecodeStrip(searchInput.value);
    if (searchInput.value) runSearch(searchInput.value);
  });

  guideToggle.addEventListener("click", () => {
    const showing = typingGuide.classList.toggle("hidden");
    guideToggle.setAttribute("aria-pressed", String(!showing));
  });

  function renderQuickChips() {
    quickChips.innerHTML = "";
    EXAMPLES[state.pair].forEach((word) => {
      const chip = el("button", "quick-chip");
      chip.type = "button";
      chip.textContent = word;
      chip.addEventListener("click", () => {
        searchInput.value = word;
        clearBtn.classList.remove("hidden");
        if (/^[a-z]+$/i.test(word) && (state.pair === "en-si" || state.pair === "si-ta") && !/^(water|school|beautiful|friend)$/.test(word)) {
          // example singlish word — auto enable singlish mode for clarity
          state.singlish = true;
          singlishToggle.setAttribute("aria-pressed", "true");
        } else if (state.pair !== "si-ta" || SI_RE.test(word) || TA_RE.test(word)) {
          state.singlish = false;
          singlishToggle.setAttribute("aria-pressed", "false");
        }
        updateDecodeStrip(searchInput.value);
        runSearch(word);
      });
      quickChips.appendChild(chip);
    });
  }

  /* ---------------------------------------------------------------------
   * 8. Theme toggle
   * ------------------------------------------------------------------- */
  const themeToggle = $("#themeToggle");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    try { localStorage.setItem("rl-theme", theme); } catch (e) {}
  }
  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("rl-theme"); } catch (e) {}
    if (saved) applyTheme(saved);
    else {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  })();
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  /* ---------------------------------------------------------------------
   * 9. Toast
   * ------------------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => toastEl.classList.add("hidden"), 250);
    }, 3200);
  }

  /* ---------------------------------------------------------------------
   * 10. PWA install prompt
   * ------------------------------------------------------------------- */
  let deferredPrompt = null;
  const installBtn = $("#installBtn");
  const installBtnFooter = $("#installBtnFooter");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });

  async function triggerInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add("hidden");
      if (choice.outcome === "accepted") showToast("Installing RL Dictionary…");
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      showToast("On iPhone/iPad: tap Share, then “Add to Home Screen”.");
    } else {
      showToast("Use your browser menu → “Install app” / “Add to Home Screen”.");
    }
  }
  installBtn.addEventListener("click", triggerInstall);
  installBtnFooter.addEventListener("click", triggerInstall);

  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    showToast("RL Dictionary installed. It now works offline.");
  });

  /* ---------------------------------------------------------------------
   * 11. Service worker registration
   * ------------------------------------------------------------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
    });
  }

  /* ---------------------------------------------------------------------
   * 12. Init
   * ------------------------------------------------------------------- */
  renderQuickChips();
  showEmpty();

  if (window.location.protocol === "file:") {
    const warn = $("#fileProtocolWarning");
    if (warn) warn.classList.remove("hidden");
    showToast("Open this from a web server, not by double-clicking the file — see README.md.");
  } else {
    // warm up the primary dataset in the background
    loadData("en_si");
  }
})();
