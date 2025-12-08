document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("list-view")) return;

  // ========== CACHE MANAGER ==========
  const imageCache = new Map();
  const postCache = {
    maxSize: 15,
    cache: new Map(),
    get(url) { return this.cache.get(url) || null; },
    set(url, data) {
      const keys = Array.from(this.cache.keys());
      if (keys.length >= this.maxSize) {
        this.cache.delete(keys[0]);
      }
      this.cache.set(url, data);
    }
  };

  // ========== FETCH POST DATA ==========
  async function fetchPostData(url) {
    const cached = postCache.get(url);
    if (cached) return cached;
    
    try {
      const res = await fetch(url);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const images = [];
      doc.querySelectorAll('.separator a[href]').forEach(link => {
        if (link.href && !link.href.includes('blogger.googleusercontent.com/tracker')) {
          images.push(link.href);
        }
      });
      
      const postBody = doc.querySelector('.post-body');
      let textContent = '';
      if (postBody) {
        const clone = postBody.cloneNode(true);
        clone.querySelectorAll('img, .separator').forEach(el => el.remove());
        textContent = clone.innerHTML;
      }
      
      const data = { images, textContent };
      postCache.set(url, data);
      return data;
    } catch (e) {
      console.error('Fetch error:', e);
      return { images: [], textContent: '' };
    }
  }

  // ========== PRELOAD ==========
  function preloadImages(urls) {
    urls.forEach(url => {
      if (!imageCache.has(url)) {
        const img = new Image();
        img.src = url;
        imageCache.set(url, img);
      }
    });
  }

  async function preloadAdjacentPosts(currentArticle) {
    const nextArticle = getNextArticle(currentArticle);
    const prevArticle = getPrevArticle(currentArticle);
    
    const tasks = [];
    
    if (nextArticle) {
      const url = nextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (url && !postCache.get(url)) {
        tasks.push(fetchPostData(url).then(data => {
          if (data.images[0]) preloadImages([data.images[0]]);
        }));
      }
    }
    
    if (prevArticle) {
      const url = prevArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (url && !postCache.get(url)) {
        tasks.push(fetchPostData(url));
      }
    }
    
    Promise.all(tasks).catch(() => {});
  }

  // ========== HISTORY ==========
  const historyManager = {
    state: { drawer: null, gallery: false },
    push(type) {
      if (type === 'gallery') {
        this.state.gallery = true;
        history.pushState({ galleryOpen: true }, '');
      } else if (type === 'drawer') {
        this.state.drawer = type;
        history.pushState({ drawerOpen: type }, '');
      }
    },
    pop() {
      if (this.state.drawer) {
        closeDrawer();
        this.state.drawer = null;
        return true;
      }
      if (this.state.gallery) {
        closeGallery();
        this.state.gallery = false;
        return true;
      }
      return false;
    }
  };

  window.addEventListener('popstate', () => historyManager.pop());

  // ========== DRAWER ==========
  let currentDrawer = null;

  function createDrawer(type, content) {
    closeDrawer();
    const drawer = document.createElement('div');
    drawer.className = 'custom-drawer';
    drawer.innerHTML = `
      <div class="drawer-overlay"></div>
      <div class="drawer-content ${type === 'content' ? 'drawer-90' : ''}">
        <div class="drawer-header"><button class="drawer-close">✕</button></div>
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
    drawerContent.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    
    drawerContent.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) drawerContent.style.transform = `translateY(${diff}px)`;
    }, { passive: true });
    
    drawerContent.addEventListener('touchend', () => {
      if (currentY - startY > 100) closeDrawer();
      else drawerContent.style.transform = '';
    });
    
    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    historyManager.push('drawer');
  }

  function closeDrawer() {
    if (!currentDrawer) return;
    currentDrawer.classList.remove('active');
    setTimeout(() => {
      currentDrawer?.remove();
      currentDrawer = null;
    }, 300);
  }

  // ========== LOADING ==========
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
  }

  function hideLoading() {
    document.getElementById('gallery-loading')?.remove();
  }

  // ========== NAVIGATION ==========
  function getNextArticle(current) {
    const articles = Array.from(document.querySelectorAll('article'));
    const idx = articles.indexOf(current);
    return (idx === -1 || idx === articles.length - 1) ? null : articles[idx + 1];
  }

  function getPrevArticle(current) {
    const articles = Array.from(document.querySelectorAll('article'));
    const idx = articles.indexOf(current);
    return (idx === -1 || idx === 0) ? null : articles[idx - 1];
  }

  // ========== SWIPE STATE ==========
  let swipeState = {
    startY: 0,
    currentY: 0,
    isDragging: false,
    isTransitioning: false
  };

  // ========== GALLERY MANAGER ==========
  let lgInstance = null;
  let currentPostData = null;
  let uiVisible = false;
  let nextGalleryData = null; // Lưu data của gallery tiếp theo

  async function transitionToNextPost(nextArticle) {
    if (swipeState.isTransitioning || !nextArticle) return;
    swipeState.isTransitioning = true;

    const currentGallery = document.getElementById('lightgallery');
    const currentUI = document.querySelector('.gallery-custom-ui');
    
    // Lấy data của bài viết tiếp theo (đã được preload)
    const nextUrl = nextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!nextUrl) {
      swipeState.isTransitioning = false;
      return;
    }

    const nextData = await fetchPostData(nextUrl);
    if (!nextData.images.length) {
      swipeState.isTransitioning = false;
      return;
    }

    // Tạo gallery mới TRƯỚC KHI xóa gallery cũ
    const newGalleryEl = document.createElement('div');
    newGalleryEl.id = 'lightgallery-next';
    newGalleryEl.style.cssText = 'display:none; position:fixed; top:100%; left:0; width:100%; height:100%; z-index:99998;';
    document.body.appendChild(newGalleryEl);

    const items = nextData.images.map(src => ({ src, thumb: src }));
    const newLgInstance = lightGallery(newGalleryEl, {
      dynamic: true,
      dynamicEl: items,
      thumbnail: false,
      download: false,
      counter: false,
      loop: true,
      swipeToClose: false,
      escKey: false
    });

    // Mở gallery mới (vẫn ở dưới)
    newLgInstance.openGallery(0);

    // Chờ gallery mới render xong
    await new Promise(resolve => setTimeout(resolve, 100));

    const newOuter = document.querySelector('#lightgallery-next .lg-outer');
    if (newOuter) {
      newOuter.style.cssText = 'opacity: 1; transition: none;';
    }

    // Animation đồng bộ: cũ đi lên, mới theo sau
    if (currentGallery) {
      const currentOuter = currentGallery.querySelector('.lg-outer');
      if (currentOuter) {
        currentOuter.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        currentOuter.style.transform = 'translateY(-100%)';
      }
    }

    if (newOuter) {
      newGalleryEl.style.display = 'block';
      newGalleryEl.style.transition = 'top 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      await new Promise(resolve => setTimeout(resolve, 50));
      newGalleryEl.style.top = '0';
    }

    // Đợi animation hoàn tất
    await new Promise(resolve => setTimeout(resolve, 400));

    // Xóa gallery cũ
    removeSwipeToClose();
    if (lgInstance) {
      lgInstance.destroy();
      lgInstance = null;
    }
    currentGallery?.remove();
    currentUI?.remove();

    // Chuyển gallery mới thành gallery chính
    newGalleryEl.id = 'lightgallery';
    newGalleryEl.style.cssText = '';
    lgInstance = newLgInstance;

    // Update state
    currentPostData = { ...nextData, url: nextUrl, article: nextArticle };
    preloadImages(nextData.images);
    preloadAdjacentPosts(nextArticle);

    // Thêm UI và swipe handlers
    addCustomUI(nextUrl, nextArticle);
    initSwipeToClose();

    swipeState.isTransitioning = false;
  }

  function initSwipeToClose() {
    const lgOuter = document.querySelector('.lg-outer');
    if (!lgOuter) return;

    const swipeOverlay = document.createElement('div');
    swipeOverlay.className = 'lg-swipe-overlay';
    swipeOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: #000; opacity: 1; pointer-events: none; z-index: 1;
    `;
    lgOuter.insertBefore(swipeOverlay, lgOuter.firstChild);

    const handleTouchStart = (e) => {
      if (swipeState.isTransitioning) return;
      const target = e.target;
      if (target.closest('.gallery-custom-ui') || target.closest('.lg-toolbar')) return;

      swipeState.startY = e.touches[0].clientY;
      swipeState.isDragging = false;
      lgOuter.style.transition = 'none';
      swipeOverlay.style.transition = 'none';
    };

    const handleTouchMove = (e) => {
      if (swipeState.startY === 0 || swipeState.isTransitioning) return;

      swipeState.currentY = e.touches[0].clientY;
      const diffY = swipeState.currentY - swipeState.startY;

      if (Math.abs(diffY) > 10) {
        swipeState.isDragging = true;
        e.preventDefault();

        if (diffY > 0) {
          // Vuốt xuống - đóng
          const scale = Math.max(0.85, 1 - (diffY / 1000));
          const opacity = Math.max(0, 1 - (diffY / 400));
          lgOuter.style.transform = `translateY(${diffY}px) scale(${scale})`;
          swipeOverlay.style.opacity = opacity;
        } else {
          // Vuốt lên - chuyển bài
          const nextArticle = getNextArticle(currentPostData.article);
          if (nextArticle) {
            lgOuter.style.transform = `translateY(${diffY}px)`;
          } else {
            lgOuter.style.transform = `translateY(${diffY * 0.3}px)`;
          }
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!swipeState.isDragging || swipeState.isTransitioning) {
        swipeState.startY = 0;
        swipeState.currentY = 0;
        return;
      }

      const diffY = swipeState.currentY - swipeState.startY;
      const threshold = 100;

      lgOuter.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
      swipeOverlay.style.transition = 'opacity 0.3s ease';

      if (diffY > threshold) {
        // Đóng gallery
        lgOuter.style.transform = 'translateY(100vh) scale(0.8)';
        lgOuter.style.opacity = '0';
        swipeOverlay.style.opacity = '0';
        setTimeout(() => closeGallery(), 300);
      } else if (diffY < -threshold) {
        // Chuyển bài tiếp theo
        const nextArticle = getNextArticle(currentPostData.article);
        if (nextArticle) {
          await transitionToNextPost(nextArticle);
        } else {
          lgOuter.style.transform = '';
        }
      } else {
        // Reset
        lgOuter.style.transform = '';
        swipeOverlay.style.opacity = '1';
      }

      swipeState.startY = 0;
      swipeState.currentY = 0;
      swipeState.isDragging = false;
    };

    lgOuter.addEventListener('touchstart', handleTouchStart, { passive: true });
    lgOuter.addEventListener('touchmove', handleTouchMove, { passive: false });
    lgOuter.addEventListener('touchend', handleTouchEnd);

    lgOuter._swipeHandlers = { touchstart: handleTouchStart, touchmove: handleTouchMove, touchend: handleTouchEnd };
  }

  function removeSwipeToClose() {
    const lgOuter = document.querySelector('.lg-outer');
    if (!lgOuter?._swipeHandlers) return;

    const h = lgOuter._swipeHandlers;
    lgOuter.removeEventListener('touchstart', h.touchstart);
    lgOuter.removeEventListener('touchmove', h.touchmove);
    lgOuter.removeEventListener('touchend', h.touchend);
    delete lgOuter._swipeHandlers;

    lgOuter.querySelector('.lg-swipe-overlay')?.remove();
  }

  async function openGallery(article, skipLoading = false) {
    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) return;

    uiVisible = false;
    const cached = postCache.get(postUrl);

    if (!cached && !skipLoading) showLoading();

    const postData = await fetchPostData(postUrl);
    if (!postData.images.length) {
      hideLoading();
      if (!skipLoading) alert('Không tìm thấy ảnh trong bài viết');
      return;
    }

    currentPostData = { ...postData, url: postUrl, article };
    preloadImages(postData.images);
    preloadAdjacentPosts(article);

    const galleryEl = document.createElement('div');
    galleryEl.id = 'lightgallery';
    galleryEl.style.display = 'none';
    document.body.appendChild(galleryEl);

    const items = postData.images.map(src => ({ src, thumb: src }));

    lgInstance = lightGallery(galleryEl, {
      dynamic: true,
      dynamicEl: items,
      thumbnail: false,
      download: false,
      counter: false,
      loop: true,
      swipeToClose: false,
      escKey: false
    });

    addCustomUI(postUrl, article);

    requestAnimationFrame(() => {
      lgInstance.openGallery(0);
      setTimeout(() => {
        hideLoading();
        initSwipeToClose();
      }, 300);
    });

    if (!skipLoading) historyManager.push('gallery');
  }

  function closeGallery() {
    hideLoading();
    removeSwipeToClose();

    if (lgInstance) {
      lgInstance.destroy();
      lgInstance = null;
    }

    document.getElementById('lightgallery')?.remove();
    document.querySelector('.gallery-custom-ui')?.remove();
    closeDrawer();
    currentPostData = null;
    uiVisible = true;
  }

  function addCustomUI(postUrl, article) {
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
    toggleBtn.innerHTML = '<svg class="icon-eye" width="24" style="display:none" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><svg class="icon-eye-slash" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    uiContainer.appendChild(reloadBtn);
    uiContainer.appendChild(commentBtn);
    uiContainer.appendChild(linkBtn);
    uiContainer.appendChild(contentBtn);
    uiContainer.appendChild(toggleBtn);
    document.body.appendChild(uiContainer);

    reloadBtn.style.display = 'none';
    commentBtn.style.display = 'none';
    linkBtn.style.display = 'none';
    contentBtn.style.display = 'none';

    reloadBtn.addEventListener('click', async () => {
      postCache.cache.delete(postUrl);
      const newData = await fetchPostData(postUrl);
      currentPostData = { ...newData, url: postUrl, article: currentPostData.article };
      alert("Đã tải lại bài viết");
    });

    commentBtn.addEventListener('click', () => {
      window.location.href = postUrl + "#comments";
    });

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

    const toggleUI = (e) => {
      e.preventDefault();
      e.stopPropagation();
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
    };

    toggleBtn.addEventListener('mousedown', toggleUI, true);
    toggleBtn.addEventListener('touchstart', toggleUI, true);
  }

  // ========== EVENT LISTENERS ==========
  function attachArticleEvents() {
    const articles = document.querySelectorAll('article');
    articles.forEach(article => {
      if (article.dataset.galleryAttached) return;
      article.dataset.galleryAttached = 'true';

      article.querySelectorAll('a').forEach(link => {
        if (link.href && !link.dataset.postUrl) {
          link.dataset.postUrl = link.href;
        }
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
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
        if (n.nodeType === 1 && (n.tagName === 'ARTICLE' || n.querySelector('article'))) {
          hasNew = true;
        }
      });
    });
    if (hasNew) setTimeout(attachArticleEvents, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ========== INJECT STYLES ==========
  const style = document.createElement('style');
  style.textContent = `
    #gallery-loading {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999;
    }
    #gallery-loading .loading-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.8);
    }
    #gallery-loading .loading-spinner {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      text-align: center;
    }
    #gallery-loading .spinner {
      width: 24px; height: 24px; margin: 0 auto 10px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    #gallery-loading p { color: #fff; font-size: 14px; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .gallery-custom-ui { pointer-events: auto !important; z-index: 99999 !important; }
    .gallery-custom-ui .ui-btn { pointer-events: auto !important; }
  `;
  document.head.appendChild(style);
});
