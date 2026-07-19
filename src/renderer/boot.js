/* boot.js — console-style startup sequence. Types a fake terminal login
   (user, auto-filled password, access granted) and fades into the app.
   Time-based rendering: the whole sequence takes ~2.5s even if timers are
   throttled. Skipped in demo mode, when animations are off, or on click. */
'use strict';

(async function bootScreen() {
  const el = document.getElementById('bootScreen');
  const out = document.getElementById('bootText');
  if (!el || !out) return;

  const kill = () => {
    if (el._dead) return;
    el._dead = true;
    el.classList.add('boot-out');
    setTimeout(() => el.remove(), 380);
  };

  if (window.krate.demo) { el.remove(); return; }
  let cfg = null;
  try { cfg = (await window.krate.getState()).config; } catch { }
  if (cfg && cfg.animations === false) { el.remove(); return; }

  const user = (window.krate.username || 'user').toLowerCase();

  // segments: text, chars per second, extra pause after (ms)
  const script = [
    { text: 'KRATE SYSTEM — boot sequence', rate: 90, gap: 120 },
    { text: '> mounting project library ............ ok', rate: 150, gap: 100 },
    { text: `> user: ${user}`, rate: 90, gap: 110 },
    { text: '> password: **********', rate: 60, gap: 150 },
    { text: '> access granted', rate: 110, gap: 90 },
    { text: `welcome back, ${user}.`, rate: 55, gap: 140, cls: 'boot-hi' },
    { text: '> launching interface ██████████ 100%', rate: 140, gap: 200 },
  ];

  // precompute the timeline
  let t = 0;
  for (const s of script) {
    s.start = t;
    s.dur = (s.text.length / s.rate) * 1000;
    t += s.dur + s.gap;
  }
  const total = t;

  const rows = script.map((s) => {
    const div = document.createElement('div');
    if (s.cls) div.className = s.cls;
    div.style.display = 'none';
    out.appendChild(div);
    return div;
  });

  el.addEventListener('click', kill);
  const start = performance.now();

  const tick = () => {
    if (el._dead) return;
    const e = performance.now() - start;
    for (let i = 0; i < script.length; i++) {
      const s = script[i];
      if (e < s.start) break;
      rows[i].style.display = '';
      const frac = Math.min(1, (e - s.start) / (s.dur || 1));
      rows[i].textContent = s.text.slice(0, Math.ceil(frac * s.text.length));
    }
    if (e >= total + 250) { kill(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(kill, 5000); // hard cap, whatever happens
})();
