import { PROTOCOL_VERSION, ServerMessage } from '@yizhaklub/hedge-protocol';
import { registerPwa } from '../../../platform/pwa';
import './style.css';

registerPwa();

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="game-header"><a class="back" href="/">← До ігор</a><span class="club-name">Ігротека</span></header>
  <main class="workshop">
    <span class="eyebrow">ПРИГОДА НА ПІДХОДІ</span><h1>Їжачі баталії</h1>
    <p class="lead">Шоломи начищено. Їжачки розминаються.<br>А над самою грою ми ще чаклуємо!</p>
    <div class="field-frame"><div id="field" role="img" aria-label="Їжачок на зеленому пагорбі. Інтерактивна ілюстрація майстерні."></div><span class="field-label">Майстерня пригод</span></div>
    <button id="wave" type="button">Підбадьорити їжачка <span aria-hidden="true">✦</span></button>
    <p id="wave-status" class="quiet" role="status" aria-live="polite">Натисни — він тобі зрадіє.</p>
    <p class="promise">Тут згодом зустрінуться до чотирьох гравців.<br>Мережеву гру й поле для баталій ще готуємо.</p>
    <p id="connection" class="connection" role="status" aria-live="polite">Вітаємося з майстернею…</p>
  </main>
`;

const status = document.querySelector<HTMLElement>('#connection')!;
const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
let connected = false;
const timeout = setTimeout(() => { if (!connected) { status.textContent = 'Майстерня поки не відповідає. Спробуй завітати пізніше.'; socket.close(); } }, 6500);
socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'client.hello', protocolVersion: PROTOCOL_VERSION, gameId: 'hedge-wars' })));
socket.addEventListener('message', (event: MessageEvent<string>) => {
  try {
    const parsed = ServerMessage.safeParse(JSON.parse(event.data));
    if (!parsed.success) return;
    clearTimeout(timeout);
    if (parsed.data.type === 'server.hello') { connected = true; status.textContent = 'Майстерня відчинена. Їжачок чекає на привіт!'; }
    else status.textContent = parsed.data.code === 'PROTOCOL_MISMATCH' ? 'Є новіша версія майстерні. Онови сторінку, будь ласка.' : 'Не вдалося привітатися. Спробуй оновити сторінку.';
  } catch { status.textContent = 'Щось завадило привітанню. Спробуй оновити сторінку.'; }
});
socket.addEventListener('close', () => { clearTimeout(timeout); if (connected) status.textContent = 'Зв’язок із майстернею перервався. Їжачок усе одно радий тобі!'; });
socket.addEventListener('error', () => { clearTimeout(timeout); status.textContent = 'Зараз без зв’язку. Їжачок усе одно радий тобі!'; });

const { createPreview } = await import('./preview');
const preview = createPreview('field');
document.querySelector('#wave')!.addEventListener('click', () => {
  preview.wave();
  document.querySelector('#wave-status')!.textContent = 'Їжачок передає тобі колючі обійми!';
});
window.addEventListener('pagehide', () => { clearTimeout(timeout); socket.close(); preview.destroy(); }, { once: true });
