/*
 * The only script on the site, and every page works without it: it marks which
 * section of the docs you are reading in the contents list, and nothing else.
 */
(function () {
  'use strict';

  var toc = document.querySelector('.toc');
  if (!toc) return;

  var entries = Array.prototype.slice
    .call(toc.querySelectorAll('a[href^="#"]'))
    .map(function (link) {
      var target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return target ? { link: link, target: target } : null;
    })
    .filter(Boolean);

  if (entries.length === 0) return;

  var current = null;
  var header = document.querySelector('.site-header');

  /**
   * The line a heading has to cross to count as the one being read: just under
   * the sticky header, where a heading you have scrolled to comes to rest.
   *
   * This used to be the middle of the viewport, which marked the *next*
   * section as soon as its heading rose above the halfway line — so the list
   * ran a section ahead of the reader the whole way down, and at the top of the
   * page it already pointed at the second item.
   */
  function line() {
    return (header ? header.getBoundingClientRect().height : 0) + 24;
  }

  function mark() {
    var threshold = line();
    var best = entries[0];
    var bestTop = -Infinity;

    entries.forEach(function (entry) {
      var top = entry.target.getBoundingClientRect().top;
      if (top <= threshold && top > bestTop) {
        bestTop = top;
        best = entry;
      }
    });

    // The last section is often too short to ever reach that line, so it would
    // never be marked however far you scrolled. At the bottom, it is the one.
    var atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) best = entries[entries.length - 1];

    if (best === current) return;
    if (current) current.link.removeAttribute('aria-current');
    current = best;
    current.link.setAttribute('aria-current', 'true');
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      mark();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  mark();
})();
