(function () {
  "use strict";

  const TATWEEL = "\u0640";
  const CONNECTING_LETTERS = new Set([
    "ب", "پ", "ت", "ث", "ج", "چ", "ح", "خ", "س", "ش", "ص", "ض", "ط", "ظ",
    "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن", "ه", "ی", "ئ",
  ]);
  const RECEIVING_LETTERS = new Set([
    "آ", "ا", "ب", "پ", "ت", "ث", "ج", "چ", "ح", "خ", "د", "ذ", "ر", "ز",
    "ژ", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل",
    "م", "ن", "و", "ه", "ی", "ئ",
  ]);
  const PRIORITY = new Map([
    ["ش", 5], ["س", 5],
    ["ق", 4], ["ک", 4], ["گ", 4],
    ["پ", 3], ["ت", 3], ["ب", 3], ["ث", 3],
    ["ح", 2], ["ج", 2], ["چ", 2], ["خ", 2],
  ]);

  let context;

  function insertionPoints(text) {
    const characters = Array.from(text.replaceAll(TATWEEL, ""));
    const points = [];
    for (let index = 0; index < characters.length - 1; index += 1) {
      const current = characters[index];
      const next = characters[index + 1];
      if (CONNECTING_LETTERS.has(current) && RECEIVING_LETTERS.has(next)) {
        points.push({ index: index + 1, score: PRIORITY.get(current) ?? 1 });
      }
    }
    return points.sort((left, right) => right.score - left.score).map(({ index }) => index);
  }

  function withTatweels(characters, counts) {
    let result = "";
    characters.forEach((character, index) => {
      result += character;
      result += TATWEEL.repeat(counts[index + 1] ?? 0);
    });
    return result;
  }

  function measure(text, font) {
    context ??= document.createElement("canvas").getContext("2d");
    if (!context) return 0;
    context.font = font;
    return context.measureText(text).width;
  }

  function equalize(container) {
    const lines = [...container.querySelectorAll(".persian-align-line")];
    if (lines.length < 2) return;

    const style = getComputedStyle(lines[0]);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const originals = lines.map((line) => {
      const original = line.dataset.originalText ?? line.textContent ?? "";
      const clean = original.replaceAll(TATWEEL, "").trim();
      line.dataset.originalText = clean;
      return clean;
    });
    const widths = originals.map((text) => measure(text, font));
    const targetWidth = Math.max(...widths);

    lines.forEach((line, lineIndex) => {
      const original = originals[lineIndex];
      const points = insertionPoints(original);
      if (points.length === 0 || targetWidth - widths[lineIndex] <= 1) {
        line.textContent = original;
        return;
      }

      const characters = Array.from(original);
      const counts = new Array(characters.length + 1).fill(0);
      let bestText = original;
      let bestDistance = targetWidth - widths[lineIndex];

      for (let iteration = 0; iteration < 64; iteration += 1) {
        const point = points[iteration % points.length];
        counts[point] += 1;
        const candidate = withTatweels(characters, counts);
        const candidateWidth = measure(candidate, font);
        const distance = Math.abs(targetWidth - candidateWidth);
        if (distance <= bestDistance) {
          bestText = candidate;
          bestDistance = distance;
        }
        if (candidateWidth >= targetWidth) break;
      }

      line.textContent = bestText;
    });
  }

  function run() {
    document.querySelectorAll("[data-persian-align]").forEach(equalize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
  document.fonts?.ready.then(run);

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(run, 150);
  });

  document.addEventListener("copy", (event) => {
    const selected = getSelection()?.toString() ?? "";
    if (!selected.includes(TATWEEL) || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", selected.replaceAll(TATWEEL, ""));
    event.preventDefault();
  });

  window.PersianAligner = { run };
})();
