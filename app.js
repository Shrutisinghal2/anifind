// AniFind - anime discovery app using the free AniList GraphQL API.
// No videos are hosted here; "Where to watch" only links to official services.

const API = 'https://graphql.anilist.co';
const LIST_KEY = 'anifind.watchlist';

const LIST_FIELDS = `id title { romaji english native } coverImage { extraLarge large } averageScore format episodes seasonYear`;
const PAGE_QUERY = `query ($page: Int, $search: String, $sort: [MediaSort], $season: MediaSeason, $year: Int, $status: MediaStatus, $genres: [String]) {
  Page(page: $page, perPage: 24) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, season: $season, seasonYear: $year, status: $status, genre_in: $genres) { ${LIST_FIELDS} }
  }
}`;
const DETAIL_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${LIST_FIELDS} description(asHtml: false) genres status popularity
    startDate { year month day } endDate { year month day }
    studios(isMain: true) { nodes { name } } trailer { id site } siteUrl
    externalLinks { site url type }
  }
}`;

function currentSeason() {
  const d = new Date(), m = d.getMonth() + 1;
  if (m === 12) return { season: 'WINTER', year: d.getFullYear() + 1 };
  return { season: m <= 2 ? 'WINTER' : m <= 5 ? 'SPRING' : m <= 8 ? 'SUMMER' : 'FALL', year: d.getFullYear() };
}
const VIEWS = {
  airing: { title: 'Trending now', vars: () => ({ sort: ['TRENDING_DESC', 'POPULARITY_DESC'] }) },
  season: { title: 'Airing this season', vars: () => ({ ...currentSeason(), sort: ['POPULARITY_DESC'] }) },
  top:    { title: 'Top rated of all time', vars: () => ({ sort: ['SCORE_DESC'] }) },
  search: { title: q => `Results for "${q}"`, vars: q => ({ search: q, sort: ['SEARCH_MATCH'] }) },
};
const STATUS_LABEL = { watching: 'Watching', plan: 'Plan to watch', completed: 'Completed' };

const $ = sel => document.querySelector(sel);
const grid = $('#grid'), message = $('#message'), loadMoreBtn = $('#loadMore');

const state = { view: 'airing', query: '', page: 1, hasNext: false, loading: false, listStatus: 'all', genres: [] };

/* ---------- Genre filter ---------- */
const FALLBACK_GENRES = ['Action','Adventure','Comedy','Drama','Ecchi','Fantasy','Horror','Mahou Shoujo','Mecha','Music',
  'Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'];
async function loadGenres() {
  let genres = FALLBACK_GENRES;
  try {
    const data = await api('query { GenreCollection }', {});
    if (data.GenreCollection?.length) genres = data.GenreCollection.filter(g => g !== 'Hentai');
  } catch { /* keep the fallback list */ }
  const box = $('#genres');
  box.innerHTML = '';
  genres.forEach(g => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = g; b.dataset.genre = g;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => toggleGenre(g));
    box.appendChild(b);
  });
}
function toggleGenre(g) {
  state.genres = state.genres.includes(g) ? state.genres.filter(x => x !== g) : [...state.genres, g];
  updateGenreUI();
  loadPage(true);
}
function clearGenres() { state.genres = []; updateGenreUI(); loadPage(true); }
function updateGenreUI() {
  document.querySelectorAll('#genres button').forEach(b => {
    const on = state.genres.includes(b.dataset.genre);
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
  });
  $('#clearGenres').hidden = !state.genres.length;
  $('#genreSummary').textContent = state.genres.length ? `Genres: ${state.genres.join(' + ')}` : '';
}

/* ---------- Turn AniList data into the shape the cards use ---------- */
function normalize(m) {
  return {
    mal_id: m.id,
    title: m.title?.romaji || m.title?.english || 'Untitled',
    title_english: m.title?.english || null,
    image: m.coverImage?.extraLarge || m.coverImage?.large || '',
    score: m.averageScore ? m.averageScore / 10 : null,    // AniList scores are out of 100
    type: m.format ? m.format.replace('_', ' ') : null,
    episodes: m.episodes,
    year: m.seasonYear,
  };
}

/* ---------- Watchlist (saved in this browser) ---------- */
function getList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || {}; } catch { return {}; }
}
function saveList(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  $('#listCount').textContent = Object.keys(list).length;
}
function setStatus(anime, status) {
  const list = getList();
  if (status) list[anime.mal_id] = { ...pick(anime), status, added: list[anime.mal_id]?.added || Date.now() };
  else delete list[anime.mal_id];
  saveList(list);
}
function pick(a) {
  return { mal_id: a.mal_id, title: a.title, title_english: a.title_english, image: a.image,
           score: a.score, type: a.type, episodes: a.episodes, year: a.year };
}
const img = a => a.image || '';

/* ---------- API call with rate-limit handling ---------- */
async function api(query, variables, tries = 3) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && tries > 1) {           // too many requests: wait and retry
    await new Promise(r => setTimeout(r, 2000));
    return api(query, variables, tries - 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || `Server returned ${res.status}`);
  return json.data;
}

/* ---------- Rendering ---------- */
function card(a) {
  const saved = getList()[a.mal_id];
  const el = document.createElement('article');
  el.className = 'card';
  const year = a.year;
  el.innerHTML = `
    <button class="poster" aria-label="Open details">
      <img loading="lazy" alt="">
      ${a.score ? `<span class="score">★ ${a.score.toFixed(1)}</span>` : ''}
    </button>
    <div class="info">
      <h3></h3>
      <span class="meta">${[a.type, a.episodes ? `${a.episodes} eps` : null, year].filter(Boolean).join(' · ')}</span>
      <button class="add ${saved ? 'saved' : ''}">${saved ? '✓ ' + STATUS_LABEL[saved.status] : '+ Add to list'}</button>
    </div>`;
  el.querySelector('img').src = img(a);
  el.querySelector('img').alt = `${a.title_english || a.title} poster`;
  el.querySelector('h3').textContent = a.title_english || a.title;
  el.querySelector('.poster').addEventListener('click', () => openDetail(a.mal_id));
  el.querySelector('.add').addEventListener('click', e => {
    const isSaved = !!getList()[a.mal_id];
    setStatus(a, isSaved ? null : 'plan');
    const btn = e.currentTarget;
    btn.classList.toggle('saved', !isSaved);
    btn.textContent = isSaved ? '+ Add to list' : '✓ Plan to watch';
    if (state.view === 'list') renderList();
  });
  return el;
}

function showSkeletons(n = 12) {
  for (let i = 0; i < n; i++) { const s = document.createElement('div'); s.className = 'skeleton'; grid.appendChild(s); }
}
function clearSkeletons() { grid.querySelectorAll('.skeleton').forEach(s => s.remove()); }
function showMessage(text) { message.textContent = text; message.hidden = !text; }

async function loadPage(reset) {
  if (state.loading) return;
  state.loading = true;
  if (reset) { grid.innerHTML = ''; state.page = 1; }
  showMessage(''); loadMoreBtn.hidden = true; showSkeletons();
  try {
    const v = VIEWS[state.view];
    const data = await api(PAGE_QUERY, { page: state.page, ...v.vars(state.query), genres: state.genres.length ? state.genres : null });
    const items = (data.Page?.media || []).map(normalize);
    clearSkeletons();
    // the API sometimes repeats an entry across pages; skip ones already shown
    const shown = new Set([...grid.querySelectorAll('[data-id]')].map(e => e.dataset.id));
    items.forEach(a => {
      if (shown.has(String(a.mal_id))) return;
      const c = card(a); c.dataset.id = a.mal_id; grid.appendChild(c);
    });
    if (!grid.children.length) showMessage(state.genres.length ? 'No anime match all the selected genres here. Try removing one.'
      : state.view === 'search' ? 'No anime found. Try another name.' : 'Nothing to show right now.');
    state.hasNext = !!data.Page?.pageInfo?.hasNextPage;
    loadMoreBtn.hidden = !state.hasNext;
    state.page++;
  } catch (err) {
    clearSkeletons();
    showMessage(`Couldn't load anime (${err.message}). Check your internet connection and try again.`);
  } finally { state.loading = false; }
}

function renderList() {
  grid.innerHTML = ''; loadMoreBtn.hidden = true;
  const items = Object.values(getList())
    .filter(a => state.listStatus === 'all' || a.status === state.listStatus)
    .sort((a, b) => b.added - a.added);
  if (!items.length) {
    showMessage(state.listStatus === 'all'
      ? 'Your list is empty. Tap "+ Add to list" on any anime to save it here.'
      : `Nothing marked "${STATUS_LABEL[state.listStatus]}" yet.`);
    return;
  }
  showMessage('');
  items.forEach(a => grid.appendChild(card({ ...a, title: a.title })));
}

function switchView(view, query = '') {
  state.view = view; state.query = query;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const t = VIEWS[view]?.title;
  $('#viewTitle').textContent = view === 'list' ? 'My list' : (typeof t === 'function' ? t(query) : t);
  $('#listFilter').hidden = view !== 'list';
  $('#genreBar').hidden = view === 'list';
  if (view === 'list') renderList(); else loadPage(true);
}

/* ---------- Detail view ---------- */
const detail = $('#detail'), detailBody = $('#detailBody');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function openDetail(id) {
  detailBody.innerHTML = '<p class="message">Loading…</p>';
  detail.showModal();
  try {
    const { Media: m } = await api(DETAIL_QUERY, { id });
    const a = normalize(m);
    const title = a.title_english || a.title;
    const saved = getList()[a.mal_id];
    const fmtDate = d => d?.year ? new Date(d.year, (d.month || 1) - 1, d.day || 1).toLocaleDateString('en-IN', { day: d.day ? 'numeric' : undefined, month: 'short', year: 'numeric' }) : null;
    const aired = [fmtDate(m.startDate), fmtDate(m.endDate)].filter(Boolean).join(' to ') || '—';
    const statusText = { FINISHED: 'Finished', RELEASING: 'Airing now', NOT_YET_RELEASED: 'Not yet aired', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' }[m.status] || m.status;
    const facts = [
      ['Score', a.score ? `★ ${a.score.toFixed(1)} / 10` : '—'],
      ['Episodes', a.episodes ?? 'Ongoing'],
      ['Status', statusText],
      ['Aired', aired],
      ['Studio', m.studios?.nodes?.map(s => s.name).join(', ') || '—'],
      ['Fans', (m.popularity || 0).toLocaleString('en-IN')],
    ];
    const synopsis = (m.description || 'No synopsis available.').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const trailer = m.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${m.trailer.id}` : null;
    const official = (m.externalLinks || []).filter(l => l.type === 'STREAMING')
      .map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.site)}</a>`).join('');
    const ytSearch = ch => `https://www.youtube.com/@${ch}/search?query=${encodeURIComponent(title)}`;
    detailBody.innerHTML = `
      <div class="d-wrap">
        <img src="${esc(img(a))}" alt="${esc(title)} poster">
        <div class="d-main">
          <h2>${esc(title)}</h2>
          <p class="alt">${esc([a.title_english ? a.title : null, m.title?.native].filter(Boolean).join(' · '))}</p>
          <div class="chips">${(m.genres || []).map(g => `<span class="chip">${esc(g)}</span>`).join('')}</div>
          <div class="facts">${facts.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>
          <div class="d-actions">
            <select id="statusSelect" aria-label="List status">
              <option value="">Not in my list</option>
              ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${saved?.status === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            ${trailer ? `<a class="chip" href="${esc(trailer)}" target="_blank" rel="noopener">▶ Watch trailer</a>` : ''}
            <a class="chip" href="${esc(m.siteUrl)}" target="_blank" rel="noopener">AniList page</a>
          </div>
          <h4>Synopsis</h4>
          <p class="synopsis">${esc(synopsis)}</p>
          <h4>Where to watch (official)</h4>
          <div class="watch">
            ${official || ''}
            <a href="${ytSearch('MuseIndia')}" target="_blank" rel="noopener">Search Muse India (YouTube, free)</a>
            <a href="${ytSearch('AniOneAsia')}" target="_blank" rel="noopener">Search Ani-One Asia (YouTube, free)</a>
          </div>
          <p class="note">${official ? 'Listed services are licensed streamers for this title.' : 'No official streaming list for this title yet.'} Availability depends on your country.</p>
        </div>
      </div>`;
    $('#statusSelect').addEventListener('change', e => {
      setStatus(a, e.target.value || null);
      if (state.view === 'list') renderList();
      else grid.querySelectorAll(`[data-id="${a.mal_id}"] .add`).forEach(btn => {
        const v = e.target.value; btn.classList.toggle('saved', !!v);
        btn.textContent = v ? '✓ ' + STATUS_LABEL[v] : '+ Add to list';
      });
    });
  } catch (err) {
    detailBody.innerHTML = `<p class="message">Couldn't load details (${esc(err.message)}). Please try again.</p>`;
  }
}

/* ---------- Events ---------- */
$('#closeDetail').addEventListener('click', () => detail.close());
detail.addEventListener('click', e => { if (e.target === detail) detail.close(); });
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.querySelectorAll('#listFilter button').forEach(b => b.addEventListener('click', () => {
  state.listStatus = b.dataset.status;
  document.querySelectorAll('#listFilter button').forEach(x => x.classList.toggle('active', x === b));
  renderList();
}));
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  if (q) switchView('search', q);
});
$('#brand').addEventListener('click', e => { e.preventDefault(); $('#searchInput').value = ''; switchView('airing'); });
loadMoreBtn.addEventListener('click', () => loadPage(false));

saveList(getList());   // show the saved count
$('#clearGenres').addEventListener('click', clearGenres);
loadGenres();
switchView('airing');
