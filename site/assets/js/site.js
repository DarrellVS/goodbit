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

  function mark() {
    // Whichever heading is nearest the top of the screen without being below
    // the middle of it: the one being read.
    var best = entries[0];
    var bestTop = -Infinity;

    entries.forEach(function (entry) {
      var top = entry.target.getBoundingClientRect().top;
      if (top <= window.innerHeight * 0.5 && top > bestTop) {
        bestTop = top;
        best = entry;
      }
    });

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
