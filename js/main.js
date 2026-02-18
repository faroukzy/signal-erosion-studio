/* ============================================
   Signal Erosion Studio — Main JS
   ============================================ */

(function () {
  'use strict';

  // --- Mobile Navigation ---
  var navToggle = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
      });
    });
  }

  // --- Gallery Filtering ---
  var filterTabs = document.querySelectorAll('.filter-tab');
  var galleryCards = document.querySelectorAll('.gallery-card');

  if (filterTabs.length > 0) {
    var params = new URLSearchParams(window.location.search);
    var initialCategory = params.get('category');

    if (initialCategory) {
      filterTabs.forEach(function (tab) {
        tab.classList.remove('active');
        if (tab.dataset.filter === initialCategory) {
          tab.classList.add('active');
        }
      });
      applyFilter(initialCategory);
    }

    filterTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        filterTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        applyFilter(tab.dataset.filter);
      });
    });
  }

  function applyFilter(category) {
    galleryCards.forEach(function (card) {
      if (category === 'all' || card.dataset.category === category) {
        card.style.display = '';
        card.style.opacity = '0';
        card.style.transform = 'translateY(10px)';
        requestAnimationFrame(function () {
          card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
      } else {
        card.style.display = 'none';
      }
    });
  }

  // =============================================
  // Art Viewer — full zoom/pan image viewer
  // =============================================

  var MIN_SCALE = 0.5;
  var MAX_SCALE = 8;
  var ZOOM_STEP = 0.25;
  var WHEEL_FACTOR = 0.002;

  // State
  var viewer = null;
  var viewerImg = null;
  var viewerCanvas = null;
  var zoomLabel = null;
  var hintEl = null;
  var scale = 1;
  var fitScale = 1;
  var panX = 0;
  var panY = 0;
  var imgNatW = 0;
  var imgNatH = 0;
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var panStartX = 0;
  var panStartY = 0;
  var lastTouchDist = 0;
  var lastTouchMidX = 0;
  var lastTouchMidY = 0;
  var hintTimer = null;
  var didDrag = false;
  var DRAG_THRESHOLD = 5; // pixels of movement before it counts as a drag

  // Build viewer DOM (once)
  function buildViewer() {
    if (viewer) return;

    viewer = document.createElement('div');
    viewer.className = 'art-viewer';
    viewer.id = 'art-viewer';

    viewer.innerHTML =
      '<button class="art-viewer-close" title="Close (Esc)">ESC</button>' +
      '<div class="art-viewer-hint" id="av-hint">Scroll to zoom &middot; Drag to pan<br>+ / \u2212 keys &middot; 0 to reset</div>' +
      '<div class="art-viewer-canvas" id="av-canvas">' +
        '<img id="av-img" alt="">' +
      '</div>' +
      '<div class="art-viewer-controls">' +
        '<button class="art-viewer-btn" id="av-zoom-out" title="Zoom out (\u2212)">' +
          '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>' +
        '</button>' +
        '<span class="art-viewer-zoom-level" id="av-zoom-level">100%</span>' +
        '<button class="art-viewer-btn" id="av-zoom-in" title="Zoom in (+)">' +
          '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>' +
        '</button>' +
        '<div class="art-viewer-divider"></div>' +
        '<button class="art-viewer-btn" id="av-fit" title="Fit to screen (0)">Fit</button>' +
        '<button class="art-viewer-btn" id="av-full" title="Full size (1)">1:1</button>' +
      '</div>';

    document.body.appendChild(viewer);

    viewerCanvas = document.getElementById('av-canvas');
    viewerImg = document.getElementById('av-img');
    zoomLabel = document.getElementById('av-zoom-level');
    hintEl = document.getElementById('av-hint');

    // --- Control buttons ---
    document.getElementById('av-zoom-in').addEventListener('click', function (e) {
      e.stopPropagation();
      zoomBy(ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('av-zoom-out').addEventListener('click', function (e) {
      e.stopPropagation();
      zoomBy(-ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('av-fit').addEventListener('click', function (e) {
      e.stopPropagation();
      zoomToFit(true);
    });

    document.getElementById('av-full').addEventListener('click', function (e) {
      e.stopPropagation();
      zoomToActual();
    });

    viewer.querySelector('.art-viewer-close').addEventListener('click', closeViewer);

    // --- Mouse wheel zoom ---
    viewerCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = -e.deltaY * WHEEL_FACTOR;
      zoomBy(delta, e.clientX, e.clientY);
    }, { passive: false });

    // --- Mouse drag pan ---
    viewerCanvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      isDragging = true;
      didDrag = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      viewerCanvas.classList.add('dragging');
    });

    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        didDrag = true;
      }
      panX = panStartX + dx;
      panY = panStartY + dy;
      applyTransform(false);
    });

    window.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        viewerCanvas.classList.remove('dragging');
      }
    });

    // --- Touch: pinch zoom + drag pan ---
    viewerCanvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        isDragging = true;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        panStartX = panX;
        panStartY = panY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        lastTouchDist = touchDist(e.touches);
        lastTouchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }, { passive: true });

    viewerCanvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        panX = panStartX + (e.touches[0].clientX - dragStartX);
        panY = panStartY + (e.touches[0].clientY - dragStartY);
        applyTransform(false);
      } else if (e.touches.length === 2) {
        var dist = touchDist(e.touches);
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        var factor = dist / lastTouchDist;
        var newScale = clampScale(scale * factor);
        var delta = newScale / scale;

        panX = midX - delta * (midX - panX) + (midX - lastTouchMidX);
        panY = midY - delta * (midY - panY) + (midY - lastTouchMidY);
        scale = newScale;

        lastTouchDist = dist;
        lastTouchMidX = midX;
        lastTouchMidY = midY;
        applyTransform(false);
        updateZoomLabel();
      }
    }, { passive: false });

    viewerCanvas.addEventListener('touchend', function () {
      isDragging = false;
    });

    // --- Double-click/tap to toggle fit/actual ---
    viewerCanvas.addEventListener('dblclick', function (e) {
      e.preventDefault();
      // If close to fit scale, go to 1:1. Otherwise go to fit.
      if (Math.abs(scale - fitScale) < 0.05) {
        zoomToActual();
      } else {
        zoomToFit(true);
      }
    });

    // --- Keyboard controls ---
    document.addEventListener('keydown', function (e) {
      if (!viewer.classList.contains('active')) return;

      var cx = window.innerWidth / 2;
      var cy = window.innerHeight / 2;

      switch (e.key) {
        case 'Escape':
          closeViewer();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomBy(ZOOM_STEP, cx, cy);
          break;
        case '-':
        case '_':
          e.preventDefault();
          zoomBy(-ZOOM_STEP, cx, cy);
          break;
        case '0':
          e.preventDefault();
          zoomToFit(true);
          break;
        case '1':
          e.preventDefault();
          zoomToActual();
          break;
        case 'ArrowUp':
          e.preventDefault();
          panY += 80;
          applyTransform(true);
          break;
        case 'ArrowDown':
          e.preventDefault();
          panY -= 80;
          applyTransform(true);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          panX += 80;
          applyTransform(true);
          break;
        case 'ArrowRight':
          e.preventDefault();
          panX -= 80;
          applyTransform(true);
          break;
      }
    });

    // --- Click backdrop to close (only if it was a true click, not a drag) ---
    viewerCanvas.addEventListener('click', function (e) {
      if (didDrag) return; // was a drag, not a click
      if (e.target === viewerCanvas) {
        closeViewer();
      }
    });
  }

  // --- Zoom math ---
  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function zoomBy(delta, pivotX, pivotY) {
    var newScale = clampScale(scale + delta);
    if (newScale === scale) return;
    var factor = newScale / scale;

    // Zoom centered on pivot point
    panX = pivotX - factor * (pivotX - panX);
    panY = pivotY - factor * (pivotY - panY);
    scale = newScale;

    applyTransform(true);
    updateZoomLabel();
  }

  function zoomToFit(animate) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var padding = 40;
    fitScale = Math.min((vw - padding * 2) / imgNatW, (vh - padding * 2) / imgNatH);
    fitScale = Math.min(fitScale, 1); // don't upscale beyond 1:1
    scale = fitScale;

    panX = (vw - imgNatW * scale) / 2;
    panY = (vh - imgNatH * scale) / 2;

    applyTransform(animate);
    updateZoomLabel();
  }

  function zoomToActual() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    scale = 1;

    // Center the image at 1:1
    panX = (vw - imgNatW) / 2;
    panY = (vh - imgNatH) / 2;

    applyTransform(true);
    updateZoomLabel();
  }

  function applyTransform(animate) {
    if (!viewerImg) return;
    viewerImg.style.transition = animate ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
    viewerImg.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
  }

  function updateZoomLabel() {
    if (zoomLabel) {
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }
  }

  function touchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- Open / Close ---
  function openViewer(src, alt) {
    buildViewer();
    viewerImg.alt = alt || '';

    // Preload via a separate Image object to reliably get dimensions
    var loader = new Image();
    loader.onload = function () {
      imgNatW = loader.naturalWidth;
      imgNatH = loader.naturalHeight;
      viewerImg.src = src;
      showViewer();
    };
    loader.src = src;

    // If already cached, onload may have fired synchronously — check
    if (loader.complete && loader.naturalWidth > 0) {
      imgNatW = loader.naturalWidth;
      imgNatH = loader.naturalHeight;
      viewerImg.src = src;
      showViewer();
    }
  }

  var viewerShown = false; // guard against double showViewer from cache path
  function showViewer() {
    if (viewerShown) return;
    viewerShown = true;

    // Make viewer visible first, then center on next frame
    viewer.classList.add('active');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      zoomToFit(false);

      // Show hint briefly
      clearTimeout(hintTimer);
      hintEl.classList.add('visible');
      hintTimer = setTimeout(function () {
        hintEl.classList.remove('visible');
      }, 2500);
    });
  }

  function closeViewer() {
    if (!viewer) return;
    viewer.classList.remove('active');
    document.body.style.overflow = '';
    isDragging = false;
    didDrag = false;
    viewerShown = false;
    clearTimeout(hintTimer);
    hintEl.classList.remove('visible');
  }

  // --- Bind triggers ---
  // Any element with data-lightbox opens the viewer.
  // It looks for an img inside, or uses data-src for the full-res image.
  document.querySelectorAll('[data-lightbox]').forEach(function (trigger) {
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var img = trigger.querySelector('img');
      var src = trigger.dataset.src || (img ? img.src : '');
      var alt = img ? img.alt : '';
      if (src) openViewer(src, alt);
    });
  });

  // --- Scroll Fade-In ---
  var fadeElements = document.querySelectorAll('.fade-in');

  if (fadeElements.length > 0 && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    fadeElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

})();
