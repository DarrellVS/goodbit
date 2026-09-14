/*
 * The publisher setup guide.
 *
 * Two jobs. It keeps one step on screen at a time so a long list of
 * unfamiliar work reads as a sequence rather than a wall, and it writes the
 * reader's own domain, port and paths into every command on the page so they
 * copy something that will actually run instead of translating an example.
 *
 * No build step and no framework, like the rest of this site. Values are kept
 * in localStorage so closing the tab halfway through does not lose them; they
 * never leave the browser.
 */
(() => {
  const root = document.getElementById('route');
  const quick = document.getElementById('quick');
  const guided = document.getElementById('guided');
  if (!root || !quick || !guided) return;

  const STORE = 'goodbit.publisher.setup';

  /* ------------------------------------------------------------ values */

  const FIELDS = {
    domain: { el: document.getElementById('f-domain'), fallback: 'clips.example.com' },
    port: { el: document.getElementById('f-port'), fallback: '5555' },
    data: { el: document.getElementById('f-data'), fallback: '/volume1/docker/goodbit-clips' },
    lan: { el: document.getElementById('f-lan'), fallback: '192.168.1.20' },
  };

  /** What the reader typed, or the placeholder, so a command is never half-written. */
  function values() {
    const out = {};
    for (const [key, field] of Object.entries(FIELDS)) {
      out[key] = (field.el?.value || '').trim() || field.fallback;
    }
    // A domain pasted with a scheme still has to read as a hostname here.
    out.domain = out.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    out.url = `https://${out.domain}`;
    return out;
  }

  function save() {
    const raw = {};
    for (const [key, field] of Object.entries(FIELDS)) raw[key] = field.el?.value ?? '';
    try {
      localStorage.setItem(STORE, JSON.stringify(raw));
    } catch {
      /* private window, or storage full. The page still works. */
    }
  }

  function restore() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch {
      raw = null;
    }
    if (!raw) return;
    for (const [key, field] of Object.entries(FIELDS)) {
      if (field.el && typeof raw[key] === 'string') field.el.value = raw[key];
    }
  }

  /* ---------------------------------------------------------- commands */

  const compose = (v) => `services:
  publisher:
    image: goodbit-publisher
    container_name: goodbit-publisher
    restart: unless-stopped
    ports:
      - "${v.port}:5555"
    environment:
      PUBLIC_BASE_URL: "${v.url}"
      UPLOAD_DIR: "/data/public"
    volumes:
      - "${v.data}:/data/public"`;

  const caddy = (v) => `${v.domain} {
  reverse_proxy ${v.lan}:${v.port}
}`;

  const health = (v) => `curl http://localhost:${v.port}/api/health`;

  /** Every command and inline example, rewritten from the current values. */
  function render() {
    const v = values();

    const text = {
      '#cmd-compose': compose(v),
      '#cmd-compose-quick': compose(v),
      '#cmd-health': health(v),
      '#cmd-caddy': caddy(v),
      '#dns-name': v.domain,
      '#proxy-url': v.url,
      '#npm-domain': v.domain,
      '#npm-host': v.lan,
      '#npm-port': v.port,
      '#test-url': `${v.url}/api/health`,
      '#final-url': v.url,
    };

    for (const [selector, content] of Object.entries(text)) {
      const el = document.querySelector(selector);
      if (el) el.textContent = content;
    }
  }

  for (const field of Object.values(FIELDS)) {
    field.el?.addEventListener('input', () => {
      save();
      render();
    });
  }

  /* ------------------------------------------------------------- steps */

  const steps = Array.from(guided.querySelectorAll('.step'));
  const rail = document.getElementById('steps');
  const counter = document.getElementById('counter');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  let at = 0;

  rail.innerHTML = steps
    .map(
      (step, i) =>
        `<li><button type="button" data-step-to="${i}">${i + 1}. ${step.dataset.step}</button></li>`,
    )
    .join('');

  function show(index, { scroll = true } = {}) {
    at = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, i) => {
      step.hidden = i !== at;
    });
    Array.from(rail.children).forEach((li, i) => {
      li.dataset.state = i === at ? 'current' : i < at ? 'done' : 'todo';
    });
    prev.disabled = at === 0;
    next.textContent = at === steps.length - 1 ? 'Done' : 'Next →';
    counter.textContent = `Step ${at + 1} of ${steps.length}`;
    if (scroll) guided.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  rail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step-to]');
    if (button) show(Number(button.dataset.stepTo));
  });

  prev.addEventListener('click', () => show(at - 1));
  next.addEventListener('click', () => {
    if (at === steps.length - 1) {
      // "Done" takes you where the last step told you to go.
      window.location.hash = '#top';
      return;
    }
    show(at + 1);
  });

  guided.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-goto]');
    if (!jump) return;
    event.preventDefault();
    show(Number(jump.dataset.goto) - 1);
  });

  /* ------------------------------------------------------------ routes */

  function choose(route, { scroll = true } = {}) {
    const isQuick = route === 'quick';
    quick.hidden = !isQuick;
    guided.hidden = isQuick;
    root.hidden = true;
    if (!isQuick) show(0, { scroll: false });
    render();
    if (scroll) (isQuick ? quick : guided).scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      localStorage.setItem(`${STORE}.route`, route);
    } catch {
      /* nothing to do */
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (button) choose(button.dataset.route);
  });

  document.addEventListener('click', (event) => {
    const back = event.target.closest('[data-restart]');
    if (!back) return;
    event.preventDefault();
    quick.hidden = true;
    guided.hidden = true;
    root.hidden = false;
    try {
      localStorage.removeItem(`${STORE}.route`);
    } catch {
      /* nothing to do */
    }
    root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* -------------------------------------------------------------- copy */

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    const source = document.querySelector(button.dataset.copy);
    if (!source) return;

    try {
      await navigator.clipboard.writeText(source.textContent);
      const was = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = was;
      }, 1400);
    } catch {
      // Clipboard refused — select it instead so ctrl+c still works.
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });

  /* -------------------------------------------------------------- boot */

  restore();
  render();

  // A reader who got halfway and came back lands where they were.
  let chosen = null;
  try {
    chosen = localStorage.getItem(`${STORE}.route`);
  } catch {
    chosen = null;
  }
  if (window.location.hash === '#quick-start') choose('quick', { scroll: false });
  else if (chosen === 'quick' || chosen === 'guided') choose(chosen, { scroll: false });
})();
