(() => {
  'use strict';

  const desktop = document.querySelector('.desktop');
  if (!desktop) return;

  const status = document.querySelector('#desktop-status');
  const icons = [...desktop.querySelectorAll('.movable-icon')].map(element => ({
    element,
    link: element.querySelector('a.desktop-item'),
    name: element.querySelector('.item-label')?.textContent.trim() || 'Icon',
    x: 0,
    y: 0,
    suppressClickUntil: 0
  })).filter(icon => icon.link);
  if (!icons.length) return;

  let active = null;
  let topLayer = 5;
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;
  const desktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const announce = message => { if (status) status.textContent = message; };

  function position(icon, x, y) {
    icon.x = x;
    icon.y = y;
    icon.element.style.setProperty('--drag-x', `${x}px`);
    icon.element.style.setProperty('--drag-y', `${y}px`);
  }

  function bounds(icon) {
    const area = desktop.getBoundingClientRect();
    const rect = icon.element.getBoundingClientRect();
    const left = rect.left - icon.x;
    const top = rect.top - icon.y;
    // Always include the designed starting position, even on a narrow screen.
    return {
      minX: Math.min(0, area.left + 10 - left),
      maxX: Math.max(0, area.right - 10 - left - rect.width),
      minY: Math.min(0, area.top - top),
      maxY: Math.max(0, area.bottom - 65 - top - rect.height)
    };
  }

  function moveWithin(icon, x, y, limits = bounds(icon)) {
    position(icon, clamp(x, limits.minX, limits.maxX), clamp(y, limits.minY, limits.maxY));
  }

  function raise(icon) {
    icon.element.style.zIndex = String(++topLayer);
  }

  function finish(cancelled = false) {
    if (!active) return;
    const drag = active;
    active = null;
    drag.icon.element.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-moving-icon');
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    if (!drag.moved) return;
    // A completed drag must never turn into a link activation on pointerup.
    drag.icon.suppressClickUntil = performance.now() + 500;
    if (cancelled) {
      moveWithin(drag.icon, drag.x, drag.y);
    } else {
      announce(`${drag.icon.name} moved. Press Escape to put it back.`);
    }
  }

  function start(event, icon) {
    if (active || event.button !== 0 || !event.isPrimary) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    active = {
      icon,
      target: icon.link,
      pointerId: event.pointerId,
      threshold: event.pointerType === 'touch' ? 10 : 6,
      startX: event.clientX,
      startY: event.clientY,
      x: icon.x,
      y: icon.y,
      limits: bounds(icon),
      moved: false
    };
    // Leave pointerdown alone so a click or tap still follows the link.
    // CSS disables touch scrolling only over the icon links themselves.
  }

  window.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) < active.threshold) return;
    if (!active.moved) {
      active.moved = true;
      raise(active.icon);
      active.icon.link.focus({ preventScroll: true });
      active.target.setPointerCapture(event.pointerId);
      active.icon.element.classList.add('is-dragging');
      document.documentElement.classList.add('is-moving-icon');
    }
    event.preventDefault();
    moveWithin(active.icon, active.x + dx, active.y + dy, active.limits);
  }, { passive: false });

  window.addEventListener('pointerup', event => {
    if (active?.pointerId === event.pointerId) finish();
  });
  window.addEventListener('pointercancel', event => {
    if (active?.pointerId === event.pointerId) finish(true);
  });
  window.addEventListener('blur', () => finish(true));

  for (const icon of icons) {
    icon.link.draggable = false;
    icon.link.querySelectorAll('img').forEach(image => { image.draggable = false; });
    icon.link.addEventListener('dragstart', event => event.preventDefault());
    icon.link.addEventListener('pointerdown', event => start(event, icon));
    icon.element.addEventListener('lostpointercapture', event => {
      if (active?.pointerId === event.pointerId) finish(true);
    });
    icon.link.addEventListener('click', event => {
      // Keyboard activation (detail 0) is always allowed.
      if (event.detail && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
          performance.now() < icon.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
      icon.suppressClickUntil = 0;
    }, true);
    icon.link.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (active?.icon === icon) finish(true);
        position(icon, 0, 0);
        icon.element.style.removeProperty('z-index');
        announce(`${icon.name} returned to its starting position.`);
        return;
      }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 36 : 12;
      raise(icon);
      moveWithin(icon, icon.x + direction[0] * step, icon.y + direction[1] * step);
      announce(`${icon.name} moved. Press Escape to put it back.`);
    });
  }

  function resetAll() {
    finish(true);
    for (const icon of icons) {
      position(icon, 0, 0);
      icon.element.style.removeProperty('z-index');
    }
    topLayer = 5;
  }

  window.addEventListener('resize', () => {
    const widthChanged = window.innerWidth !== screenWidth;
    const heightChanged = window.innerHeight !== screenHeight;
    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;
    if (widthChanged) {
      resetAll();
      return;
    }
    // Mobile browser chrome changes height while scrolling: leave icons alone.
    if (!heightChanged || screenWidth < 1000 || !desktopPointer.matches) return;
    // A shorter laptop window should retain the arrangement where it still fits.
    for (const icon of icons) moveWithin(icon, icon.x, icon.y);
    // Keep an in-progress drag inside the new area without interrupting it.
    if (active) active.limits = bounds(active.icon);
  });

  document.documentElement.classList.add('icons-draggable');
})();
