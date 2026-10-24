// ---------------------------------------------------------------- boot
async function boot() {
  APP.clockOffset = Number(store.get('clockOffset', 0)) || 0;
  const health = await detectReal();
  APP.realAvailable = !!health; APP.real = health;
  APP.mode = APP.realAvailable && store.get('mode', 'REAL') === 'REAL' ? 'REAL' : 'DEMO';
  buildShell();
  window.addEventListener('hashchange', render);
  await render();
  APP.booted = true;
}
boot();
})();
