document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("list-view")) return;

  // ========== CACHE MANAGER (IN-MEMORY ONLY) ==========
  const CACHE_VERSION = 'v3';
  const imageCache = new Map();

  const postCache = {
    maxSize: 15,
    cache: new Map(),
    
    get(url) {
      return this.cache.get(url) || null;
    },
    
    set(url, data) {
      const keys = Array.from(this.cache.keys());
      if (keys.length >= this.maxSize) {
        const oldest = keys[0];
        this.cache.delete(oldest);
      }
      this.cache.set(url, data);
    },
    
    clear() {
      this.cache.clear();
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
      if (commentsFrame) {
        commentsUrl = commentsFrame.src;
      }
      
      if (!commentsUrl) {
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
          const content = script.textContent;
          if (content.includes('commentIframeUrl')) {
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
      
      const data = {
        images,
        textContent,
        commentsUrl
      };
      
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
      if (!imageCache.has(url)) {
        const img = new Image();
        img.src = url;
        imageCache.set(url, img);
      }
    });
  }

  // ========== PRELOAD ADJACENT POSTS ==========
  async function preloadAdjacentPosts(currentArticle) {
    const nextArticle = getNextArticle(currentArticle);
    const prevArticle = getPrevArticle(currentArticle);
    
    const preloadPromises = [];
    
    // Preload next post (priority)
    if (nextArticle) {
      const nextUrl = nextArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (nextUrl && !postCache.get(nextUrl)) {
        preloadPromises.push(
          fetchPostData(nextUrl).then(data => {
            if (data.images.length > 0) {
              // Preload ảnh đầu tiên để hiện preview
              preloadImages([data.images[0]]);
            }
          })
        );
      }
    }
    
    // Preload previous post
    if (prevArticle) {
      const prevUrl = prevArticle.querySelector('a[data-post-url]')?.dataset.postUrl;
      if (prevUrl && !postCache.get(prevUrl)) {
        preloadPromises.push(fetchPostData(prevUrl));
      }
    }
    
    // Fire and forget - không chờ kết quả
    Promise.all(preloadPromises).catch(e => console.log('Preload error:', e));
  }

  // ========== HISTORY MANAGER ==========
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

  window.addEventListener('popstate', (e) => {
    historyManager.pop();
  });

  
  // ========== DRAWER MANAGER ==========
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
    
    requestAnimationFrame(() => {
      drawer.classList.add('active');
    });
    
    const overlay = drawer.querySelector('.drawer-overlay');
    const drawerContent = drawer.querySelector('.drawer-content');
    const closeBtn = drawer.querySelector('.drawer-close');
    
    let startY = 0;
    let currentY = 0;
    
    drawerContent.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    
    drawerContent.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        drawerContent.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });
    
    drawerContent.addEventListener('touchend', () => {
      const diff = currentY - startY;
      if (diff > 100) {
        closeDrawer();
      } else {
        drawerContent.style.transform = '';
      }
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
  
  // ========== LOADING INDICATOR ==========
  function showLoading() {
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
      #gallery-loading {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 99999;
      }
      
      #gallery-loading .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
      }
      
      #gallery-loading .loading-spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }
      
      #gallery-loading .spinner {
        width: 24px;
        height: 24px;
        margin: 0 auto 10px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      
      #gallery-loading p {
        color: #fff;
        font-size: 14px;
        margin: 0;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .gallery-custom-ui {
        pointer-events: auto !important;
        z-index: 99999 !important;
      }
      
      .gallery-custom-ui .ui-btn {
        pointer-events: auto !important;
      }
      
      /* Optimized TikTok-style transition */
      .lg-outer {
        transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease;
      }
      
      .lg-outer.transitioning {
        pointer-events: none;
      }
      
      .next-post-preview,
      .prev-post-preview {
        position: fixed;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        z-index: 99997;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: none;
        pointer-events: none;
      }
      
      .next-post-preview {
        top: 100%;
      }
      
      .prev-post-preview {
        top: -100%;
      }
      
      .next-post-preview.ready,
      .prev-post-preview.ready {
        opacity: 1;
      }
      
      .next-post-preview img,
      .prev-post-preview img {
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
      }
      
      /* Smooth image loading */
      .next-post-preview img,
      .prev-post-preview img {
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      
      .next-post-preview img.loaded,
      .prev-post-preview img.loaded {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  function hideLoading() {
    const loading = document.getElementById('gallery-loading');
    if (loading) {
      loading.remove();
    }
  }

  // ========== ARTICLE NAVIGATION ==========
  function getNextArticle(currentArticle) {
    const articles = Array.from(document.querySelectorAll('article'));
    const currentIndex = articles.indexOf(currentArticle);
    
    if (currentIndex === -1 || currentIndex === articles.length - 1) {
      return null;
    }
    
    return articles[currentIndex + 1];
  }

  function getPrevArticle(currentArticle) {
    const articles = Array.from(document.querySelectorAll('article'));
    const currentIndex = articles.indexOf(currentArticle);
    
    if (currentIndex === -1 || currentIndex === 0) {
      return null;
    }
    
    return articles[currentIndex - 1];
  }

  // ========== PREVIEW MANAGER ==========
  let nextPostPreview = null;
  let prevPostPreview = null;

  function createPostPreview(article, direction = 'next') {
    const preview = document.createElement('div');
    preview.className = direction === 'next' ? 'next-post-preview' : 'prev-post-preview';
    
    // Lấy ảnh đầu tiên từ article
    const firstImg = article.querySelector('img');
    if (firstImg) {
      const img = document.createElement('img');
      img.src = firstImg.src;
      
      // Thêm sự kiện load để fade in mượt
      img.onload = () => {
        img.classList.add('loaded');
        preview.classList.add('ready');
      };
      
      // Nếu ảnh đã được cache
      if (img.complete) {
        img.classList.add('loaded');
        preview.classList.add('ready');
      }
      
      preview.appendChild(img);
    } else {
      // Nếu không có ảnh, vẫn đánh dấu là ready
      preview.classList.add('ready');
    }
    
    document.body.appendChild(preview);
    
    return preview;
  }

  function initializePreview(currentArticle) {
    // Xóa preview cũ
    removeAllPreviews();
    
    // Tạo next preview
    const nextArticle = getNextArticle(currentArticle);
    if (nextArticle) {
      nextPostPreview = createPostPreview(nextArticle, 'next');
    }
    
    // Tạo prev preview (optional, nếu cần vuốt 2 chiều)
    const prevArticle = getPrevArticle(currentArticle);
    if (prevArticle) {
      prevPostPreview = createPostPreview(prevArticle, 'prev');
    }
  }

  function removeAllPreviews() {
    if (nextPostPreview) {
      nextPostPreview.remove();
      nextPostPreview = null;
    }
    if (prevPostPreview) {
      prevPostPreview.remove();
      prevPostPreview = null;
    }
  }

  // ========== SWIPE TO CLOSE & NAVIGATE MANAGER ==========
  let swipeState = {
    startY: 0,
    currentY: 0,
    isDragging: false,
    startX: 0,
    currentX: 0,
    isTransitioning: false
  };

  async function transitionToNextPost(nextArticle) {
    if (swipeState.isTransitioning) return;
    swipeState.isTransitioning = true;

    const lgOuter = document.querySelector('.lg-outer');
    if (lgOuter) {
      lgOuter.classList.add('transitioning');
    }

    // Smooth animation slide up
    const duration = 350;
    const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    
    if (lgOuter) {
      lgOuter.style.transition = `transform ${duration}ms ${easing}`;
      lgOuter.style.transform = 'translateY(-100%)';
    }

    if (nextPostPreview) {
      nextPostPreview.style.transition = `transform ${duration}ms ${easing}`;
      nextPostPreview.style.transform = 'translateY(-100%)';
    }

    // Đợi animation hoàn tất
    await new Promise(resolve => setTimeout(resolve, duration));

    // Đóng gallery hiện tại
    removeSwipeToClose();
    if (lgInstance) {
      lgInstance.destroy();
      lgInstance = null;
    }
    
    const galleryEl = document.getElementById('lightgallery');
    if (galleryEl) galleryEl.remove();
    
    const customUI = document.querySelector('.gallery-custom-ui');
    if (customUI) customUI.remove();

    removeAllPreviews();

    // Mở gallery mới (không hiện loading vì đã preload)
    await openGallery(nextArticle, true);
    
    swipeState.isTransitioning = false;
  }

  function initSwipeToClose() {
    const lgOuter = document.querySelector('.lg-outer');
    if (!lgOuter) return;

    const swipeOverlay = document.createElement('div');
    swipeOverlay.className = 'lg-swipe-overlay';
    swipeOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000;
      opacity: 1;
      pointer-events: none;
      z-index: 1;
      transition: none;
    `;
    lgOuter.insertBefore(swipeOverlay, lgOuter.firstChild);

    const handleTouchStart = (e) => {
      if (swipeState.isTransitioning) return;
      
      const target = e.target;
      if (target.closest('.gallery-custom-ui') || target.closest('.lg-toolbar')) {
        return;
      }

      swipeState.startY = e.touches[0].clientY;
      swipeState.startX = e.touches[0].clientX;
      swipeState.isDragging = false;

      lgOuter.style.transition = 'none';
      swipeOverlay.style.transition = 'none';
      
      if (nextPostPreview) {
        nextPostPreview.style.transition = 'none';
      }
      if (prevPostPreview) {
        prevPostPreview.style.transition = 'none';
      }
    };

    const handleTouchMove = (e) => {
      if (swipeState.startY === 0 || swipeState.isTransitioning) return;

      swipeState.currentY = e.touches[0].clientY;
      swipeState.currentX = e.touches[0].clientX;
      
      const diffY = swipeState.currentY - swipeState.startY;
      const diffX = Math.abs(swipeState.currentX - swipeState.startX);

      // Chỉ xử lý khi vuốt dọc
      if (Math.abs(diffY) > diffX && Math.abs(diffY) > 10) {
        swipeState.isDragging = true;
        e.preventDefault();

        // Vuốt xuống - đóng gallery
        if (diffY > 0) {
          const scale = Math.max(0.85, 1 - (diffY / 1000));
          const opacity = Math.max(0, 1 - (diffY / 400));
          
          lgOuter.style.transform = `translateY(${diffY}px) scale(${scale})`;
          swipeOverlay.style.opacity = opacity;
        } 
        // Vuốt lên - chuyển bài viết tiếp theo
        else if (diffY < 0) {
          const nextArticle = getNextArticle(currentPostData.article);
          
          if (nextArticle && nextPostPreview) {
            const absY = Math.abs(diffY);
            
            // Move current gallery up
            lgOuter.style.transform = `translateY(${diffY}px)`;
            
            // Move preview up từ dưới lên
            const previewY = window.innerHeight - absY;
            nextPostPreview.style.transform = `translateY(${previewY}px)`;
          } else {
            // Không có bài viết tiếp theo - hiệu ứng bounce nhẹ
            const boundedY = diffY * 0.3;
            lgOuter.style.transform = `translateY(${boundedY}px)`;
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
      const threshold = 120; // Giảm threshold để dễ swipe hơn

      lgOuter.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';
      swipeOverlay.style.transition = 'opacity 0.35s ease';
      
      if (nextPostPreview) {
        nextPostPreview.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
      }

      // Vuốt xuống > threshold - đóng gallery
      if (diffY > threshold) {
        lgOuter.style.transform = `translateY(100vh) scale(0.8)`;
        lgOuter.style.opacity = '0';
        swipeOverlay.style.opacity = '0';
        
        setTimeout(() => {
          closeGallery();
        }, 350);
      } 
      // Vuốt lên > threshold - chuyển bài viết tiếp theo
      else if (diffY < -threshold) {
        const nextArticle = getNextArticle(currentPostData.article);
        
        if (nextArticle && nextPostPreview) {
          await transitionToNextPost(nextArticle);
        } else {
          // Bounce back
          lgOuter.style.transform = '';
        }
      } 
      // Reset về vị trí ban đầu
      else {
        lgOuter.style.transform = '';
        swipeOverlay.style.opacity = '1';
        
        if (nextPostPreview) {
          nextPostPreview.style.transform = 'translateY(100%)';
        }
      }

      swipeState.startY = 0;
      swipeState.currentY = 0;
      swipeState.isDragging = false;
    };

    lgOuter.addEventListener('touchstart', handleTouchStart, { passive: true });
    lgOuter.addEventListener('touchmove', handleTouchMove, { passive: false });
    lgOuter.addEventListener('touchend', handleTouchEnd);

    lgOuter._swipeHandlers = {
      touchstart: handleTouchStart,
      touchmove: handleTouchMove,
      touchend: handleTouchEnd
    };
  }

  function removeSwipeToClose() {
    const lgOuter = document.querySelector('.lg-outer');
    if (!lgOuter || !lgOuter._swipeHandlers) return;

    const handlers = lgOuter._swipeHandlers;
    lgOuter.removeEventListener('touchstart', handlers.touchstart);
    lgOuter.removeEventListener('touchmove', handlers.touchmove);
    lgOuter.removeEventListener('touchend', handlers.touchend);
    
    delete lgOuter._swipeHandlers;

    const swipeOverlay = lgOuter.querySelector('.lg-swipe-overlay');
    if (swipeOverlay) swipeOverlay.remove();
    
    removeAllPreviews();
  }

  // ========== GALLERY MANAGER ==========
  let lgInstance = null;
  let currentPostData = null;
  let uiVisible = false;

  async function openGallery(article, skipLoading = false) {
    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) {
      return;
    }
    
    uiVisible = false;
    
    const cached = postCache.get(postUrl);
    
    // Chỉ hiện loading nếu chưa có cache và không phải transition
    if (!cached && !skipLoading) {
      showLoading();
    }
    
    const postData = await fetchPostData(postUrl);
    if (!postData.images.length) {
      hideLoading();
      if (!skipLoading) {
        alert('Không tìm thấy ảnh trong bài viết');
      }
      return;
    }
    
    currentPostData = { ...postData, url: postUrl, article };
    
    // Preload ảnh của bài viết hiện tại
    preloadImages(postData.images);
    
    // Preload bài viết kế tiếp và trước đó (background)
    preloadAdjacentPosts(article);
    
    const galleryEl = document.createElement('div');
    galleryEl.id = 'lightgallery';
    galleryEl.style.display = 'none';
    document.body.appendChild(galleryEl);
    
    const items = postData.images.map(src => ({
      src,
      thumb: src
    }));
    
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
        
        // Khởi tạo preview cho bài viết kế tiếp
        initializePreview(article);
      }, 300);
    });

    if (!skipLoading) {
      historyManager.push('gallery');
    }
  }

  function closeGallery() {
    hideLoading();
    
    removeSwipeToClose();
    
    if (lgInstance) {
      lgInstance.destroy();
      lgInstance = null;
    }
    
    const galleryEl = document.getElementById('lightgallery');
    if (galleryEl) galleryEl.remove();
    
    const customUI = document.querySelector('.gallery-custom-ui');
    if (customUI) customUI.remove();

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
    reloadBtn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    const commentBtn = document.createElement('button');
    commentBtn.className = 'ui-btn ui-comment';
    commentBtn.title = 'Bình luận';
    commentBtn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    const linkBtn = document.createElement('a');
    linkBtn.className = 'ui-btn ui-link';
    linkBtn.href = postUrl;
    linkBtn.title = 'Mở bài viết';
    linkBtn.target = "_blank";
    linkBtn.innerHTML =
        '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1.5 1.5"/><path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 1 1-7-7l1.5-1.5"/></svg>';

    const contentBtn = document.createElement('button');
    contentBtn.className = 'ui-btn ui-post-content';
    contentBtn.title = 'Nội dung bài viết';
    contentBtn.innerHTML =
        '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h6M8 16h4"/></svg>';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ui-btn ui-toggle-visibility';
    toggleBtn.title = 'Ẩn/Hiện UI';
    toggleBtn.innerHTML =
        '<svg class="icon-eye" width="24" style="display:none" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
        '<svg class="icon-eye-slash" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

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

    toggleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      uiVisible = !uiVisible;

      if (uiVisible) {
        iconEye.style.display = 'block';
        iconEyeSlash.style.display = 'none';
        buttons.forEach(b => {
          b.style.display = 'flex';
        });
      } else {
        iconEye.style.display = 'none';
        iconEyeSlash.style.display = 'block';
        buttons.forEach(b => {
          b.style.display = 'none';
        });
      }
      
      return false;
    }, true);
    
    toggleBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
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
    }, true);
  }

  // ========== EVENT LISTENER ==========
  function attachArticleEvents() {
    const articles = document.querySelectorAll('article');
    console.log('Found articles:', articles.length);
    
    articles.forEach(article => {
      if (article.dataset.galleryAttached) return;
      article.dataset.galleryAttached = 'true';
      
      const links = article.querySelectorAll('a');
      
      links.forEach(link => {
        if (link.href && !link.dataset.postUrl) {
          link.dataset.postUrl = link.href;
        }
        
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          console.log('Link clicked, opening gallery...');
          openGallery(article);
          
          return false;
        }, true);
      });
    });
  }
  
  setTimeout(attachArticleEvents, 500);
  
  const observer = new MutationObserver((mutations) => {
    let hasNewArticles = false;
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.tagName === 'ARTICLE' || node.querySelector('article')) {
            hasNewArticles = true;
          }
        }
      });
    });
    
    if (hasNewArticles) {
      console.log('New articles detected, attaching events...');
      setTimeout(attachArticleEvents, 300);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

});
