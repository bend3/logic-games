// To add a game: create js/<id>/<id>.js exporting mount(container) -> unmount(), then register it here
// and add its files to the precache list in sw.js.
export const games = [
  {
    id: 'queens',
    name: 'Queens',
    tagline: 'One crown in every row, column and color.',
    load: () => import('./queens/queens.js'),
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="0" y="0" width="20" height="20" fill="#bba3e2"/><rect x="20" y="0" width="20" height="20" fill="#ffc992"/>
      <rect x="0" y="20" width="20" height="20" fill="#96beff"/><rect x="20" y="20" width="20" height="20" fill="#b3dfa0"/>
      <path d="M9 30l-2-12 7 5 6-9 6 9 7-5-2 12z" fill="#1d1d1d"/></svg>`,
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'Coming soon',
    comingSoon: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="#e9eef5"/>
      <path d="M13.3 0v40M26.6 0v40M0 13.3h40M0 26.6h40" stroke="#5b6b80" stroke-width="1.5"/>
      <text x="6.6" y="10" font-size="8" text-anchor="middle" font-family="sans-serif" fill="#1d1d1d">5</text>
      <text x="20" y="23.5" font-size="8" text-anchor="middle" font-family="sans-serif" fill="#1d1d1d">3</text>
      <text x="33.3" y="37" font-size="8" text-anchor="middle" font-family="sans-serif" fill="#1d1d1d">9</text></svg>`,
  },
];
