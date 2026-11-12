import { games } from '../../platform/games';
import './style.css';

const game = games[0];
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar wrap">
    <a class="brand" href="/" aria-label="Їжаклуб — головна"><span class="brand-mark" aria-hidden="true">ї</span>їжаклуб<span class="brand-dot">✳</span></a>
    <span class="family-tag">Свої люди. Веселі ігри.</span>
  </header>
  <main class="wrap">
    <section class="hero" aria-labelledby="welcome">
      <div class="hero-copy">
        <span class="eyebrow"><span class="tiny-sun" aria-hidden="true">✺</span> МІСЦЕ ДЛЯ СІМЕЙНОГО ГАРМИДЕРУ</span>
        <h1 id="welcome">Збирай своїх.<br>Буде <span class="underlined">весело!</span></h1>
        <p class="intro">Тут можна бути командою, трохи бешкетувати<br class="desktop-break"> й казати: «Ну все, ще одну партію!»</p>
        <a class="button primary" href="#games">Обрати пригоду <span aria-hidden="true">↘</span></a>
        <p class="small-note"><span aria-hidden="true">♡</span> Для маленьких і великих бешкетників</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
        <span class="art-star star-one">✳</span><span class="art-star star-two">✦</span>
        <span class="speech">А хто за їжачків?</span>
        <div class="hedgehog"><div class="spines"></div><div class="face"><i class="eye"></i><i class="cheek"></i><i class="nose"></i></div><i class="foot left-foot"></i><i class="foot right-foot"></i></div>
        <span class="art-ground"></span><span class="art-flower">✿</span>
        <span class="art-caption">Обережно: можна заразитися гарним настроєм!</span>
      </div>
    </section>
    <section id="games" class="games-section" aria-labelledby="games-title">
      <div class="section-heading"><div><span class="eyebrow">НАША ПОЛИЧКА З ІГРАМИ</span><h2 id="games-title">У що сьогодні?</h2></div><span class="shelf-note">Перша пригода вже росте <span aria-hidden="true">↙</span></span></div>
      <div class="game-grid">
        <article class="game-card">
          <div class="card-art" aria-hidden="true"><span class="card-cloud"></span><span class="card-sun">✺</span><span class="card-hill"></span><span class="card-hog">ї</span><span class="card-flag">⚑</span><span class="card-spark">✧</span></div>
          <div class="card-body"><div class="card-meta"><span class="pill">Ще майструємо</span><span>${game.players}</span></div><h3>${game.title}</h3><p>${game.description}</p><a class="button dark" href="${game.path}">Зазирнути в майстерню <span aria-hidden="true">↗</span></a></div>
        </article>
        <aside class="next-card"><span class="next-icon" aria-hidden="true">✳</span><h3>Тут росте ще<br>одна пригода</h3><p>Ідей повна кишеня.<br>Місце для наступної гри вже є!</p><button class="button outline" id="cheer" type="button">Підкинути настрій <span aria-hidden="true">↑</span></button><p id="cheer-message" class="cheer-message" role="status" aria-live="polite">Трошки веселощів ніколи не завадить.</p></aside>
      </div>
    </section>
    <div class="club-note"><span aria-hidden="true">✺</span><p>Найкращий рахунок — коли всім весело.</p><span aria-hidden="true">♡</span></div>
  </main>
  <footer class="wrap footer"><span>Їжаклуб · Зроблено для своїх</span><span>Тут серйозно ставляться до веселощів <span aria-hidden="true">☺</span></span></footer>
`;

const messages = ['Настрій підстрибнув! Їжачок схвалює.', 'Плюс один привід усміхнутися!', 'Опа! Веселощів стало більше.', 'Передай усмішку сусідньому бешкетнику!'];
let cheers = 0;
document.querySelector<HTMLButtonElement>('#cheer')!.addEventListener('click', () => {
  document.querySelector('#cheer-message')!.textContent = messages[cheers++ % messages.length]!;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelector('.next-icon')!.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(180deg) scale(1.35)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 650, easing: 'ease-out' });
  }
});
