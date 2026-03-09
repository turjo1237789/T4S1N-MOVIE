const TMDB_API_KEY = '6c32d16d18a24338afda970dd4fd37e0'; // Configured TMDB API key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const fallbackMovies = [
  { id: 1, title: 'Interstellar', release_date: '2014-11-05', vote_average: 8.7, poster_path: null, genre_names: ['Sci-Fi'], overview: 'A team travels through a wormhole to save humanity.' },
  { id: 2, title: 'Inception', release_date: '2010-07-16', vote_average: 8.8, poster_path: null, genre_names: ['Thriller'], overview: 'A thief enters dreams to plant an idea into a target mind.' },
  { id: 3, title: 'Parasite', release_date: '2019-05-30', vote_average: 8.5, poster_path: null, genre_names: ['Drama'], overview: 'A dark social satire about class conflict and survival.' }
];

const movieGrid = document.getElementById('movieGrid');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const genreFilters = document.getElementById('genreFilters');
const statusText = document.getElementById('statusText');
const apiHint = document.getElementById('apiHint');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const playerModal = document.getElementById('playerModal');
const playerFrame = document.getElementById('playerFrame');
const playerTitle = document.getElementById('playerTitle');
const playerMeta = document.getElementById('playerMeta');
const playerStatus = document.getElementById('playerStatus');
const closePlayerBtn = document.getElementById('closePlayerBtn');

let genres = [];
let activeGenre = 0;
let query = '';
let currentPage = 1;
let totalPages = 1;
let useFallback = false;

function getPoster(movie) {
  return movie.poster_path
    ? `${TMDB_IMG}${movie.poster_path}`
    : 'https://via.placeholder.com/500x750/11172c/b7c9ee?text=No+Poster';
}

function getYear(movie) {
  return movie.release_date ? movie.release_date.slice(0, 4) : 'N/A';
}

function getTrailerEmbedUrl(videoKey) {
  return `https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0`;
}

async function openMoviePlayer(movie) {
  playerModal.classList.add('show');
  playerModal.setAttribute('aria-hidden', 'false');
  playerTitle.textContent = movie.title || 'Now Playing';
  playerMeta.textContent = `${getYear(movie)} · ⭐ ${(movie.vote_average || 0).toFixed(1)}`;
  playerStatus.textContent = 'Loading trailer...';
  playerFrame.src = '';

  if (!movie?.id || useFallback) {
    playerStatus.textContent = 'Demo mode: trailer unavailable for fallback movie.';
    return;
  }

  try {
    const videos = await fetchTmdb(`/movie/${movie.id}/videos`, { language: 'en-US' });
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      || (videos.results || []).find(v => v.site === 'YouTube');

    if (!trailer?.key) {
      playerStatus.textContent = 'Trailer not available for this movie.';
      return;
    }

    playerFrame.src = getTrailerEmbedUrl(trailer.key);
    playerStatus.textContent = '';
  } catch (error) {
    playerStatus.textContent = 'Could not load trailer right now. Please try another movie.';
  }
}

function closeMoviePlayer() {
  playerModal.classList.remove('show');
  playerModal.setAttribute('aria-hidden', 'true');
  playerFrame.src = '';
}

function renderMovies(list, append = false) {
  if (!append) movieGrid.innerHTML = '';

  if (!list.length && !append) {
    movieGrid.innerHTML = '<p>No movies found.</p>';
    return;
  }

  movieGrid.__lastRenderedMovies = append ? [ ...(movieGrid.__lastRenderedMovies || []), ...list ] : [ ...list ];
  movieGrid.insertAdjacentHTML('beforeend', list.map(movie => `
    <article class="movie-card" data-movie-id="${movie.id || ''}" role="button" tabindex="0" aria-label="Play ${movie.title}">
      <img class="poster" src="${getPoster(movie)}" alt="${movie.title} poster" loading="lazy" />
      <div class="card-body">
        <h3>${movie.title}</h3>
        <p class="meta">${(movie.genre_names || []).join(', ') || 'Movie'} · ${getYear(movie)} · ⭐ ${(movie.vote_average || 0).toFixed(1)}</p>
        <p class="overview">${movie.overview || 'No description available.'}</p>
        <button class="details-link" data-play-movie="${movie.id || ''}" type="button">▶ Play on this site</button>
      </div>
    </article>
  `).join(''));
}

function renderGenres(items) {
  const all = [{ id: 0, name: 'All' }, ...items];
  genreFilters.innerHTML = all.map(genre => `
    <button class="chip ${genre.id === activeGenre ? 'active' : ''}" data-genre-id="${genre.id}">${genre.name}</button>
  `).join('');
}

async function fetchTmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && `${v}`.length) url.searchParams.set(k, v);
  });

  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB request failed');
  return res.json();
}

function mapGenres(movies) {
  const dict = Object.fromEntries(genres.map(g => [g.id, g.name]));
  return movies.map(m => ({
    ...m,
    genre_names: (m.genre_ids || []).map(id => dict[id]).filter(Boolean)
  }));
}

async function loadGenres() {
  if (!TMDB_API_KEY) return;
  const data = await fetchTmdb('/genre/movie/list', { language: 'en-US' });
  genres = data.genres || [];
  renderGenres(genres);
}

async function loadMovies(append = false) {
  if (useFallback || !TMDB_API_KEY) {
    statusText.textContent = 'Demo data চলছে. Full world catalog দেখতে TMDB API key add করুন (script.js).';
    apiHint.textContent = 'TMDB API key দিলে হাজার হাজার movie browse করা যাবে.';
    loadMoreBtn.style.display = 'none';
    renderMovies(fallbackMovies);
    return;
  }

  try {
    statusText.textContent = 'Loading movies...';

    const data = query
      ? await fetchTmdb('/search/movie', { query, page: currentPage, include_adult: false })
      : await fetchTmdb('/discover/movie', {
          page: currentPage,
          sort_by: 'popularity.desc',
          with_genres: activeGenre || undefined,
          include_adult: false
        });

    totalPages = data.total_pages || 1;
    const movies = mapGenres(data.results || []);
    renderMovies(movies, append);

    statusText.textContent = `Showing page ${currentPage} of ${Math.min(totalPages, 500)}.`;
    loadMoreBtn.style.display = currentPage < totalPages ? 'inline-block' : 'none';
  } catch (error) {
    useFallback = true;
    await loadMovies(false);
  }
}

genreFilters.addEventListener('click', (event) => {
  const target = event.target.closest('[data-genre-id]');
  if (!target) return;
  activeGenre = Number(target.dataset.genreId);
  currentPage = 1;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
  target.classList.add('active');
  loadMovies(false);
});

searchBtn.addEventListener('click', () => {
  query = searchInput.value.trim();
  currentPage = 1;
  loadMovies(false);
});
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchBtn.click();
});

loadMoreBtn.addEventListener('click', () => {
  if (currentPage >= totalPages) return;
  currentPage += 1;
  loadMovies(true);
});

movieGrid.addEventListener('click', (event) => {
  const card = event.target.closest('.movie-card');
  if (!card) return;

  const id = Number(card.dataset.movieId);
  const selected = (movieGrid.__lastRenderedMovies || []).find(m => Number(m.id) === id);
  if (!selected) return;
  openMoviePlayer(selected);
});

movieGrid.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.movie-card');
  if (!card) return;
  event.preventDefault();
  const id = Number(card.dataset.movieId);
  const selected = (movieGrid.__lastRenderedMovies || []).find(m => Number(m.id) === id);
  if (!selected) return;
  openMoviePlayer(selected);
});

closePlayerBtn.addEventListener('click', closeMoviePlayer);
playerModal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-player="true"]')) closeMoviePlayer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && playerModal.classList.contains('show')) closeMoviePlayer();
});

document.getElementById('year').textContent = new Date().getFullYear();
renderGenres([]);
loadGenres().then(() => loadMovies(false));

const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function makeParticles(count = 100) {
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 0.6,
    vx: (Math.random() - 0.5) * 0.7,
    vy: (Math.random() - 0.5) * 0.7
  }));
}
function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(112, 212, 255, 0.8)';
    ctx.fill();

    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j];
      const distance = Math.hypot(p.x - q.x, p.y - q.y);
      if (distance < 90) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(125, 161, 255, ${1 - distance / 90})`;
        ctx.lineWidth = 0.7;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
  });
  requestAnimationFrame(drawParticles);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  makeParticles();
});
resizeCanvas();
makeParticles();
drawParticles();
