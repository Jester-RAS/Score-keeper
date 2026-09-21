'use strict';

/* Phase 10 score keeper.
   Rounds are the only stored truth -- every phase number, total and rank on the
   screen is replayed from them by tally(). That is what makes "fix hand 3" a
   one-line edit instead of an unpicking of running totals. */

/* ------------------------------------------------------------------ rules */

const PHASES = [
  '2 sets of 3',
  '1 set of 3 + 1 run of 4',
  '1 set of 4 + 1 run of 4',
  '1 run of 7',
  '1 run of 8',
  '1 run of 9',
  '2 sets of 4',
  '7 cards of one color',
  '1 set of 5 + 1 set of 2',
  '1 set of 5 + 1 set of 3',
];

// Points for the cards still in a hand when someone goes out.
const CARDS = [
  { id: 'low',  label: '1 – 9',   value: 5  },
  { id: 'high', label: '10 – 12', value: 10 },
  { id: 'skip', label: 'Skip',    value: 15 },
  { id: 'wild', label: 'Wild',    value: 25 },
];

// The deck's four colors first, then spares for a big table.
const HUES = [355, 210, 142, 45, 280, 25, 190, 320, 168, 250];

const MAX_PLAYERS = 10;

/* ---------------------------------------------------------------- storage */

const KEY = 'scorekeeper.phase10.v1';

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.games)) return raw;
  } catch (err) {
    console.warn('Saved games could not be read', err);
  }
  return { games: [], lastNames: [] };
}

function saveStore() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('Scores could not be saved', err);
    toast('This browser will not let the game save.');
  }
}

const store = loadStore();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function currentGame() {
  return store.games.find(g => g.id === state.gameId) || null;
}

function touch(game) {
  game.updated = Date.now();
  saveStore();
}

/* ------------------------------------------------------------ the numbers */

/* Replay every hand to get each player's phase, total and finished flag. */
function tally(game) {
  const map = new Map();
  game.players.forEach((p, i) => {
    map.set(p.id, { player: p, seat: i, score: 0, made: [], phase: 1, done: false });
  });

  for (const round of game.rounds) {
    for (const entry of round.entries) {
      const t = map.get(entry.playerId);
      if (!t) continue;                       // a player removed after the hand
      t.score += Number(entry.points) || 0;
      if (entry.made && !t.made.includes(entry.phase)) t.made.push(entry.phase);
    }
  }

  for (const t of map.values()) {
    t.made.sort((a, b) => a - b);
    t.done = t.made.length >= PHASES.length;
    t.phase = game.freePhases ? nextFreePhase(t.made)
                              : Math.min(t.made.length + 1, PHASES.length);
  }
  return map;
}

function nextFreePhase(made) {
  for (let n = 1; n <= PHASES.length; n++) if (!made.includes(n)) return n;
  return PHASES.length;
}

/* Standings order: furthest along first, then the lower score. */
function standings(game) {
  const rows = [...tally(game).values()];
  rows.sort((a, b) => (b.done - a.done) || (b.made.length - a.made.length)
                   || (a.score - b.score) || (a.seat - b.seat));
  return rows;
}

/* A winner needs a finished phase 10 AND, among everyone who finished in the
   same hand, the lowest score. Equal scores mean another hand. */
function outcome(game) {
  const finished = [...tally(game).values()].filter(t => t.done);
  if (!finished.length) return { over: false };
  const low = Math.min(...finished.map(t => t.score));
  const best = finished.filter(t => t.score === low);
  return best.length === 1 ? { over: true, winner: best[0] }
                           : { over: false, tie: best };
}

/* -------------------------------------------------------------- app state */

const state = { view: 'home', gameId: null, roundId: null, draft: null, setup: null };

const app = document.getElementById('app');
const backBtn = document.getElementById('back');
const sheetHost = document.getElementById('sheet-host');

function go(view, extra, replace) {
  state.view = view;
  state.roundId = null;
  Object.assign(state, extra || {});
  const snap = { view: state.view, gameId: state.gameId, roundId: state.roundId };
  try {
    history[replace ? 'replaceState' : 'pushState'](snap, '');
  } catch (err) { /* file:// with no history -- navigation still works */ }
  render();
}

window.addEventListener('popstate', ev => {
  if (ev.state && ev.state.view) {
    Object.assign(state, ev.state);
    state.draft = null;
    render();
  } else {
    state.view = 'home';
    render();
  }
});

/* --------------------------------------------------------------- plumbing */

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function dateLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                 : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* Some embedded contexts refuse modal dialogs. Losing a hand to a blocked
   confirm() is worse than asking one time too few. */
function ask(question) {
  try { return window.confirm(question); }
  catch (err) { return true; }
}

let toastTimer = null;
function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------------ views */

function render() {
  const views = { home, setup, game: gameView, round: roundView, results };
  const view = views[state.view] || home;
  app.innerHTML = view();
  backBtn.hidden = state.view === 'home';
  window.scrollTo(0, 0);
  const focusMe = app.querySelector('[data-autofocus]');
  if (focusMe) focusMe.focus();
}

/* --- home ---------------------------------------------------------------- */

function home() {
  const games = [...store.games].sort((a, b) => b.updated - a.updated);
  const cards = games.map(g => {
    const result = outcome(g);
    const names = g.players.map(p => p.name).join(', ');
    const note = result.over ? `Won by ${esc(result.winner.player.name)}`
               : g.rounds.length ? `${plural(g.rounds.length, 'hand', 'hands')} played`
               : 'Not started';
    return `
      <div class="row-card glass" data-act="resume" data-id="${g.id}" role="button" tabindex="0">
        <div class="row-main">
          <div class="row-title">${esc(names)}</div>
          <div class="row-sub">${note} &middot; ${dateLabel(g.updated)}</div>
        </div>
        ${result.over ? '<span class="trophy" aria-hidden="true">&#127942;</span>' : ''}
        <button class="icon-btn subtle" data-act="delete-game" data-id="${g.id}"
                aria-label="Delete this game">&#10005;</button>
      </div>`;
  }).join('');

  return `
    <section class="view">
      <h1 class="page-title">Phase&nbsp;10</h1>
      <p class="lede">Keep the phases and the points for the whole table. One tap a hand.</p>
      <button class="btn primary big" data-act="new-game">Start a new game</button>
      ${games.length ? `
        <h2 class="section-head">Carry on</h2>
        <div class="rows">${cards}</div>` : `
        <div class="empty glass">
          <p>No games yet. Add everyone's name and start dealing.</p>
        </div>`}
    </section>`;
}

/* --- setup --------------------------------------------------------------- */

function setup() {
  const s = state.setup;
  const rows = s.names.map((name, i) => `
    <div class="name-row">
      <span class="dot" style="--hue:${HUES[i % HUES.length]}"></span>
      <input class="name-input" type="text" value="${esc(name)}" data-i="${i}"
             maxlength="18" placeholder="Player ${i + 1}" autocomplete="off"
             ${i === s.names.length - 1 && s.focusLast ? 'data-autofocus' : ''} />
      <button class="icon-btn subtle" data-act="drop-name" data-i="${i}"
              aria-label="Remove player ${i + 1}" ${s.names.length <= 2 ? 'disabled' : ''}>&#10005;</button>
    </div>`).join('');

  return `
    <section class="view">
      <h1 class="page-title">Who is playing?</h1>
      <div class="card glass">
        <div class="names">${rows}</div>
        ${s.names.length < MAX_PLAYERS
          ? '<button class="btn ghost wide" data-act="add-name">+ Add player</button>' : ''}
      </div>

      <h2 class="section-head">House rules</h2>
      <div class="card glass">
        <label class="switch-row">
          <span>
            <b>Any phase, any order</b>
            <small>Off: everyone works 1 to 10 in order, the way the box says.
            On: each player picks which phase to try. Win by finishing all ten.</small>
          </span>
          <input type="checkbox" id="free-phases" ${s.freePhases ? 'checked' : ''} />
          <span class="switch" aria-hidden="true"></span>
        </label>
      </div>

      <button class="btn primary big" data-act="start-game">Deal the first hand</button>
    </section>`;
}

/* --- the game ------------------------------------------------------------ */

function gameView() {
  const game = currentGame();
  if (!game) return home();

  const result = outcome(game);
  const rows = standings(game);
  const dealer = game.players[game.rounds.length % game.players.length];

  const board = rows.map((t, i) => {
    const pips = PHASES.map((_, n) =>
      `<i class="${t.made.includes(n + 1) ? 'on' : ''}"></i>`).join('');
    return `
      <div class="stand-row glass" style="--hue:${t.player.hue}">
        <span class="rank">${i + 1}</span>
        <span class="avatar">${esc(initials(t.player.name))}</span>
        <div class="stand-main">
          <div class="stand-name">${esc(t.player.name)}</div>
          <div class="pips" title="${t.made.length} of 10 phases done">${pips}</div>
        </div>
        <div class="stand-right">
          <div class="score">${t.score}</div>
          <div class="phase-chip">${t.done ? 'All 10'
            : game.freePhases ? 'Next: ' + t.phase : 'Phase ' + t.phase}</div>
        </div>
      </div>`;
  }).join('');

  const banner = result.over ? `
      <div class="banner win" data-act="results" role="button" tabindex="0">
        <b>&#127942; ${esc(result.winner.player.name)} wins.</b>
        <span>Tap for the final card.</span>
      </div>`
    : result.tie ? `
      <div class="banner tie">
        <b>Dead heat on phase 10.</b>
        <span>${esc(result.tie.map(t => t.player.name).join(' and '))} both finished on
        ${result.tie[0].score}. Play one more hand between them.</span>
        <button class="btn small" data-act="tie-break">Tie-breaker hand</button>
      </div>` : '';

  const history = game.rounds.length ? game.rounds.map((r, i) => {
    const cells = r.entries.map(e => {
      const p = game.players.find(pl => pl.id === e.playerId);
      if (!p) return '';
      return `<span class="hcell ${e.made ? 'made' : ''}">
                ${esc(initials(p.name))} <b>${e.points}</b>
                ${e.made ? '<i class="tick">&#10003;</i>' : ''}
              </span>`;
    }).join('');
    const out = game.players.find(p => p.id === r.out);
    return `
      <div class="hand glass" data-act="edit-round" data-id="${r.id}" role="button" tabindex="0">
        <div class="hand-head">
          <b>Hand ${i + 1}${r.tieBreak ? ' &middot; tie-breaker' : ''}</b>
          <span>${out ? esc(out.name) + ' went out' : 'no one went out'}</span>
        </div>
        <div class="hand-cells">${cells}</div>
      </div>`;
  }).reverse().join('') : '<p class="muted pad">No hands scored yet.</p>';

  return `
    <section class="view">
      ${banner}
      <div class="game-head">
        <h1 class="page-title">Hand ${game.rounds.length + 1}</h1>
        <span class="deal">${esc(dealer.name)} deals</span>
      </div>

      <div class="board">${board}</div>

      ${result.over ? `
        <button class="btn ghost big" data-act="results">Final scores</button>`
      : `<button class="btn primary big" data-act="score-round">Score hand ${game.rounds.length + 1}</button>`}

      <div class="tool-row">
        <button class="btn ghost" data-act="phases">Phase list</button>
        <button class="btn ghost" data-act="edit-players">Players</button>
        ${game.rounds.length ? '<button class="btn ghost" data-act="undo-round">Undo last hand</button>' : ''}
      </div>

      <h2 class="section-head">Hands <small>tap one to fix it</small></h2>
      <div class="hands">${history}</div>
    </section>`;
}

/* --- scoring a hand ------------------------------------------------------ */

function newDraft(game, only) {
  const t = tally(game);
  const ids = (only && only.length) ? only : game.players.map(p => p.id);
  return {
    roundId: null,
    out: null,
    tieBreak: !!(only && only.length),
    entries: ids.map(id => ({
      playerId: id,
      phase: Math.min(t.get(id).phase, PHASES.length),
      made: false,
      points: '',
    })),
  };
}

function draftFromRound(game, round) {
  return {
    roundId: round.id,
    out: round.out,
    tieBreak: !!round.tieBreak,
    entries: round.entries.map(e => ({ ...e, points: String(e.points) })),
  };
}

function roundView() {
  const game = currentGame();
  if (!game) return home();
  if (!state.draft) state.draft = newDraft(game);
  const draft = state.draft;

  const editing = !!draft.roundId;
  const handNo = editing
    ? game.rounds.findIndex(r => r.id === draft.roundId) + 1
    : game.rounds.length + 1;
  const t = tally(game);

  const rows = draft.entries.map(entry => {
    const p = game.players.find(pl => pl.id === entry.playerId);
    if (!p) return '';
    const isOut = draft.out === entry.playerId;
    const phasePicker = game.freePhases
      ? `<select class="phase-select" data-id="${p.id}" aria-label="Phase ${esc(p.name)} tried">
           ${PHASES.map((text, i) => {
             const n = i + 1;
             const done = t.get(p.id).made.includes(n) && n !== entry.phase;
             return `<option value="${n}" ${n === entry.phase ? 'selected' : ''}
                      ${done ? 'disabled' : ''}>Phase ${n} &middot; ${esc(text)}</option>`;
           }).join('')}
         </select>`
      : `<span class="phase-chip">Phase ${entry.phase}</span>`;

    return `
      <div class="entry glass ${isOut ? 'is-out' : ''}" style="--hue:${p.hue}">
        <div class="entry-head">
          <span class="avatar">${esc(initials(p.name))}</span>
          <div class="entry-who">
            <b>${esc(p.name)}</b>
            <small>${esc(PHASES[entry.phase - 1])}</small>
          </div>
          ${phasePicker}
        </div>

        <div class="entry-controls">
          <div class="segmented" role="group" aria-label="Did ${esc(p.name)} make the phase?">
            <button class="seg ${entry.made ? 'on' : ''}" data-act="set-made"
                    data-id="${p.id}" data-made="1" type="button">Made it</button>
            <button class="seg ${entry.made ? '' : 'on'}" data-act="set-made"
                    data-id="${p.id}" data-made="0" type="button">Missed</button>
          </div>
          <button class="btn out-btn ${isOut ? 'on' : ''}" data-act="set-out" data-id="${p.id}"
                  type="button">${isOut ? '&#127937; Went out' : 'Went out'}</button>
        </div>

        <div class="points-row">
          <label for="pts-${p.id}">Cards left</label>
          <input id="pts-${p.id}" class="points" type="number" inputmode="numeric"
                 min="0" step="5" value="${isOut ? 0 : esc(entry.points)}"
                 data-id="${p.id}" placeholder="0" ${isOut ? 'disabled' : ''} />
          <button class="btn ghost small" data-act="calc" data-id="${p.id}"
                  type="button" ${isOut ? 'disabled' : ''}>Count cards</button>
        </div>
      </div>`;
  }).join('');

  return `
    <section class="view">
      <h1 class="page-title">Hand ${handNo}${draft.tieBreak ? ' &middot; tie-breaker' : ''}</h1>
      <p class="lede">Mark who finished their phase, then the points still in everyone else's hand.</p>
      <div class="entries">${rows}</div>
      <button class="btn primary big" data-act="save-round">
        ${editing ? 'Save changes' : 'Save hand ' + handNo}</button>
      ${editing ? `<button class="btn danger wide" data-act="delete-round">Delete this hand</button>` : ''}
      <button class="btn ghost wide" data-act="cancel-round">Cancel</button>
    </section>`;
}

/* Read what has been typed before any re-render throws the DOM away. */
function syncDraft() {
  const draft = state.draft;
  if (!draft || state.view !== 'round') return;
  for (const entry of draft.entries) {
    const input = app.querySelector(`.points[data-id="${entry.playerId}"]`);
    if (input && !input.disabled) entry.points = input.value;
    const pick = app.querySelector(`.phase-select[data-id="${entry.playerId}"]`);
    if (pick) entry.phase = Number(pick.value);
  }
}

function saveRound() {
  syncDraft();
  const game = currentGame();
  const draft = state.draft;

  for (const entry of draft.entries) {
    const points = entry.playerId === draft.out ? 0 : parseInt(entry.points, 10) || 0;
    if (points < 0) { toast('Points cannot be below zero.'); return; }
    entry.clean = { playerId: entry.playerId, phase: Number(entry.phase),
                    made: entry.playerId === draft.out ? true : !!entry.made, points };
  }

  if (!draft.out && !draft.noOutConfirmed) {
    draft.noOutConfirmed = true;
    toast('No one marked as going out. Tap save again to keep it that way.');
    return;
  }

  const round = {
    id: draft.roundId || uid(),
    at: Date.now(),
    out: draft.out,
    tieBreak: draft.tieBreak,
    entries: draft.entries.map(e => e.clean),
  };

  if (draft.roundId) {
    const i = game.rounds.findIndex(r => r.id === draft.roundId);
    game.rounds[i] = round;
  } else {
    game.rounds.push(round);
  }
  touch(game);
  state.draft = null;

  const result = outcome(game);
  go(result.over ? 'results' : 'game');
}

/* --- results ------------------------------------------------------------- */

function results() {
  const game = currentGame();
  if (!game) return home();
  const rows = standings(game);
  const result = outcome(game);

  const list = rows.map((t, i) => `
    <div class="final glass ${i === 0 && result.over ? 'first' : ''}" style="--hue:${t.player.hue}">
      <span class="rank">${i + 1}</span>
      <span class="avatar">${esc(initials(t.player.name))}</span>
      <div class="stand-main">
        <div class="stand-name">${esc(t.player.name)}</div>
        <div class="row-sub">${t.done ? 'All ten phases' : 'Reached phase ' + t.phase}</div>
      </div>
      <div class="score big">${t.score}</div>
    </div>`).join('');

  return `
    <section class="view">
      <h1 class="page-title">${result.over ? esc(result.winner.player.name) + ' wins' : 'Where it stands'}</h1>
      <p class="lede">${plural(game.rounds.length, 'hand', 'hands')} played &middot;
        lowest score with all ten phases takes it.</p>
      <div class="rows">${list}</div>
      <button class="btn primary big" data-act="rematch">Rematch, same players</button>
      <div class="tool-row">
        <button class="btn ghost" data-act="copy-summary">Copy the scores</button>
        <button class="btn ghost" data-act="back-to-game">Back to the game</button>
        <button class="btn ghost" data-act="home">All games</button>
      </div>
    </section>`;
}

/* ----------------------------------------------------------------- sheets */

function openSheet(title, body) {
  sheetHost.hidden = false;
  sheetHost.innerHTML = `
    <div class="backdrop" data-act="close-sheet"></div>
    <div class="sheet glass" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">
        <b>${esc(title)}</b>
        <button class="icon-btn subtle" data-act="close-sheet" aria-label="Close">&#10005;</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
}

function closeSheet() {
  sheetHost.hidden = true;
  sheetHost.innerHTML = '';
  calc = null;
}

function phasesSheet() {
  const game = currentGame();
  const t = game ? tally(game) : null;
  const here = new Map();
  if (t) for (const row of t.values()) {
    if (row.done) continue;
    if (!here.has(row.phase)) here.set(row.phase, []);
    here.get(row.phase).push(row.player);
  }
  const list = PHASES.map((text, i) => {
    const n = i + 1;
    const on = here.get(n) || [];
    return `
      <div class="phase-line ${on.length ? 'active' : ''}">
        <span class="pnum">${n}</span>
        <span class="ptext">${esc(text)}</span>
        <span class="pwho">${on.map(p =>
          `<span class="avatar tiny" style="--hue:${p.hue}">${esc(initials(p.name))}</span>`).join('')}</span>
      </div>`;
  }).join('');

  openSheet('The ten phases', `
    <div class="phase-list">${list}</div>
    <div class="legend">
      <b>Cards left in hand</b>
      ${CARDS.map(c => `<span><i>${esc(c.label)}</i> ${c.value} pts</span>`).join('')}
    </div>
    <p class="muted small">A set is cards of the same number; a run is numbers in order.
    A run may be any colors, except phase 8, which is all one color.</p>`);
}

let calc = null;   // { playerId, counts } while the counter sheet is open

function calcSheet(playerId) {
  calc = { playerId, counts: { low: 0, high: 0, skip: 0, wild: 0 } };
  openSheet('Count the cards left', `
    <div class="calc">
      ${CARDS.map(c => `
        <div class="calc-row">
          <span class="calc-label">${esc(c.label)}<small>${c.value} each</small></span>
          <button class="icon-btn round" data-calc="-" data-card="${c.id}" aria-label="One fewer ${esc(c.label)}">&minus;</button>
          <b class="calc-count" data-count="${c.id}">0</b>
          <button class="icon-btn round" data-calc="+" data-card="${c.id}" aria-label="One more ${esc(c.label)}">+</button>
        </div>`).join('')}
      <div class="calc-total">Total <b id="calc-total">0</b></div>
      <button class="btn primary wide" data-act="use-total" data-id="${esc(playerId)}">Use this total</button>
    </div>`);
}

function calcTotal() {
  return calc ? CARDS.reduce((sum, c) => sum + calc.counts[c.id] * c.value, 0) : 0;
}

function bumpCard(cardId, delta) {
  if (!calc) return;
  calc.counts[cardId] = Math.max(0, calc.counts[cardId] + delta);
  sheetHost.querySelector(`[data-count="${cardId}"]`).textContent = calc.counts[cardId];
  sheetHost.querySelector('#calc-total').textContent = calcTotal();
}

function playersSheet() {
  const game = currentGame();
  const rows = game.players.map((p, i) => `
    <div class="name-row">
      <span class="dot" style="--hue:${p.hue}"></span>
      <input class="name-input" type="text" value="${esc(p.name)}" data-pid="${p.id}"
             maxlength="18" autocomplete="off" />
      <button class="icon-btn subtle" data-act="drop-player" data-id="${p.id}"
              aria-label="Remove ${esc(p.name)}" ${game.players.length <= 2 ? 'disabled' : ''}>&#10005;</button>
    </div>`).join('');

  openSheet('Players', `
    <div class="names">${rows}</div>
    ${game.players.length < MAX_PLAYERS
      ? '<button class="btn ghost wide" data-act="add-player">+ Add a player</button>' : ''}
    <button class="btn primary wide" data-act="save-players">Save</button>
    <p class="muted small">A player added now starts on phase 1 with nothing scored.
    Removing one takes their points out of every hand.</p>`);
}

/* ---------------------------------------------------------------- actions */

function startGame() {
  const names = [...app.querySelectorAll('.name-input')]
    .map(input => input.value.trim()).filter(Boolean);
  if (names.length < 2) { toast('Two players at least.'); return; }

  const game = {
    id: uid(),
    created: Date.now(),
    updated: Date.now(),
    freePhases: !!app.querySelector('#free-phases').checked,
    players: names.map((name, i) => ({ id: uid(), name, hue: HUES[i % HUES.length] })),
    rounds: [],
  };
  store.games.push(game);
  store.lastNames = names;
  saveStore();
  state.setup = null;
  go('game', { gameId: game.id });
}

function copySummary() {
  const game = currentGame();
  const rows = standings(game);
  const lines = [`Phase 10 — ${new Date(game.updated).toLocaleDateString()}`];
  rows.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.player.name} — ${t.done ? 'all ten phases' : 'phase ' + t.phase} — ${t.score}`);
  });
  lines.push(`${plural(game.rounds.length, 'hand', 'hands')} played.`);
  const text = lines.join('\n');

  const done = () => toast('Scores copied.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); done(); }
  catch (err) { toast('Copying is blocked here.'); }
  document.body.removeChild(area);
}

/* --------------------------------------------------------------- wiring   */

document.addEventListener('click', ev => {
  const step = ev.target.closest('[data-calc]');
  if (step) { bumpCard(step.dataset.card, step.dataset.calc === '+' ? 1 : -1); return; }

  const hit = ev.target.closest('[data-act]');
  if (!hit) return;
  const act = hit.dataset.act;
  const id = hit.dataset.id;
  const game = currentGame();

  switch (act) {
    case 'new-game':
      state.setup = { names: (store.lastNames || []).slice(0, MAX_PLAYERS), freePhases: false };
      if (state.setup.names.length < 2) state.setup.names = ['', ''];
      go('setup');
      break;

    case 'add-name': {
      state.setup.names = [...app.querySelectorAll('.name-input')].map(i => i.value);
      state.setup.names.push('');
      state.setup.focusLast = true;
      render();
      break;
    }

    case 'drop-name': {
      const names = [...app.querySelectorAll('.name-input')].map(i => i.value);
      names.splice(Number(hit.dataset.i), 1);
      state.setup.names = names;
      state.setup.focusLast = false;
      render();
      break;
    }

    case 'start-game': startGame(); break;

    case 'resume': {
      if (ev.target.closest('[data-act="delete-game"]')) break;
      const picked = store.games.find(g => g.id === id);
      // A finished game opens on its result, not on a hand nobody is going to play.
      go(picked && outcome(picked).over ? 'results' : 'game', { gameId: id });
      break;
    }

    case 'delete-game': {
      ev.stopPropagation();
      const doomed = store.games.find(g => g.id === id);
      if (!doomed) break;
      if (!ask(`Delete the game with ${doomed.players.map(p => p.name).join(', ')}?`)) break;
      store.games = store.games.filter(g => g.id !== id);
      saveStore();
      render();
      break;
    }

    case 'score-round':
      state.draft = newDraft(game);
      go('round');
      break;

    case 'tie-break': {
      const tie = outcome(game).tie || [];
      state.draft = newDraft(game, tie.map(t => t.player.id));
      go('round');
      break;
    }

    case 'edit-round': {
      const round = game.rounds.find(r => r.id === id);
      if (!round) break;
      state.draft = draftFromRound(game, round);
      go('round');
      break;
    }

    case 'set-made': {
      syncDraft();
      const entry = state.draft.entries.find(e => e.playerId === id);
      entry.made = hit.dataset.made === '1';
      if (!entry.made && state.draft.out === id) state.draft.out = null;
      render();
      break;
    }

    case 'set-out': {
      syncDraft();
      state.draft.out = state.draft.out === id ? null : id;
      if (state.draft.out) {
        const entry = state.draft.entries.find(e => e.playerId === id);
        entry.made = true;
        entry.points = '0';
      }
      render();
      break;
    }

    case 'calc':
      syncDraft();
      calcSheet(id);
      break;

    case 'use-total': {
      const total = String(calcTotal());
      const input = app.querySelector(`.points[data-id="${id}"]`);
      if (input) input.value = total;
      const entry = state.draft && state.draft.entries.find(e => e.playerId === id);
      if (entry) entry.points = total;
      closeSheet();
      break;
    }

    case 'save-round': saveRound(); break;

    case 'cancel-round':
      state.draft = null;
      go('game');
      break;

    case 'delete-round': {
      if (!ask('Delete this hand? Every total after it is worked out again.')) break;
      game.rounds = game.rounds.filter(r => r.id !== state.draft.roundId);
      touch(game);
      state.draft = null;
      go('game');
      break;
    }

    case 'undo-round': {
      if (!game.rounds.length) break;
      if (!ask('Undo the last hand?')) break;
      game.rounds.pop();
      touch(game);
      render();
      break;
    }

    case 'phases': phasesSheet(); break;
    case 'edit-players': playersSheet(); break;

    case 'add-player': {
      const typed = [...sheetHost.querySelectorAll('.name-input')];
      typed.forEach(input => {
        const p = game.players.find(pl => pl.id === input.dataset.pid);
        if (p) p.name = input.value.trim() || p.name;
      });
      game.players.push({
        id: uid(),
        name: 'Player ' + (game.players.length + 1),
        hue: HUES[game.players.length % HUES.length],
      });
      touch(game);
      playersSheet();
      break;
    }

    case 'drop-player': {
      if (game.players.length <= 2) break;
      const gone = game.players.find(p => p.id === id);
      if (!ask(`Take ${gone.name} out of this game?`)) break;
      game.players = game.players.filter(p => p.id !== id);
      game.rounds.forEach(r => {
        r.entries = r.entries.filter(e => e.playerId !== id);
        if (r.out === id) r.out = null;
      });
      touch(game);
      playersSheet();
      render();
      break;
    }

    case 'save-players': {
      [...sheetHost.querySelectorAll('.name-input')].forEach(input => {
        const p = game.players.find(pl => pl.id === input.dataset.pid);
        const name = input.value.trim();
        if (p && name) p.name = name;
      });
      touch(game);
      closeSheet();
      render();
      break;
    }

    case 'results': go('results'); break;
    case 'back-to-game': go('game'); break;
    case 'home': go('home'); break;
    case 'copy-summary': copySummary(); break;

    case 'rematch': {
      const names = game.players.map(p => p.name);
      const fresh = {
        id: uid(),
        created: Date.now(),
        updated: Date.now(),
        freePhases: game.freePhases,
        players: names.map((name, i) => ({ id: uid(), name, hue: HUES[i % HUES.length] })),
        rounds: [],
      };
      store.games.push(fresh);
      store.lastNames = names;
      saveStore();
      go('game', { gameId: fresh.id });
      break;
    }

    case 'close-sheet': closeSheet(); break;
  }
});

/* Keyboard and pointer odds and ends. */
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && !sheetHost.hidden) closeSheet();
  if (ev.key === 'Enter' && ev.target.classList.contains('name-input')) {
    ev.preventDefault();
    const scope = ev.target.closest('.sheet') || app;
    const btn = scope.querySelector('[data-act="save-players"], [data-act="add-name"]');
    if (btn) btn.click();
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role="button"][data-act]')) {
    ev.preventDefault();
    ev.target.click();
  }
});

backBtn.addEventListener('click', () => {
  if (state.view === 'round') { state.draft = null; go('game'); }
  else if (state.view === 'results') go('game');
  else go('home');
});

document.getElementById('phases-btn').addEventListener('click', phasesSheet);

go(state.view, {}, true);
