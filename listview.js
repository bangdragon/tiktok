document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("list-view")) return;

  // ========== CACHE MANAGER (IN-MEMORY ONLY) ==========
  const CACHE_VERSION = 'v3';
  const imageCache = new Map();

  const postCache = {
    maxSize: 15,
    cache: new Map(),
    get(url) { return this.cache.get(url) || null; },
    set(url, data) {
      const keys = Array.from(this.cache.keys());
      if (keys.length >= this.maxSize) this.cache.delete(keys[0]);
      this.cache.set(url, data);
    },
    clear() { this.cache.clear(); }
  };

  // ========== FETCH POST DATA (giữ nguyên logic của bạn) ==========
  async function fetchPostData(url) {
    const cached = postCache.get(url);
    if (cached) return cached;
    try {
      const res = await fetch(url);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const images = [];
      const separators = doc.querySelectorAll('.separator a[href]');
      separators.forEach(link => {
        let imgUrl = link.href;
        if (imgUrl && !imgUrl.includes('blogger.googleusercontent.com/tracker')) {
          images.push(imgUrl);
        }
      });

      const postBody = doc.querySelector('.post-body');
      let textContent = '';
      if (postBody) {
        const clone = postBody.cloneNode(true);
        clone.querySelectorAll('img, .separator').forEach(el => el.remove());
        textContent = clone.innerHTML;
      }

      let commentsUrl = null;
      const commentsFrame = doc.querySelector('iframe[src*="blogger.com/comment"]');
      if (commentsFrame) commentsUrl = commentsFrame.src;

      if (!commentsUrl) {
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
          const content = script.textContent;
          if (content && content.includes('commentIframeUrl')) {
            const match = content.match(/commentIframeUrl["'\s:]+([^"']+)/);
            if (match) commentsUrl = match[1];
          }
        });
      }

      if (!commentsUrl) {
        const blogIdMatch = html.match(/blogId[=:"'\s]+(\d+)/);
        const postIdMatch = html.match(/postId[=:"'\s]+(\d+)/);
        if (blogIdMatch && postIdMatch) {
          commentsUrl = `https://www.blogger.com/comment-iframe.g?blogID=${blogIdMatch[1]}&postID=${postIdMatch[1]}`;
        }
      }

      const data = { images, textContent, commentsUrl };
      postCache.set(url, data);
      return data;
    } catch (e) {
      console.error('Fetch error:', e);
      return { images: [], textContent: '', commentsUrl: null };
    }
  }

  // ========== PRELOAD IMAGES ==========
  function preloadImages(urls) {
    urls.forEach(url => {
      if (!url) return;
      if (!imageCache.has(url)) {
        const img = new Image();
        img.src = url;
        imageCache.set(url, img);
      }
    });
  }

  // ========== HISTORY MANAGER ==========
  const historyManager = {
    state: { drawer: null, gallery: false },
    push(type) {
      if (type === 'gallery') { this.state.gallery = true; history.pushState({ galleryOpen: true }, ''); }
      else if (type === 'drawer') { this.state.drawer = type; history.pushState({ drawerOpen: type }, ''); }
    },
    pop() {
      if (this.state.drawer) { closeDrawer(); this.state.drawer = null; return true; }
      if (this.state.gallery) { closeGallery(); this.state.gallery = false; return true; }
      return false;
    }
  };
  window.addEventListener('popstate', () => historyManager.pop());

  // ========== DRAWER MANAGER (giữ nguyên) ==========
  let currentDrawer = null;
  function createDrawer(type, content, postUrl) {
    closeDrawer();
    const drawer = document.createElement('div');
    drawer.className = 'custom-drawer';
    const heightClass = type === 'content' ? 'drawer-90' : '';
    drawer.innerHTML = `
      <div class="drawer-overlay"></div>
      <div class="drawer-content ${heightClass}">
        <div class="drawer-header">
          <button class="drawer-close">✕</button>
        </div>
        <div class="drawer-body">${content}</div>
      </div>
    `;
    document.body.appendChild(drawer);
    currentDrawer = drawer;
    requestAnimationFrame(() => drawer.classList.add('active'));
    const overlay = drawer.querySelector('.drawer-overlay');
    const drawerContent = drawer.querySelector('.drawer-content');
    const closeBtn = drawer.querySelector('.drawer-close');
    let startY = 0, currentY = 0;
    drawerContent.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    drawerContent.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) drawerContent.style.transform = `translateY(${diff}px)`;
    }, { passive: true });
    drawerContent.addEventListener('touchend', () => {
      const diff = currentY - startY;
      if (diff > 100) closeDrawer();
      else drawerContent.style.transform = '';
    });
    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    historyManager.push('drawer');
  }
  function closeDrawer() {
    if (!currentDrawer) return;
    currentDrawer.classList.remove('active');
    setTimeout(() => { currentDrawer?.remove(); currentDrawer = null; }, 300);
  }

  // ========== LOADING INDICATOR (giữ nguyên) ==========
  function showLoading() {
    if (document.getElementById('gallery-loading')) return;
    const loading = document.createElement('div');
    loading.id = 'gallery-loading';
    loading.innerHTML = `
      <div class="loading-overlay"></div>
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Đang tải...</p>
      </div>
    `;
    document.body.appendChild(loading);
    const style = document.createElement('style');
    style.textContent = `
      #gallery-loading{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998}
      #gallery-loading .loading-overlay{position:absolute;inset:0;background:rgba(0,0,0,.8)}
      #gallery-loading .loading-spinner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
      #gallery-loading .spinner{width:24px;height:24px;margin:0 auto 10px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
      #gallery-loading p{color:#fff;font-size:14px;margin:0}
      @keyframes spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }
  function hideLoading() { const loading = document.getElementById('gallery-loading'); if (loading) loading.remove(); }

  // ========== UTIL: get list of article elements, next/prev ==========
  function getArticles() { return Array.from(document.querySelectorAll('article')); }
  function getNextArticle(el) {
    const articles = getArticles();
    const idx = articles.indexOf(el);
    return (idx === -1 || idx === articles.length - 1) ? null : articles[idx + 1];
  }
  function getPrevArticle(el) {
    const articles = getArticles();
    const idx = articles.indexOf(el);
    return (idx <= 0) ? null : articles[idx - 1];
  }

  // ========== GALLERY 2-LAYER MANAGER ==========
  const galleryStack = document.getElementById('gallery-stack');
  // use let so we can swap references
  let layerCurrent = document.getElementById('gallery-current');
  let layerNext = document.getElementById('gallery-next');

  let currentPostData = null; // { images: [], textContent, commentsUrl, url, article }
  let nextPostData = null;
  let currentImageIndex = 0;

  // pointer handlers refs so we can remove them safely
  let pointerHandlers = { move: null, up: null };

  let gesture = { startY: 0, currentY: 0, dragging: false };

  // Set content of a layer from postData and image index
  function setLayerContent(layerEl, postData, imageIndex = 0) {
    layerEl.innerHTML = ''; // clear
    if (!postData || !postData.images || postData.images.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      layerEl.appendChild(ph);
      return;
    }

    const img = document.createElement('img');
    img.className = 'gallery-img';
    img.draggable = false;
    img.alt = '';
    img.src = postData.images[Math.max(0, Math.min(imageIndex, postData.images.length - 1))];

    const caption = document.createElement('div');
    caption.className = 'gallery-caption';
    caption.innerHTML = `<div>${postData.images.length > 1 ? `Ảnh ${imageIndex+1}/${postData.images.length}` : ''}</div>`;

    const nav = document.createElement('div');
    nav.className = 'gallery-nav';
    const btnPrev = document.createElement('button');
    btnPrev.innerText = '‹';
    const btnNext = document.createElement('button');
    btnNext.innerText = '›';
    if (postData.images.length > 1) { btnPrev.style.display = 'block'; btnNext.style.display = 'block'; }
    else { btnPrev.style.display = 'none'; btnNext.style.display = 'none'; }
    nav.appendChild(btnPrev);
    nav.appendChild(btnNext);

    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      currentImageIndex = Math.max(0, currentImageIndex - 1);
      img.src = postData.images[currentImageIndex];
      preloadImages([postData.images[currentImageIndex - 1], postData.images[currentImageIndex + 1]]);
    });

    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      currentImageIndex = Math.min(postData.images.length - 1, currentImageIndex + 1);
      img.src = postData.images[currentImageIndex];
      preloadImages([postData.images[currentImageIndex - 1], postData.images[currentImageIndex + 1]]);
    });

    img.addEventListener('click', (e) => {
      if (postData.images.length > 1) {
        currentImageIndex = Math.min(postData.images.length - 1, currentImageIndex + 1);
        img.src = postData.images[currentImageIndex];
        preloadImages([postData.images[currentImageIndex + 1]]);
      } else {
        const toggleBtn = document.querySelector('.ui-toggle-visibility');
        if (toggleBtn) toggleBtn.dispatchEvent(new Event('touchstart'));
      }
    });

    layerEl.appendChild(img);
    layerEl.appendChild(nav);
    layerEl.appendChild(caption);
  }

  // Preload adjacent posts
  async function preloadAdjacentPosts(article) {
    const nextArticle = getNextArticle(article);
    const prevArticle = getPrevArticle(article);
    const tasks = [];
    if (nextArticle) {
      const url = nextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (url && !postCache.get(url)) {
        tasks.push(fetchPostData(url).then(data => { if (data.images[0]) preloadImages([data.images[0]]); }));
      }
    }
    if (prevArticle) {
      const url = prevArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (url && !postCache.get(url)) tasks.push(fetchPostData(url));
    }
    Promise.all(tasks).catch(() => {});
  }

  // Open gallery from article element
  async function openGallery(article, skipHistory = false) {
    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) return;

    showLoading();
    uiVisible = false;

    const postData = await fetchPostData(postUrl);
    if (!postData.images || postData.images.length === 0) {
      hideLoading();
      alert('Không tìm thấy ảnh trong bài viết');
      return;
    }

    currentPostData = { ...postData, url: postUrl, article };
    preloadImages(currentPostData.images);
    preloadAdjacentPosts(article);

    const nextArticle = getNextArticle(article);
    if (nextArticle) {
      const nextUrl = nextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      nextPostData = nextUrl ? await fetchPostData(nextUrl) : null;
    } else {
      nextPostData = null;
    }

    currentImageIndex = 0;
    setLayerContent(layerCurrent, currentPostData, currentImageIndex);
    setLayerContent(layerNext, nextPostData, 0);

    // ensure visual order: current above next
    layerCurrent.style.zIndex = '2';
    layerNext.style.zIndex = '1';

    galleryStack.style.display = 'block';
    galleryStack.setAttribute('aria-hidden', 'false');

    // reset transforms quickly without transition to avoid flicker
    layerCurrent.style.transition = 'none';
    layerNext.style.transition = 'none';
    layerCurrent.style.transform = 'translateY(0)';
    layerNext.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => {
      layerCurrent.style.transition = '';
      layerNext.style.transition = '';
    });

    hideLoading();
    // add custom UI for this post
    addCustomUI(currentPostData.url, currentPostData.article);
    initLayerGestures();

    if (!skipHistory) historyManager.push('gallery');
  }

  // Close gallery
  function closeGallery() {
    // animate down and hide
    layerCurrent.style.transition = 'transform .3s ease';
    layerCurrent.style.transform = 'translateY(100vh)';
    setTimeout(() => {
      galleryStack.style.display = 'none';
      galleryStack.setAttribute('aria-hidden', 'true');
      layerCurrent.innerHTML = '';
      layerNext.innerHTML = '';
      currentPostData = null;
      nextPostData = null;
      currentImageIndex = 0;
      // remove UI
      const existingUI = document.querySelector('.gallery-custom-ui');
      if (existingUI) existingUI.remove();
      // remove pointer handlers
      removePointerHandlers();
    }, 300);
  }

  // Remove pointer handlers safely
  function removePointerHandlers() {
    if (pointerHandlers.move) window.removeEventListener('pointermove', pointerHandlers.move);
    if (pointerHandlers.up) {
      window.removeEventListener('pointerup', pointerHandlers.up);
      window.removeEventListener('pointercancel', pointerHandlers.up);
    }
    pointerHandlers.move = null;
    pointerHandlers.up = null;
    // also remove pointerdown on previous layer
    if (layerCurrent) {
      try { layerCurrent.removeEventListener('pointerdown', layerCurrent._pointerDownHandler); } catch(e) {}
      layerCurrent._pointerDownHandler = null;
    }
  }

  // Switch to next post (animate current up, reveal next)
  async function switchToNextPost() {
    if (!nextPostData) {
      // nothing next - reset transform
      layerCurrent.style.transition = 'transform .25s ease';
      layerCurrent.style.transform = 'translateY(0)';
      layerNext.style.transform = 'translateY(100%)';
      return;
    }

    // animate
    layerCurrent.style.transition = 'transform .35s cubic-bezier(0.4,0,0.2,1)';
    layerNext.style.transition = 'transform .35s cubic-bezier(0.4,0,0.2,1)';
    layerCurrent.style.transform = 'translateY(-100%)';
    layerNext.style.transform = 'translateY(0)';

    // wait for animation to complete
    await new Promise(res => setTimeout(res, 360));

    // At this point layerNext is visible and layerCurrent is offscreen (above).
    // We'll *swap the JS references* so layerCurrent always points to the visible top layer.
    // But to keep DOM elements (so any event listeners inside image remain intact), we just swap references.
    const oldLayerCurrent = layerCurrent;
    const oldLayerNext = layerNext;

    // Swap references
    layerCurrent = oldLayerNext;
    layerNext = oldLayerCurrent;

    // Ensure z-index: current (visible) above
    layerCurrent.style.zIndex = '2';
    layerNext.style.zIndex = '1';

    // Reset transforms *without transition* to instant positions so user doesn't see jump
    layerCurrent.style.transition = 'none';
    layerNext.style.transition = 'none';
    layerCurrent.style.transform = 'translateY(0)';
    layerNext.style.transform = 'translateY(100%)';

    // update currentPostData to nextPostData; then load new nextPostData
    const prevArticle = currentPostData?.article || null;
    currentPostData = nextPostData;
    currentImageIndex = 0;

    // load the following article as nextPostData
    const newNextArticle = getNextArticle(currentPostData.article);
    if (newNextArticle) {
      const nextUrl = newNextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      nextPostData = nextUrl ? await fetchPostData(nextUrl) : null;
    } else {
      nextPostData = null;
    }

    // fill content: layerCurrent already contains the DOM of previous layerNext (we swapped), but we want to ensure it reflects currentPostData:
    // simplest: replace content of layerCurrent with canonical content for currentPostData (keeps predictable structure).
    setLayerContent(layerCurrent, currentPostData, currentImageIndex);
    setLayerContent(layerNext, nextPostData, 0);

    // small timeout then re-enable transitions
    requestAnimationFrame(() => {
      layerCurrent.style.transition = '';
      layerNext.style.transition = '';
    });

    // update UI for new current post
    addCustomUI(currentPostData.url, currentPostData.article);

    // preload
    preloadImages(currentPostData.images || []);
    if (nextPostData && nextPostData.images) preloadImages([nextPostData.images[0]]);
    preloadAdjacentPosts(currentPostData.article);

    // re-init gestures for the (new) layerCurrent
    removePointerHandlers();
    initLayerGestures();
  }

  // Initialize gestures for layerCurrent (pointer events)
  function initLayerGestures() {
    // remove existing handlers first
    removePointerHandlers();

    gesture = { startY: 0, currentY: 0, dragging: false };

    // pointerdown handler
    const onPointerDown = (ev) => {
      // only primary button / touch
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      gesture.startY = ev.clientY;
      gesture.currentY = ev.clientY;
      gesture.dragging = true;
      // temporary remove transitions for direct dragging feel
      layerCurrent.style.transition = 'none';
      layerNext.style.transition = 'none';
    };

    // move handler
    const onPointerMove = (ev) => {
      if (!gesture.dragging) return;
      gesture.currentY = ev.clientY;
      const diff = gesture.currentY - gesture.startY;
      if (diff < 0) {
        // swipe up -> reveal next
        layerCurrent.style.transform = `translateY(${diff}px)`;
        const p = Math.min(1, Math.abs(diff) / window.innerHeight);
        layerNext.style.transform = `translateY(${100 - p * 100}%)`;
      } else {
        // swipe down -> scale + move down
        const scale = Math.max(0.85, 1 - (diff / 1200));
        layerCurrent.style.transform = `translateY(${diff}px) scale(${scale})`;
      }
    };

    // up/cancel handler
    const onPointerUp = async (ev) => {
      if (!gesture.dragging) return;
      gesture.dragging = false;
      const diff = gesture.currentY - gesture.startY;
      const threshold = Math.min(150, window.innerHeight * 0.12);
      // re-enable smooth transitions
      layerCurrent.style.transition = 'transform .25s ease';
      layerNext.style.transition = 'transform .25s ease';

      if (diff < -threshold) {
        // go to next post
        await switchToNextPost();
      } else if (diff > threshold) {
        // close
        layerCurrent.style.transform = `translateY(100vh) scale(0.9)`;
        setTimeout(() => closeGallery(), 260);
      } else {
        // reset
        layerCurrent.style.transform = 'translateY(0) scale(1)';
        layerNext.style.transform = 'translateY(100%)';
      }
    };

    // attach and store handlers for removal later
    pointerHandlers.move = onPointerMove;
    pointerHandlers.up = onPointerUp;
    layerCurrent._pointerDownHandler = onPointerDown;

    layerCurrent.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  // ========== REUSE addCustomUI (slightly adapted) ==========
  let uiVisible = false;
  function addCustomUI(postUrl, article) {
    // remove existing UI
    const existing = document.querySelector('.gallery-custom-ui');
    if (existing) existing.remove();

    const uiContainer = document.createElement('div');
    uiContainer.className = 'gallery-custom-ui';

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'ui-btn ui-reload';
    reloadBtn.title = 'Tải lại';
    reloadBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    const commentBtn = document.createElement('button');
    commentBtn.className = 'ui-btn ui-comment';
    commentBtn.title = 'Bình luận';
    commentBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    const linkBtn = document.createElement('a');
    linkBtn.className = 'ui-btn ui-link';
    linkBtn.href = postUrl;
    linkBtn.title = 'Mở bài viết';
    linkBtn.target = "_blank";
    linkBtn.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1.5 1.5"/><path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 1 1-7-7l1.5-1.5"/></svg>';

    const contentBtn = document.createElement('button');
    contentBtn.className = 'ui-btn ui-post-content';
    contentBtn.title = 'Nội dung bài viết';
    contentBtn.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h6M8 16h4"/></svg>';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ui-btn ui-toggle-visibility';
    toggleBtn.title = 'Ẩn/Hiện UI';
    toggleBtn.innerHTML = '<svg class="icon-eye" width="24" style="display:none" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
                           '<svg class="icon-eye-slash" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    uiContainer.appendChild(reloadBtn);
    uiContainer.appendChild(commentBtn);
    uiContainer.appendChild(linkBtn);
    uiContainer.appendChild(contentBtn);
    uiContainer.appendChild(toggleBtn);
    document.body.appendChild(uiContainer);

    [reloadBtn, commentBtn, linkBtn, contentBtn].forEach(b => b.style.display = 'none');

    reloadBtn.addEventListener('click', async () => {
      postCache.cache.delete(postUrl);
      const newData = await fetchPostData(postUrl);
      currentPostData = { ...newData, url: postUrl, article: currentPostData.article };
      alert("Đã tải lại bài viết");
      currentImageIndex = 0;
      setLayerContent(layerCurrent, currentPostData, currentImageIndex);
    });

    commentBtn.addEventListener('click', () => { window.location.href = postUrl + "#comments"; });

    contentBtn.addEventListener("click", () => {
      let html = currentPostData?.textContent?.trim() || "";
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      if (tmp.textContent.trim().length === 0) {
        html = `<p style="text-align:center;opacity:.6;padding:25px">Chưa có nội dung</p>`;
      }
      createDrawer("content", html);
    });

    const iconEye = toggleBtn.querySelector('.icon-eye');
    const iconEyeSlash = toggleBtn.querySelector('.icon-eye-slash');
    const buttons = [reloadBtn, commentBtn, linkBtn, contentBtn];

    function toggleUIHandler(e) {
      e && e.preventDefault && e.preventDefault();
      e && e.stopPropagation && e.stopPropagation();
      uiVisible = !uiVisible;
      if (uiVisible) {
        iconEye.style.display = 'block';
        iconEyeSlash.style.display = 'none';
        buttons.forEach(b => b.style.display = 'flex');
      } else {
        iconEye.style.display = 'none';
        iconEyeSlash.style.display = 'block';
        buttons.forEach(b => b.style.display = 'none');
      }
      return false;
    }

    toggleBtn.addEventListener('mousedown', toggleUIHandler, true);
    toggleBtn.addEventListener('touchstart', toggleUIHandler, true);
  }

  // ========== EVENT LISTENERS TO ATTACH ON ARTICLES ==========
  function attachArticleEvents() {
    const articles = document.querySelectorAll('article');
    articles.forEach(article => {
      if (article.dataset.galleryAttached) return;
      article.dataset.galleryAttached = 'true';
      article.querySelectorAll('a').forEach(link => {
        if (link.href && !link.dataset.postUrl) link.dataset.postUrl = link.href;
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          openGallery(article);
          return false;
        }, true);
      });
    });
  }
  setTimeout(attachArticleEvents, 500);

  const observer = new MutationObserver((mutations) => {
    let hasNew = false;
    mutations.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && (n.tagName === 'ARTICLE' || (n.querySelector && n.querySelector('article')))) {
          hasNew = true;
        }
      });
    });
    if (hasNew) setTimeout(attachArticleEvents, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // expose some functions
  window.__myGallery = { openGallery, closeGallery, preloadImages, fetchPostData, postCache };
});
                          
