/* =========================================================
   The Brew Test — café knowledge quiz
   ---------------------------------------------------------
   Questions live in data/questions.json so the bank can be
   edited without touching application code. Each entry:

     {
       "id":      "intro-1",
       "section": "Introduction to Coffee",
       "q":       "Question text (English / Sinhala)",
       "opts":    ["...", "...", "...", "..."],
       "correct": [1],                 // indices into opts
       "image":   "intro-12.png"       // optional
     }

   `correct` refers to the ORIGINAL option order. Options are
   shuffled at render time and each rendered option carries its
   original index, so this array is never mutated.
   ========================================================= */

const DATA_URL   = 'data/questions.json';
const IMAGE_BASE = 'assets/img/questions/';

/* =========================================================
   STATE
   ========================================================= */
let QUESTIONS = [];
let SECTIONS  = [];

const state = {
  pool: [],     // questions drawn for this attempt, options pre-shuffled
  index: 0,
  answers: {}   // pool index -> array of selected ORIGINAL option indices
};

/* =========================================================
   HELPERS
   ========================================================= */
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function arraysEqualAsSets(a,b){
  if(a.length!==b.length) return false;
  const sb = new Set(b);
  return a.every(x=>sb.has(x));
}

/** Build one attempt: n questions from the given sections, options shuffled. */
function drawPool(sections, n){
  const eligible = QUESTIONS.filter(q=>sections.includes(q.section));
  return shuffle(eligible).slice(0, n).map(q=>({
    id: q.id,
    section: q.section,
    q: q.q,
    image: q.image,
    correct: q.correct,
    shuffledOpts: shuffle(q.opts.map((text,i)=>({text, orig:i})))
  }));
}

/** `src` is a filename under IMAGE_BASE, or an inlined data URI in the standalone build. */
function imageBox(src, alt){
  const box = document.createElement('div');
  box.className = 'q-image-box';
  const img = document.createElement('img');
  img.src = src.startsWith('data:') ? src : IMAGE_BASE + src;
  img.alt = alt;
  img.loading = 'lazy';
  box.appendChild(img);
  return box;
}

/* =========================================================
   ELEMENTS
   ========================================================= */
const startScreen   = document.getElementById('start-screen');
const sectionListEl = document.getElementById('section-list');
const countSlider   = document.getElementById('count-slider');
const countNum      = document.getElementById('count-num');
const errNote       = document.getElementById('err-note');

const qTextEl       = document.getElementById('q-text');
const optsContainer = document.getElementById('opts-container');
const progressText  = document.getElementById('progress-text');
const topicTag      = document.getElementById('topic-tag');
const cupBarFill    = document.getElementById('cup-bar-fill');
const multiNote     = document.getElementById('multi-note');
const qImageSlot    = document.getElementById('q-image-slot');
const prevBtn       = document.getElementById('prev-btn');
const nextBtn       = document.getElementById('next-btn');

/* =========================================================
   SCREEN SWITCHING
   ========================================================= */
function showScreen(name){
  startScreen.classList.toggle('hidden', name!=='start');
  document.getElementById('quiz-screen').classList.toggle('hidden', name!=='quiz');
  document.getElementById('results-screen').classList.toggle('hidden', name!=='results');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* =========================================================
   START SCREEN
   ========================================================= */
function sectionCount(name){
  return QUESTIONS.filter(q=>q.section===name).length;
}

function buildSectionList(){
  sectionListEl.innerHTML = '';
  SECTIONS.forEach(name=>{
    const row = document.createElement('div');
    row.className = 'section-row';

    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'sec-check';
    cb.value = name;
    cb.checked = true;
    cb.addEventListener('change', updateAvailablePool);
    const span = document.createElement('span');
    span.textContent = name;
    label.append(cb, span);

    const pill = document.createElement('span');
    pill.className = 'count-pill';
    pill.textContent = sectionCount(name);

    row.append(label, pill);
    sectionListEl.appendChild(row);
  });
}

function selectedSections(){
  return Array.from(sectionListEl.querySelectorAll('.sec-check:checked')).map(cb=>cb.value);
}

function updateAvailablePool(){
  const total = QUESTIONS.filter(q=>selectedSections().includes(q.section)).length;
  if(total===0){
    countSlider.max = 1;
    countSlider.value = 1;
    countNum.textContent = 0;
    errNote.style.display = 'block';
    return;
  }
  errNote.style.display = 'none';
  const prev = parseInt(countSlider.value,10) || total;
  countSlider.max = total;
  countSlider.value = Math.min(prev, total) || total;
  countNum.textContent = countSlider.value;
}

countSlider.addEventListener('input', ()=>{ countNum.textContent = countSlider.value; });

document.getElementById('select-all-btn').addEventListener('click', ()=>{
  sectionListEl.querySelectorAll('.sec-check').forEach(cb=>cb.checked=true);
  updateAvailablePool();
});

document.getElementById('select-none-btn').addEventListener('click', ()=>{
  sectionListEl.querySelectorAll('.sec-check').forEach(cb=>cb.checked=false);
  updateAvailablePool();
});

document.getElementById('start-btn').addEventListener('click', ()=>{
  const secs = selectedSections();
  if(secs.length===0){ errNote.style.display='block'; return; }
  startAttempt(secs, parseInt(countSlider.value,10));
});

function startAttempt(sections, n){
  state.pool = drawPool(sections, n);
  state.index = 0;
  state.answers = {};
  showScreen('quiz');
  renderQuestion();
}

/* =========================================================
   QUIZ SCREEN
   ========================================================= */
function renderQuestion(){
  const item = state.pool[state.index];
  const isMulti = item.correct.length > 1;

  progressText.textContent = `Question ${state.index+1} of ${state.pool.length}`;
  topicTag.textContent = item.section;
  cupBarFill.style.width = (state.index / state.pool.length * 100) + '%';

  qTextEl.textContent = item.q;
  multiNote.classList.toggle('hidden', !isMulti);

  qImageSlot.innerHTML = '';
  if(item.image) qImageSlot.appendChild(imageBox(item.image, 'Illustration for this question'));

  const selected = state.answers[state.index] || [];
  optsContainer.innerHTML = '';
  item.shuffledOpts.forEach(opt=>{
    const isSelected = selected.includes(opt.orig);

    const row = document.createElement('label');
    row.className = 'opt' + (isSelected ? ' selected' : '');

    const input = document.createElement('input');
    input.type = isMulti ? 'checkbox' : 'radio';
    input.name = 'opt';
    input.checked = isSelected;
    input.addEventListener('change', ()=>{
      const cur = state.answers[state.index] || [];
      state.answers[state.index] = isMulti
        ? (cur.includes(opt.orig) ? cur.filter(x=>x!==opt.orig) : [...cur, opt.orig])
        : [opt.orig];
      // Repaint the existing rows rather than re-rendering the question, so
      // keyboard focus survives a selection — it matters most on the
      // multi-answer questions, where several boxes get ticked in a row.
      syncSelection();
    });

    const text = document.createElement('span');
    text.className = 'opt-text';
    text.textContent = opt.text;

    row.append(input, text);
    optsContainer.appendChild(row);
  });

  prevBtn.disabled = state.index===0;
  nextBtn.textContent = state.index === state.pool.length-1 ? 'Finish →' : 'Next →';
}

/** Push the current answer for this question back onto the already-rendered rows. */
function syncSelection(){
  const item = state.pool[state.index];
  const selected = state.answers[state.index] || [];
  Array.from(optsContainer.children).forEach((row, i)=>{
    const on = selected.includes(item.shuffledOpts[i].orig);
    row.classList.toggle('selected', on);
    row.querySelector('input').checked = on;
  });
}

prevBtn.addEventListener('click', ()=>{
  if(state.index>0){ state.index--; renderQuestion(); }
});

nextBtn.addEventListener('click', ()=>{
  if(state.index < state.pool.length-1){
    state.index++;
    renderQuestion();
  } else {
    finishQuiz();
  }
});

/* =========================================================
   RESULTS
   ========================================================= */
function scoreMessage(pct){
  if(pct===100) return 'Perfect brew. ☕✨';
  if(pct>=80)   return 'Strong pour — nearly there.';
  if(pct>=60)   return 'Decent cup. A bit more study will smooth it out.';
  return 'Bit of a weak brew — worth another pass.';
}

function finishQuiz(){
  const correctCount = state.pool.reduce((n, item, idx)=>
    n + (arraysEqualAsSets(state.answers[idx] || [], item.correct) ? 1 : 0), 0);
  const total = state.pool.length;
  const pct = total ? Math.round((correctCount/total)*100) : 0;

  document.getElementById('score-num').textContent = `${correctCount} / ${total}`;
  document.getElementById('score-pct').textContent = `${pct}%`;
  document.getElementById('score-msg').textContent = scoreMessage(pct);
  cupBarFill.style.width = '100%';

  renderReview('all');
  showScreen('results');
}

function renderReview(filter){
  const container = document.getElementById('review-container');
  container.innerHTML = '';

  state.pool.forEach((item, idx)=>{
    const given = state.answers[idx] || [];
    const isCorrect = arraysEqualAsSets(given, item.correct);
    if(filter==='wrong' && isCorrect) return;

    const wrap = document.createElement('div');
    wrap.className = 'review-item';

    const status = document.createElement('span');
    status.className = 'review-status ' + (isCorrect ? 'ok' : 'no');
    status.textContent = isCorrect ? 'Correct' : 'Missed';
    wrap.appendChild(status);

    const qEl = document.createElement('div');
    qEl.className = 'review-q';
    qEl.textContent = item.q;
    wrap.appendChild(qEl);

    if(item.image) wrap.appendChild(imageBox(item.image, 'Illustration for this question'));

    item.shuffledOpts.forEach(opt=>{
      const wasGiven = given.includes(opt.orig);
      const isRight  = item.correct.includes(opt.orig);

      const row = document.createElement('div');
      row.className = 'review-opt' + (isRight ? ' correct' : wasGiven ? ' wrong' : '');

      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = isRight ? '✓' : wasGiven ? '✗' : '';

      const text = document.createElement('span');
      text.textContent = opt.text;
      if(wasGiven && !isRight){
        const em = document.createElement('em');
        em.textContent = ' (your answer)';
        text.appendChild(em);
      }

      row.append(mark, text);
      wrap.appendChild(row);
    });

    container.appendChild(wrap);
  });
}

document.querySelectorAll('.filter-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    renderReview(chip.dataset.filter);
  });
});

document.getElementById('retake-btn').addEventListener('click', ()=>{
  const secs = [...new Set(state.pool.map(q=>q.section))];
  startAttempt(secs, state.pool.length);
});

document.getElementById('new-setup-btn').addEventListener('click', ()=>{
  showScreen('start');
});

/* =========================================================
   BOOT
   ---------------------------------------------------------
   INLINE_QUESTIONS is defined only by the standalone build in
   tools/build_standalone.py, which has no server to fetch from.
   ========================================================= */
function bootError(message){
  startScreen.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('p');
  title.className = 'field-label';
  title.textContent = 'Could not load the question bank';
  const body = document.createElement('p');
  body.style.margin = '0';
  body.textContent = message;
  card.append(title, body);
  startScreen.appendChild(card);
}

async function loadQuestions(){
  if(typeof INLINE_QUESTIONS !== 'undefined') return INLINE_QUESTIONS;
  const res = await fetch(DATA_URL);
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

(async function init(){
  let data;
  try {
    data = await loadQuestions();
  } catch (err) {
    bootError(
      location.protocol === 'file:'
        ? 'Opening index.html straight from disk blocks the data file. Serve the folder instead — run "python -m http.server" here, then visit http://localhost:8000.'
        : `Request for ${DATA_URL} failed: ${err.message}`
    );
    return;
  }

  QUESTIONS = data.questions;
  SECTIONS  = [...new Set(QUESTIONS.map(q=>q.section))];

  document.querySelector('.tagline').textContent =
    `${QUESTIONS.length} questions on coffee, tea & café operations — shuffled fresh every time.`;

  buildSectionList();
  updateAvailablePool();
})();
