import { games } from './games.js';
import { store } from './storage.js';

const app = document.getElementById('app');
const title = document.querySelector('.title');
const back = document.querySelector('.back');
let unmount = null;
let routeToken = 0;

function renderHome() {
  title.textContent = 'Logic Games';
  back.hidden = true;
  const list = document.createElement('ul');
  list.className = 'game-list';
  for (const g of games) {
    const saved = store.get(`${g.id}:game`);
    const inProgress = saved && !saved.solved;
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="game-card${g.comingSoon ? ' disabled' : ''}" ${g.comingSoon ? 'aria-disabled="true"' : `href="#/${g.id}"`}>
        <span class="game-icon">${g.icon}</span>
        <span class="game-text">
          <strong>${g.name}</strong>
          <span>${g.tagline}</span>
        </span>
        ${inProgress ? '<span class="badge">Continue</span>' : ''}
      </a>`;
    list.append(li);
  }
  app.replaceChildren(list);
}

async function route() {
  const token = ++routeToken;
  unmount?.();
  unmount = null;
  const id = location.hash.replace(/^#\/?/, '');
  const game = games.find((g) => g.id === id && !g.comingSoon);
  if (!game) return renderHome();

  title.textContent = game.name;
  back.hidden = false;
  app.replaceChildren();
  const mod = await game.load();
  if (token !== routeToken) return;
  unmount = mod.mount(app);
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
