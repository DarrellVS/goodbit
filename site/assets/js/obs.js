/*
 * The OBS guide: two routes, a step rail, and the handoff into the app.
 *
 * Same shape as publisher.js, and deliberately so: someone who has used one of
 * these guides should not have to learn the other. The difference is what the
 * link at the end carries. The publisher hands over an address and a token;
 * this hands over choices, because the app already knows where its own library
 * is and a web page has no business naming a folder on someone's disk.
 */
(() => {
  const root = document.getElementById('routes');
  const quick = document.getElementById('quick');
  const guided = document.getElementById('guided');
  if (!root || !quick || !guided) return;

  const STORE = 'goodbit.obs';

  /* ------------------------------------------------------------- handoff */

  const choices = document.getElementById('choices');
  const seconds = document.getElementById('buffer-seconds');
  const hotkey = document.getElementById('hotkey');
  const deeplink = document.getElementById('deeplink');
  const note = document.getElementById('deeplink-note');

  function chosen() {
    return Array.from(choices.querySelectorAll('input:checked')).map((input) => input.value);
  }

  // An older link naming a step that no longer exists is harmless: the app
  // drops step names it does not recognise.

  function render() {
    const steps = chosen();
    const params = new URLSearchParams();
    if (steps.length) params.set('steps', steps.join(','));
    params.set('buffer', String(Math.min(300, Math.max(5, Number(seconds.value) || 30))));
    params.set('hotkey', hotkey.value);

    deeplink.href = `goodbit://setup/obs?${params.toString()}`;
    deeplink.setAttribute('aria-disabled', steps.length ? 'false' : 'true');

    note.textContent = steps.length
      ? 'Opens the app and shows you the changes. Nothing is written until you press Apply there.'
      : 'Tick at least one thing for GoodBit to do.';
  }

  choices.addEventListener('change', render);
  seconds.addEventListener('input', render);
  hotkey.addEventListener('change', render);

  deeplink.addEventListener('click', (event) => {
    if (deeplink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      return;
    }
    // The app may be closed, or the protocol may not be registered on a
    // machine that has never run it. Neither is an error worth a dialog, but
    // silence would read as a dead button.
    note.textContent = 'Opening GoodBit… if nothing happens, the app is not installed on this machine.';
  });

  /* --------------------------------------------------------------- steps */

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

  /** Back to the two routes, from wherever the reader is. */
  function toRoutes({ scroll = true } = {}) {
    quick.hidden = true;
    guided.hidden = true;
    root.hidden = false;
    try {
      localStorage.removeItem(`${STORE}.route`);
    } catch {
      /* nothing to do */
    }
    if (scroll) root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function show(index, { scroll = true } = {}) {
    at = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, i) => {
      step.hidden = i !== at;
    });
    Array.from(rail.children).forEach((li, i) => {
      li.dataset.state = i === at ? 'current' : i < at ? 'done' : 'todo';
    });
    /*
     * Never disabled.
     *
     * Back on the first step used to be dead, which left somebody who picked
     * the by-hand route with no way to change their mind: the only link back
     * to the two routes was on the last step, seven pages away from the
     * decision they wanted to undo.
     */
    prev.disabled = false;
    prev.textContent = at === 0 ? '← Both routes' : '← Back';
    next.textContent = at === steps.length - 1 ? 'Done' : 'Next →';
    counter.textContent = `Step ${at + 1} of ${steps.length}`;
    if (scroll) guided.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  rail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step-to]');
    if (button) show(Number(button.dataset.stepTo));
  });

  prev.addEventListener('click', () => (at === 0 ? toRoutes() : show(at - 1)));
  next.addEventListener('click', () => {
    if (at === steps.length - 1) {
      window.location.hash = '#top';
      return;
    }
    show(at + 1);
  });

  /* -------------------------------------------------------------- routes */

  function choose(route, { scroll = true } = {}) {
    const isQuick = route === 'app';
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
    toRoutes();
  });

  /* Pick up where the reader left off, the way the publisher guide does. */
  try {
    const remembered = localStorage.getItem(`${STORE}.route`);
    if (remembered) choose(remembered, { scroll: false });
    else render();
  } catch {
    render();
  }
})();
