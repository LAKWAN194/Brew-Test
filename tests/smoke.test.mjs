/**
 * End-to-end smoke tests for The Brew Test.
 *
 * Boots both builds in jsdom -- the modular site (index.html + fetch) and the
 * bundled dist/brew-test.html -- then drives a full attempt through the real
 * DOM: picking topics, answering, scoring, reviewing and retaking. Also
 * validates the question bank itself (ids, answer indices, image files).
 *
 *   npm install && npm test
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const results = [];
// app.js keeps its state in top-level `const`s, which an eval scope does not
// publish. Append an export line inside the same scope to reach them.
const EXPOSE = `
;window.__app = {state, drawPool, showScreen, renderQuestion, finishQuiz, INLINE_QUESTIONS: typeof INLINE_QUESTIONS !== "undefined" ? INLINE_QUESTIONS : null};`;
const check = (name, cond, extra = "") =>
  results.push({ name, ok: !!cond, extra });

async function boot(htmlPath, { inline }) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "http://localhost:8000/",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = async (url) => {
    const file = path.join(ROOT, url);
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };

  if (inline) {
    // standalone build: run the single inline <script>
    const code = [...dom.window.document.querySelectorAll("script")]
      .map((s) => s.textContent).join("\n");
    w.eval(code + EXPOSE);
  } else {
    w.eval(fs.readFileSync(path.join(ROOT, "assets/js/app.js"), "utf8") + EXPOSE);
  }
  // let the async init settle
  await new Promise((r) => setTimeout(r, 300));
  return w;
}

function exercise(w, label) {
  const d = w.document;
  const $ = (s) => d.querySelector(s);

  check(`${label}: sections rendered`, d.querySelectorAll(".section-row").length === 9,
    `got ${d.querySelectorAll(".section-row").length}`);
  check(`${label}: tagline shows count`, /146 questions/.test($(".tagline").textContent),
    $(".tagline").textContent);

  const total = d.querySelectorAll(".count-pill").length
    ? [...d.querySelectorAll(".count-pill")].reduce((n, e) => n + +e.textContent, 0) : 0;
  check(`${label}: section counts sum to 146`, total === 146, `got ${total}`);
  check(`${label}: slider max = 146`, $("#count-slider").max === "146", $("#count-slider").max);

  // "select none" disables start
  $("#select-none-btn").click();
  check(`${label}: select none -> error note`, $("#err-note").style.display === "block");
  $("#select-all-btn").click();
  check(`${label}: select all -> no error`, $("#err-note").style.display === "none");

  // start a 10 question quiz
  $("#count-slider").value = "10";
  $("#count-slider").dispatchEvent(new w.Event("input"));
  $("#start-btn").click();

  check(`${label}: quiz screen visible`, !$("#quiz-screen").classList.contains("hidden"));
  check(`${label}: progress text`, $("#progress-text").textContent === "Question 1 of 10",
    $("#progress-text").textContent);
  check(`${label}: options rendered`, d.querySelectorAll("#opts-container .opt").length >= 2,
    `${d.querySelectorAll("#opts-container .opt").length} opts`);
  check(`${label}: prev disabled on Q1`, $("#prev-btn").disabled);

  // answer every question correctly by reading the live state
  const state = w.__app.state;
  for (let i = 0; i < 10; i++) {
    const item = state.pool[state.index];
    // Click the options whose original index is in `correct`, re-querying the
    // rows each time so we only ever click what is actually on screen.
    item.correct.forEach((origIdx) => {
      const pos = item.shuffledOpts.findIndex((o) => o.orig === origIdx);
      const rows = [...d.querySelectorAll("#opts-container .opt")];
      rows[pos].querySelector("input").click();
    });
    const given = state.answers[state.index] || [];
    check(`${label}: Q${i + 1} (${item.id}) records all ${item.correct.length} answer(s)`,
      given.length === item.correct.length && item.correct.every((c) => given.includes(c)),
      `given ${JSON.stringify(given)} vs correct ${JSON.stringify(item.correct)}`);
    $("#next-btn").click();
  }

  check(`${label}: results screen visible`, !$("#results-screen").classList.contains("hidden"));
  check(`${label}: perfect score`, $("#score-num").textContent === "10 / 10",
    $("#score-num").textContent);
  check(`${label}: 100%`, $("#score-pct").textContent === "100%", $("#score-pct").textContent);
  check(`${label}: review items`, d.querySelectorAll(".review-item").length === 10,
    `${d.querySelectorAll(".review-item").length}`);

  // "missed only" filter should now be empty
  [...d.querySelectorAll(".filter-chip")].find((c) => c.dataset.filter === "wrong").click();
  check(`${label}: missed-only empty on perfect run`,
    d.querySelectorAll(".review-item").length === 0,
    `${d.querySelectorAll(".review-item").length}`);

  // retake reshuffles and returns to quiz
  $("#retake-btn").click();
  check(`${label}: retake -> quiz screen`, !$("#quiz-screen").classList.contains("hidden"));
  check(`${label}: retake keeps count`, $("#progress-text").textContent === "Question 1 of 10",
    $("#progress-text").textContent);
}

// ---- multi-select + image handling, driven from the data ----
function dataChecks() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/questions.json"), "utf8"));
  const qs = data.questions;
  check("data: 146 questions", qs.length === 146, `${qs.length}`);
  check("data: unique ids", new Set(qs.map((q) => q.id)).size === qs.length);
  check("data: every correct index in range",
    qs.every((q) => q.correct.every((i) => i >= 0 && i < q.opts.length)));
  check("data: no empty option text", qs.every((q) => q.opts.every((o) => o && o.trim())));
  check("data: every question has >=2 options", qs.every((q) => q.opts.length >= 2));
  check("data: every question has >=1 correct", qs.every((q) => q.correct.length >= 1));
  const withImg = qs.filter((q) => q.image);
  check("data: 7 questions carry an image", withImg.length === 7, `${withImg.length}`);
  check("data: image files all exist",
    withImg.every((q) => fs.existsSync(path.join(ROOT, "assets/img/questions", q.image))),
    withImg.map((q) => q.image).join(", "));
  const multi = qs.filter((q) => q.correct.length > 1);
  check("data: multi-answer questions present", multi.length > 0, `${multi.length} multi-select`);
}

async function imageAndMultiRender() {
  const w = await boot(path.join(ROOT, "index.html"), { inline: false });
  const d = w.document;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/questions.json"), "utf8"));

  // force a pool containing an image question and a multi-answer question
  const imgQ = data.questions.find((q) => q.image);
  const multiQ = data.questions.find((q) => q.correct.length > 1);
  {
    const a = w.__app;
    a.state.pool = a.drawPool([imgQ.section], 1000).filter(q => q.id === imgQ.id);
    a.state.index = 0; a.state.answers = {};
    a.showScreen('quiz'); a.renderQuestion();
  }
  const img = d.querySelector("#q-image-slot img");
  check("render: image question shows <img>", !!img);
  check("render: image src points at assets/img/questions/",
    img && img.getAttribute("src") === "assets/img/questions/" + imgQ.image,
    img && img.getAttribute("src"));

  {
    const a = w.__app;
    a.state.pool = a.drawPool([multiQ.section], 1000).filter(q => q.id === multiQ.id);
    a.state.index = 0; a.state.answers = {};
    a.showScreen('quiz'); a.renderQuestion();
  }
  check("render: multi-answer note shown",
    !d.querySelector("#multi-note").classList.contains("hidden"));
  check("render: multi-answer uses checkboxes",
    d.querySelector("#opts-container input").type === "checkbox",
    d.querySelector("#opts-container input").type);

  // Ticking several boxes must accumulate, and must not tear down the rows
  // under the user's feet -- focus has to survive each selection.
  {
    const item = w.__app.state.pool[0];
    const firstRow = d.querySelectorAll("#opts-container .opt")[0];
    const firstInput = firstRow.querySelector("input");
    item.correct.forEach((origIdx) => {
      const pos = item.shuffledOpts.findIndex((o) => o.orig === origIdx);
      d.querySelectorAll("#opts-container .opt")[pos].querySelector("input").click();
    });
    const given = w.__app.state.answers[0] || [];
    check("multi: all ticked boxes accumulate",
      given.length === item.correct.length && item.correct.every((c) => given.includes(c)),
      `given ${JSON.stringify(given)} vs ${JSON.stringify(item.correct)}`);
    check("multi: option rows survive selection (focus not destroyed)",
      d.contains(firstInput));
    check("multi: checked state matches answers",
      [...d.querySelectorAll("#opts-container .opt")].every((row, i) =>
        row.querySelector("input").checked === given.includes(item.shuffledOpts[i].orig)));
    check("multi: selected class matches answers",
      [...d.querySelectorAll("#opts-container .opt")].every((row, i) =>
        row.classList.contains("selected") === given.includes(item.shuffledOpts[i].orig)));

    // untick one -> it must drop out of the answer
    const dropPos = item.shuffledOpts.findIndex((o) => o.orig === item.correct[0]);
    d.querySelectorAll("#opts-container .opt")[dropPos].querySelector("input").click();
    check("multi: unticking removes that answer",
      !(w.__app.state.answers[0] || []).includes(item.correct[0]),
      JSON.stringify(w.__app.state.answers[0]));

    // reset for the scoring check below
    w.__app.state.answers = {};
    w.__app.renderQuestion();
  }

  // partial answer on a multi-select must score as missed
  const state = w.__app.state;
  const item = state.pool[0];
  const rows = [...d.querySelectorAll("#opts-container .opt")];
  const pos = item.shuffledOpts.findIndex((o) => o.orig === item.correct[0]);
  rows[pos].querySelector("input").click();
  w.__app.finishQuiz();
  check("scoring: partial multi-select counts as missed",
    d.querySelector("#score-num").textContent === "0 / 1",
    d.querySelector("#score-num").textContent);
}

// ---- file:// fallback message ----
async function fileProtocolCheck() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///C:/x/index.html" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = async () => { throw new Error("not allowed"); };
  w.eval(fs.readFileSync(path.join(ROOT, "assets/js/app.js"), "utf8"));
  await new Promise((r) => setTimeout(r, 200));
  const text = w.document.getElementById("start-screen").textContent;
  check("file://: shows helpful message", /python -m http\.server/.test(text), text.trim().slice(0, 90));
}

const STANDALONE = path.join(ROOT, "dist/brew-test.html");
if (!fs.existsSync(STANDALONE)) {
  console.error("dist/brew-test.html is missing -- run `npm run build` first.");
  process.exit(1);
}

const w1 = await boot(path.join(ROOT, "index.html"), { inline: false });
exercise(w1, "repo");
const w2 = await boot(STANDALONE, { inline: true });
exercise(w2, "standalone");
// standalone must not hit the network at all
check("standalone: images inlined as data URIs", (() => {
  const d = w2.document;
  const data = w2.__app.INLINE_QUESTIONS;
  return data.questions.filter((q) => q.image).every((q) => q.image.startsWith("data:image/"));
})());
dataChecks();
await imageAndMultiRender();
await fileProtocolCheck();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra && !r.ok ? "  -> " + r.extra : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
