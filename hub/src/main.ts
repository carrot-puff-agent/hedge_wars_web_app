import { games } from '../../platform/games';
import { registerPwa } from '../../platform/pwa';
import './style.css';

registerPwa();

const gameCards = games.map((game) => `
  <a class="game-card" href="${game.path}">
    <span class="game-art" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false"><path d="M21.58,16.09l-1.09-7.66C20.21,6.46,18.52,5,16.53,5H7.47C5.48,5,3.79,6.46,3.51,8.43l-1.09,7.66C2.2,17.63,3.39,19,4.94,19h0c0.68,0,1.32-0.27,1.8-0.75L9,16h6l2.25,2.25c0.48,0.48,1.13,0.75,1.8,0.75h0C20.61,19,21.8,17.63,21.58,16.09z M11,11H9v2H8v-2H6v-1h2V8h1v2h2V11z M15,10c-0.55,0-1-0.45-1-1c0-0.55,0.45-1,1-1s1,0.45,1,1C16,9.55,15.55,10,15,10z M17,13c-0.55,0-1-0.45-1-1c0-0.55,0.45-1,1-1s1,0.45,1,1C18,12.55,17.55,13,17,13z"/></svg>
    </span>
    <span class="game-info">
      <span class="game-meta"><span class="badge">Ще майструємо</span><span>${game.players}</span></span>
      <span class="game-title">${game.title}</span>
      <span class="game-action">Відкрити <span aria-hidden="true">→</span></span>
    </span>
  </a>
`).join('');

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Ігротека — головна">
        <img class="brand-icon" src="/icons/controller.svg" alt="" />
        <span>Ігротека</span>
      </a>
    </header>
    <main class="main-content">
      <section class="library" aria-labelledby="games-title">
        <div class="section-heading"><h1 id="games-title">Обери гру</h1></div>
        <div class="game-list">${gameCards}</div>
      </section>
    </main>
  </div>
`;
