(() => {
  const track = document.querySelector('.photo-track');
  if (!track) return;
  const slides = [...track.querySelectorAll('.photo-slide')];
  const controls = document.querySelector('.carousel-controls');
  if (!slides.length || !controls) return;
  const playback = controls.querySelector('.carousel-playback');
  const previous = controls.querySelector('.carousel-previous');
  const next = controls.querySelector('.carousel-next');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let settleTimer;
  let drag = null;
  let autoplayTimer;
  let playing = !reducedMotion.matches;
  let pageActive = true;
  const activePointers = new Set();
  const activeTouches = new Set();
  const autoplayDelay = 3000;

  function scheduleAutoplay() {
    clearTimeout(autoplayTimer);
    const canAdvance = playing && pageActive && !document.hidden &&
      activePointers.size === 0 && activeTouches.size === 0 && !track.contains(document.activeElement);
    if (!canAdvance) return;
    autoplayTimer = setTimeout(() => {
      const wrapping = current === slides.length - 1;
      // Return directly to the start instead of racing backwards through the strip.
      goTo(wrapping ? 0 : current + 1, !wrapping);
      scheduleAutoplay();
    }, autoplayDelay);
  }

  function setPlaying(value) {
    playing = value;
    playback.classList.toggle('is-paused', !playing);
    const label = playing ? 'Pause slideshow' : 'Play slideshow';
    playback.setAttribute('aria-label', label);
    playback.title = label;
    scheduleAutoplay();
  }

  function navigate(index) {
    goTo(index);
    scheduleAutoplay();
  }

  playback.addEventListener('click', () => setPlaying(!playing));
  function clearInteraction() {
    activePointers.clear();
    activeTouches.clear();
    drag = null;
    track.classList.remove('is-dragging');
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInteraction();
    scheduleAutoplay();
  });
  window.addEventListener('blur', () => {
    clearInteraction();
    scheduleAutoplay();
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) setPlaying(false);
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    clearTimeout(autoplayTimer);
    clearTimeout(settleTimer);
    clearInteraction();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    scheduleAutoplay();
  });

  function update(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
  }

  function nearest() {
    return slides.reduce((best, slide, index) =>
      Math.abs(slide.offsetLeft - track.scrollLeft) < Math.abs(slides[best].offsetLeft - track.scrollLeft) ? index : best, 0);
  }

  function goTo(index, smooth = true) {
    clearTimeout(settleTimer);
    update(index);
    track.scrollTo({ left: slides[current].offsetLeft, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
  }

  previous.addEventListener('click', () => navigate(current - 1));
  next.addEventListener('click', () => navigate(current + 1));
  track.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let target;
    if (event.key === 'ArrowRight') target = current + 1;
    else if (event.key === 'ArrowLeft') target = current - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = slides.length - 1;
    else return;
    event.preventDefault();
    navigate(target);
    if (event.target.closest('.photo-slide')) slides[current].focus({ preventScroll: true });
  });
  track.addEventListener('focusin', event => {
    scheduleAutoplay();
    const slide = event.target.closest('.photo-slide');
    if (slide && slides.indexOf(slide) !== current) goTo(slides.indexOf(slide), false);
  });
  track.addEventListener('focusout', () => queueMicrotask(scheduleAutoplay));
  track.addEventListener('wheel', scheduleAutoplay, { passive: true });
  track.addEventListener('scroll', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => update(nearest()), 140);
  }, { passive: true });

  // Native touch panning cancels pointer events before the finger is lifted.
  // Track the touches separately so rotation stays suspended for the whole gesture.
  track.addEventListener('touchstart', event => {
    for (const touch of event.changedTouches) activeTouches.add(touch.identifier);
    scheduleAutoplay();
  }, { passive: true });
  function releaseTouches(event) {
    for (const touch of event.changedTouches) activeTouches.delete(touch.identifier);
    scheduleAutoplay();
  }
  window.addEventListener('touchend', releaseTouches, { passive: true });
  window.addEventListener('touchcancel', releaseTouches, { passive: true });

  // Touch and trackpad scrolling stay native; mouse users can also drag the strip.
  track.addEventListener('pointerdown', event => {
    activePointers.add(event.pointerId);
    scheduleAutoplay();
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    // Keep a partially visible slide from jumping into focus before a drag starts.
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, left: track.scrollLeft, moved: false };
  });
  track.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = event.clientX - drag.x;
    if (!drag.moved && Math.abs(distance) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      track.setPointerCapture(event.pointerId);
      track.classList.add('is-dragging');
    }
    event.preventDefault();
    track.scrollLeft = drag.left - distance;
  });
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    if (moved) goTo(nearest());
  }
  function releasePointer(event) {
    if (!activePointers.delete(event.pointerId)) return;
    endDrag(event);
    scheduleAutoplay();
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  track.addEventListener('lostpointercapture', endDrag);
  track.addEventListener('pointerleave', event => {
    if (drag && !drag.moved) endDrag(event);
  });

  function fitTrack() {
    const last = slides[slides.length - 1];
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.style.setProperty('--trailing-space', `${Math.max(0, track.clientWidth - last.getBoundingClientRect().width - gap)}px`);
    goTo(current, false);
  }
  controls.hidden = false;
  fitTrack();
  new ResizeObserver(fitTrack).observe(track);
  setPlaying(playing);
})();
