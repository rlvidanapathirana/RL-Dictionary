/**
 * RL Dictionary — Singlish → Sinhala phonetic transliteration engine.
 * Rule-based, longest-match-first, so free typing works for words that
 * are not in the dictionary (real Sinhala keyboard replacement).
 *
 * © lakshan.vercel.app
 */
(function (global) {
  "use strict";

  // Independent vowels (syllable-initial, no preceding consonant)
  const INDEP_VOWELS = [
    ["aae", "\u0D88"], ["Aae", "\u0D88"],
    ["au", "\u0D96"],
    ["ai", "\u0D93"],
    ["aa", "\u0D86"], ["A", "\u0D86"],
    ["ae", "\u0D87"],
    ["ii", "\u0D8A"], ["I", "\u0D8A"],
    ["ee", "\u0D92"], ["E", "\u0D92"],
    ["uu", "\u0D8C"], ["U", "\u0D8C"],
    ["oo", "\u0D95"], ["O", "\u0D95"],
    ["a", "\u0D85"],
    ["i", "\u0D89"],
    ["u", "\u0D8B"],
    ["e", "\u0D91"],
    ["o", "\u0D94"],
  ];

  // Dependent vowel signs (attach to a consonant, replacing inherent "a")
  // empty string = inherent vowel, no visible sign
  const DEP_VOWELS = [
    ["aae", "\u0DD1"], ["Aae", "\u0DD1"],
    ["au", "\u0DDE"],
    ["ai", "\u0DDB"],
    ["aa", "\u0DCF"], ["A", "\u0DCF"],
    ["ae", "\u0DD0"],
    ["ii", "\u0DD3"], ["I", "\u0DD3"],
    ["ee", "\u0DDA"], ["E", "\u0DDA"],
    ["uu", "\u0DD6"], ["U", "\u0DD6"],
    ["oo", "\u0DDD"], ["O", "\u0DDD"],
    ["a", ""],
    ["i", "\u0DD2"],
    ["u", "\u0DD4"],
    ["e", "\u0DD9"],
    ["o", "\u0DDC"],
  ];

  // Consonants — longest match first. This follows the widely-used
  // "Google Sinhala phonetic" convention: capital T/D/N/L/Sh mark the
  // retroflex/hard sounds (ට ඩ ණ ළ ෂ), lowercase t/d/n/l/sh the dental /
  // soft sounds (ත ද න ල ශ).
  const CONSONANTS = [
    ["chh", "\u0DA1"],
    ["kh", "\u0D9B"],
    ["gh", "\u0D9D"],
    ["jh", "\u0DA3"],
    ["ny", "\u0DA4"], ["nj", "\u0DA4"],
    ["gn", "\u0DA5"],
    ["ng", "\u0D9E"],
    ["Th", "\u0DA8"],
    ["Dh", "\u0DAA"],
    ["ph", "\u0DB5"],
    ["bh", "\u0DB7"],
    ["sh", "\u0DC1"],
    ["Sh", "\u0DC2"],
    ["ch", "\u0DA0"], ["c", "\u0DA0"],
    ["th", "\u0DAE"],
    ["dh", "\u0DB0"],
    ["T", "\u0DA7"],
    ["D", "\u0DA9"],
    ["N", "\u0DAB"],
    ["L", "\u0DC5"],
    ["R", "\u0DBB"],
    ["f", "\u0DC6"],
    ["k", "\u0D9A"],
    ["g", "\u0D9C"],
    ["j", "\u0DA2"],
    ["n", "\u0DB1"],
    ["t", "\u0DAD"],
    ["d", "\u0DAF"],
    ["p", "\u0DB4"],
    ["b", "\u0DB6"],
    ["m", "\u0DB8"],
    ["y", "\u0DBA"],
    ["r", "\u0DBB"],
    ["l", "\u0DBD"],
    ["v", "\u0DC0"],
    ["w", "\u0DC0"],
    ["s", "\u0DC3"],
    ["h", "\u0DC4"],
    ["x", "\u0D9A\u0DC3"], // ks
  ];

  const HALANT = "\u0DCA";

  // Whole-word / fixed special sequences resolved before general parsing
  const SPECIALS = {
    "shri": "\u0DC1\u0DCA\u200D\u0DBB\u0DD3",
    "shree": "\u0DC1\u0DCA\u200D\u0DBB\u0DD3",
    "sri": "\u0DC1\u0DCA\u200D\u0DBB\u0DD3",
  };

  function sortedByLenDesc(list) {
    return list.slice().sort((a, b) => b[0].length - a[0].length);
  }

  const CONS_SORTED = sortedByLenDesc(CONSONANTS);
  const INDEP_SORTED = sortedByLenDesc(INDEP_VOWELS);
  const DEP_SORTED = sortedByLenDesc(DEP_VOWELS);

  function matchAt(str, i, table) {
    for (const [key, val] of table) {
      if (str.startsWith(key, i)) return [key, val];
    }
    return null;
  }

  /**
   * Convert a Singlish (Latin) string into Sinhala Unicode.
   * Pure function, safe to call on every keystroke.
   */
  function transliterate(input) {
    if (!input) return "";
    let out = "";
    let i = 0;
    const lower = input; // keep original case (case carries meaning)

    while (i < lower.length) {
      const ch = lower[i];

      // pass through whitespace / digits / punctuation untouched
      if (/[\s\d.,!?;:'"()\[\]\-_/]/.test(ch)) {
        out += ch;
        i++;
        continue;
      }

      // check whole-word specials at word boundaries
      let matchedSpecial = false;
      for (const key in SPECIALS) {
        if (lower.startsWith(key, i)) {
          const before = i === 0 ? " " : lower[i - 1];
          const afterIdx = i + key.length;
          const after = afterIdx >= lower.length ? " " : lower[afterIdx];
          if (/[\s]/.test(before) && (/[\s]/.test(after) || afterIdx >= lower.length)) {
            out += SPECIALS[key];
            i += key.length;
            matchedSpecial = true;
            break;
          }
        }
      }
      if (matchedSpecial) continue;

      const consMatch = matchAt(lower, i, CONS_SORTED);
      if (consMatch) {
        const [ckey, cval] = consMatch;
        let j = i + ckey.length;
        const vowMatch = matchAt(lower, j, DEP_SORTED);
        if (vowMatch) {
          const [vkey, vval] = vowMatch;
          out += cval + vval;
          i = j + vkey.length;
        } else {
          // no vowel follows -> pure consonant with halant, UNLESS end of word
          // where inherent 'a' is commonly dropped in typing tools; we keep halant
          // only when followed by another consonant or explicit stop.
          const nextIsConsOrEnd =
            j >= lower.length || /[\s\d.,!?;:'"()\[\]\-_/]/.test(lower[j]) || matchAt(lower, j, CONS_SORTED);
          out += cval + (nextIsConsOrEnd ? HALANT : "");
          i = j;
        }
        continue;
      }

      const vowMatch = matchAt(lower, i, INDEP_SORTED);
      if (vowMatch) {
        out += vowMatch[1];
        i += vowMatch[0].length;
        continue;
      }

      // unknown character — pass through
      out += ch;
      i++;
    }
    return out;
  }

  global.RLTransliterate = {
    toSinhala: transliterate,
    /**
     * Loose phonetic canonicalisation used for forgiving Singlish search:
     * collapses letter-doubling and silent "h" so that spelling variants
     * like "kohomada" / "kohomadha" or "sthuthi" / "stuti" match the same key.
     */
    canonicalize: function (s) {
      if (!s) return "";
      let out = s.toLowerCase().replace(/[^a-z]/g, "");
      out = out.replace(/(.)\1+/g, "$1"); // collapse doubled letters
      out = out.replace(/([tdbgkpcj])h/g, "$1"); // drop silent aspiration marker
      out = out.replace(/w/g, "v"); // v/w are the same Sinhala letter
      return out;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
