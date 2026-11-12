/** Cross-game catalogue. Game-specific behavior must stay in its own project. */
export const games = [
  {
    id: 'hedge-wars',
    title: 'Їжачі баталії',
    description: 'Маленькі їжачки. Великі плани. І трішечки гармидеру!',
    path: '/games/hedge-wars/',
    status: 'workshop' as const,
    players: '2–4 гравці',
    clientDirectory: '01_hedge_wars/client/dist',
  },
] as const;

export function publicGames() {
  return games.map(({ clientDirectory: _directory, ...publicEntry }) => publicEntry);
}
