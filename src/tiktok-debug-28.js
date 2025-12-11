// post-view

document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("post-view")) return;

  // =======================================
  // Thu thập tất cả ảnh từ <div.separator>
  // =======================================
  const images = [];
  const separators = document.querySelectorAll("div.separator");

  separators.forEach((div, index) => {
    const link = div.querySelector("a");
    if (!link || !link.href) return;

    images.push({
      url: link.href,
      element: div,
      index: index
    });

    // Thay thế bằng ảnh có thể click
    const img = document.createElement("img");
    img.src = link.href;
    img.loading = "lazy";
    img.style.width = "100%";
    img.style.display = "block";
    img.style.cursor = "pointer";
    img.dataset.imageIndex = index;

    div.innerHTML = "";
    div.appendChild(img);

    // Click vào ảnh → mở gallery
    img.addEventListener("click", () => openGallery(index));
  });

  if (images.length === 0) return;

  // =======================================
  // Tạo Gallery Container
  // =======================================
  const galleryHTML = `
    <div id="swiper-gallery" style="
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #000;
      display: none;
    ">
      <div class="swiper" style="width: 100%; height: 100%;">
        <div class="swiper-wrapper">
          ${images.map(img => `
            <div class="swiper-slide" style="display: flex; align-items: center; justify-content: center;">
              <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover; object-position: center; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; pointer-events: none;" draggable="false">
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", galleryHTML);

  const galleryContainer = document.getElementById("swiper-gallery");
  // =======================================
  // Khởi tạo Swiper
  // =======================================
  let swiper = null;
  let galleryOpen = false;

  function initSwiper(initialIndex) {
    if (swiper) {
      swiper.destroy(true, true);
    }

    swiper = new Swiper(galleryContainer.querySelector(".swiper"), {
      direction: "horizontal",
      loop: images.length > 1,
      initialSlide: initialIndex,
      keyboard: {
        enabled: true
      }
    });
  }
  function openGallery(index) {
    initSwiper(index);
    galleryContainer.style.display = "block";
    galleryOpen = true;
    history.pushState({ gallery: true }, "");
    document.body.style.overflow = "hidden";
  }

});

//listview

/* ListView - Enhanced Debug Version with Logs */

// ========== DEBUG LOG MANAGER ==========
const DebugLog = {
  logs: [],
  maxLogs: 50,
  
  add(category, message, data = null) {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    
    const entry = {
      timestamp,
      category,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    
    this.logs.push(entry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    console.log(`[${category}] ${message}`, data || '');
  },
  
  getAll() {
    return this.logs;
  },
  
  clear() {
    this.logs = [];
    this.add('SYSTEM', 'Logs cleared');
  },
  
  export() {
    return this.logs.map(log => {
      let line = `[${log.timestamp}] [${log.category}] ${log.message}`;
      if (log.data) {
        line += '\n  Data: ' + JSON.stringify(log.data, null, 2);
      }
      return line;
    }).join('\n\n');
  }
};

document.addEventListener("DOMContentLoaded", function () {
  DebugLog.add('INIT', 'DOMContentLoaded fired');
  
  if (!document.body.classList.contains("list-view")) {
    DebugLog.add('INIT', 'Not list-view page, exiting');
    return;
  }
  
  DebugLog.add('INIT', 'List-view page confirmed');
  
  // ===== Ẩn các nút More Posts =====
  const hideSelectors = [".blog-pager", ".blog-pager-older-link", ".load-more", "#blog-pager"];
  hideSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.style.display = "none";
      el.style.opacity = "0";
      el.style.visibility = "hidden";
    });
  });

  const container = document.querySelector(".list-view .blog-posts.hfeed.container");
  if (!container) {
    DebugLog.add('INIT', 'Container not found');
    return;
  }

  let nextPage = null;
  let loading = false;

  function getNextPage() {
    const pager = document.querySelector(".blog-pager-older-link");
    if (pager) nextPage = pager.href;
  }
  getNextPage();

  function createSkeleton() {
    const article = document.createElement("article");
    article.className = "post-outer-container skeleton";
    article.innerHTML = `
      <div class="post-outer">
        <div class="post">
          <div class="thumb-image">
            <div class="skeleton-box"></div>
          </div>
          <div class="thumb-title"><span class="thumb-title-inner"></span></div>
        </div>
      </div>
    `;
    return article;
  }

  async function loadMore() {
    if (!nextPage || loading) return;
    loading = true;
    DebugLog.add('LOADMORE', 'Loading more posts', { nextPage });

    const tempSkeleton = createSkeleton();
    container.appendChild(tempSkeleton);

    try {
      const res = await fetch(nextPage);
      const html = await res.text();
      const temp = document.createElement("div");
      temp.innerHTML = html;

      const posts = temp.querySelectorAll(".post-outer-container");
      const skeletons = [tempSkeleton];
      for (let i = 1; i < posts.length; i++) {
        const sk = createSkeleton();
        container.appendChild(sk);
        skeletons.push(sk);
      }

      posts.forEach((post, i) => {
        if (skeletons[i]) skeletons[i].replaceWith(post);
        else container.appendChild(post);
      });

      const newPager = temp.querySelector(".blog-pager-older-link");
      nextPage = newPager ? newPager.href : null;
      DebugLog.add('LOADMORE', `Loaded ${posts.length} posts`, { hasNextPage: !!nextPage });

    } catch (err) {
      DebugLog.add('ERROR', 'Load more failed', { error: err.message });
      console.error(err);
    }

    loading = false;
  }

  window.addEventListener("scroll", function () {
    if (!nextPage || loading) return;
    const reachBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
    if (reachBottom) loadMore();
  });

  // ========== IMPROVED CACHE MANAGER ==========
  const CACHE_VERSION = 'v4';
  const CACHE_PREFIX = 'tiktok_cache_';

  const imageCache = new Map();
  const imageLoadStatus = new Map();

  const postCache = {
    maxSize: 20,
    cache: new Map(),
    lastAccess: new Map(),
    
    get(url) {
      const data = this.cache.get(url);
      if (data) {
        this.lastAccess.set(url, Date.now());
        return data;
      }
      
      try {
        const stored = localStorage.getItem(CACHE_PREFIX + url);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.version === CACHE_VERSION && Date.now() - parsed.timestamp < 86400000) {
            this.cache.set(url, parsed.data);
            this.lastAccess.set(url, Date.now());
            return parsed.data;
          } else {
            localStorage.removeItem(CACHE_PREFIX + url);
          }
        }
      } catch (e) {}
      
      return null;
    },
    
    set(url, data) {
      if (this.cache.size >= this.maxSize) {
        let oldestUrl = null;
        let oldestTime = Infinity;
        
        this.lastAccess.forEach((time, u) => {
          if (time < oldestTime) {
            oldestTime = time;
            oldestUrl = u;
          }
        });
        
        if (oldestUrl) {
          this.cache.delete(oldestUrl);
          this.lastAccess.delete(oldestUrl);
        }
      }
      
      this.cache.set(url, data);
      this.lastAccess.set(url, Date.now());
      this.saveToStorage(url, data);
    },
    
    saveToStorage(url, data) {
      try {
        const payload = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          data: data
        };
        localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(payload));
      } catch (e) {
        this.clearOldStorage();
      }
    },
    
    clearOldStorage() {
      try {
        const now = Date.now();
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(CACHE_PREFIX)) {
            try {
              const item = JSON.parse(localStorage.getItem(key));
              if (now - item.timestamp > 86400000) {
                localStorage.removeItem(key);
              }
            } catch (e) {
              localStorage.removeItem(key);
            }
          }
        });
      } catch (e) {}
    },
    
    clear() {
      this.cache.clear();
      this.lastAccess.clear();
    }
  };

  postCache.clearOldStorage();
  
  // ========== INTERSECTION OBSERVER FOR PRELOAD ==========
  let preloadObserver = null;

  function setupPreloadObserver() {
    if (preloadObserver) return;
    
    preloadObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          const article = entry.target;
          const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
          
          if (postUrl && !postCache.get(postUrl)) {
            fetchPostData(postUrl).then(data => {
              if (data.images && data.images.length > 0) {
                preloadImages([data.images[0]]);
              }
            }).catch(() => {});
          }
        }
      });
    }, {
      root: null,
      rootMargin: '300px',
      threshold: 0
    });
  }

  function observeArticle(article) {
    if (preloadObserver && !article.classList.contains('skeleton')) {
      preloadObserver.observe(article);
    }
  }

  function unobserveArticle(article) {
    if (preloadObserver) {
      preloadObserver.unobserve(article);
    }
  }

  // ========== FETCH POST DATA ==========
  async function fetchPostData(url) {
    const cached = postCache.get(url);
    if (cached) {
      DebugLog.add('CACHE', 'Post data from cache', { url });
      return cached;
    }
    
    DebugLog.add('FETCH', 'Fetching post data', { url });
    
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
      DebugLog.add('FETCH', 'Post data fetched successfully', { url, imageCount: images.length });
      return data;
    } catch (e) {
      DebugLog.add('ERROR', 'Fetch post data failed', { url, error: e.message });
      return { images: [], textContent: '', commentsUrl: null };
    }
  }

  // ========== PRELOAD IMAGES ==========
  function preloadImages(urls) {
    urls.forEach(url => {
      if (!url) return;
      if (!imageCache.has(url)) {
        const img = new Image();
        imageLoadStatus.set(url, 'loading');
        img.onload = () => {
          imageLoadStatus.set(url, 'loaded');
          imageCache.set(url, img);
        };
        img.onerror = () => {
          imageLoadStatus.set(url, 'error');
        };
        img.src = url;
      }
    });
  }

  function isImageCached(url) {
    return imageLoadStatus.get(url) === 'loaded';
  }

  // ========== HISTORY MANAGER ==========
  const historyManager = {
    state: { drawer: null, gallery: false },
    push(type) {
      if (type === 'gallery') { 
        this.state.gallery = true; 
        history.pushState({ galleryOpen: true }, ''); 
        DebugLog.add('HISTORY', 'Pushed gallery state');
      } else if (type === 'drawer') { 
        this.state.drawer = type; 
        history.pushState({ drawerOpen: type }, ''); 
        DebugLog.add('HISTORY', 'Pushed drawer state');
      }
    },
    pop() {
      if (this.state.drawer) { 
        closeDrawer(); 
        this.state.drawer = null; 
        DebugLog.add('HISTORY', 'Popped drawer state');
        return true; 
      }
      if (this.state.gallery) { 
        closeGallery(); 
        this.state.gallery = false; 
        DebugLog.add('HISTORY', 'Popped gallery state');
        return true; 
      }
      return false;
    }
  };
  window.addEventListener('popstate', () => historyManager.pop());

  // ========== DRAWER MANAGER ==========
  let currentDrawer = null;
  function createDrawer(type, content, postUrl) {
    closeDrawer();
    const drawer = document.createElement('div');
    drawer.className = 'custom-drawer';
    const heightClass = type === 'content' || type === 'debug' ? 'drawer-90' : '';
    
    let headerContent = '';
    if (type === 'debug') {
      headerContent = `
        <h3 style="margin:0;font-size:16px;font-weight:600">Debug Logs</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="debug-copy-btn" title="Copy logs">📋</button>
          <button class="debug-clear-btn" title="Clear logs">🗑️</button>
          <button class="drawer-close">✕</button>
        </div>
      `;
    } else {
      headerContent = '<button class="drawer-close">✕</button>';
    }
    
    drawer.innerHTML = `
      <div class="drawer-overlay"></div>
      <div class="drawer-content ${heightClass}">
        <div class="drawer-header">${headerContent}</div>
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
    
    // Attach debug-specific handlers
    if (type === 'debug') {
      const copyBtn = drawer.querySelector('.debug-copy-btn');
      const clearBtn = drawer.querySelector('.debug-clear-btn');
      
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const text = DebugLog.export();
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✅';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
            DebugLog.add('DEBUG_UI', 'Logs copied to clipboard');
          }).catch(err => {
            DebugLog.add('ERROR', 'Failed to copy logs', { error: err.message });
          });
        });
      }
      
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (confirm('Clear all logs?')) {
            DebugLog.clear();
            closeDrawer();
            DebugLog.add('DEBUG_UI', 'Logs cleared by user');
          }
        });
      }
    }
    
    historyManager.push('drawer');
  }
  
  function closeDrawer() {
    if (!currentDrawer) return;
    currentDrawer.classList.remove('active');
    setTimeout(() => { currentDrawer?.remove(); currentDrawer = null; }, 300);
  }

  // ========== DEBUG DRAWER ==========
  function createDebugDrawer() {
    DebugLog.add('DEBUG_UI', 'Opening debug drawer');
    
    const logs = DebugLog.getAll();
    let logHTML = '';
    
    if (logs.length === 0) {
      logHTML = '<div style="padding:20px;text-align:center;opacity:0.6">No logs yet</div>';
    } else {
      const categoryColor = {
        'INIT': '#4CAF50',
        'CLICK': '#2196F3',
        'GALLERY': '#9C27B0',
        'SWIPER': '#FF9800',
        'UI': '#00BCD4',
        'FETCH': '#FFC107',
        'CACHE': '#8BC34A',
        'ERROR': '#F44336',
        'SYSTEM': '#607D8B'
      };
      
      logHTML = `<div class="debug-log-container">${logs.map(log => {
        const color = categoryColor[log.category] || '#999';
        return `
          <div class="debug-log-entry">
            <div class="debug-log-header">
              <span class="debug-log-time">${log.timestamp}</span>
              <span class="debug-log-category" style="background:${color}">${log.category}</span>
            </div>
            <div class="debug-log-message">${log.message}</div>
            ${log.data ? `<pre class="debug-log-data">${JSON.stringify(log.data, null, 2)}</pre>` : ''}
          </div>
        `;
      }).join('')}</div>`;
    }
    
    createDrawer('debug', logHTML);
    
    // Auto-scroll to bottom
    setTimeout(() => {
      const logContainer = document.querySelector('.debug-log-container');
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }, 100);
  }

  // ========== LOADING INDICATOR ==========
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
    const loading = document.getElementById('gallery-loading'); 
    if (loading) loading.remove(); 
  }

  // ========== IMAGE LOADING PLACEHOLDER ==========
  function createImageWithLoader(imgUrl, idx) {
    const isCached = isImageCached(imgUrl);
    
    if (isCached) {
      return `<img src="${imgUrl}" alt="Ảnh ${idx + 1}" draggable="false">`;
    } else {
      return `
        <div class="image-loader-wrapper" data-img-url="${imgUrl}">
          <div class="image-loader">
            <div class="spinner"></div>
            <p>Đang tải ảnh...</p>
          </div>
          <img src="${imgUrl}" alt="Ảnh ${idx + 1}" draggable="false" style="display:none" 
               onload="this.style.display='block';this.parentElement.querySelector('.image-loader').style.display='none';"
               onerror="this.parentElement.querySelector('.image-loader').innerHTML='<p>Lỗi tải ảnh</p>';">
        </div>
      `;
    }
  }

  // ========== UTIL FUNCTIONS ==========
  function getArticles() { 
    return Array.from(document.querySelectorAll('article')); 
  }
  
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

  // ========== SWIPER GALLERY MANAGER ==========
  let mainSwiper = null;
  let nestedSwipers = new Map();
  let currentPostData = null;
  let galleryContainer = null;
  let uiVisible = false;
  let isPreloading = false;

  function createGalleryContainer() {
    if (galleryContainer) return galleryContainer;
    
    galleryContainer = document.createElement('div');
    galleryContainer.id = 'swiper-gallery-container';
    galleryContainer.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #000;
      display: none;
    `;
    
    galleryContainer.innerHTML = `
      <div class="swiper swiper-main">
        <div class="swiper-wrapper"></div>
      </div>
    `;
    
    document.body.appendChild(galleryContainer);
    DebugLog.add('GALLERY', 'Gallery container created');
    return galleryContainer;
  }
  
  function createEmptySlide(article) {
    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) return null;
    
    const mainWrapper = galleryContainer?.querySelector('.swiper-main .swiper-wrapper');
    if (!mainWrapper) return null;
    
    const existingSlide = mainWrapper.querySelector(`[data-post-url="${postUrl}"]`);
    if (existingSlide) return existingSlide;
    
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    slide.dataset.postUrl = postUrl;
    slide.dataset.loaded = 'false';
    slide.dataset.loading = 'false';
    
    const nestedId = `nested-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    slide.innerHTML = `
      <div class="swiper swiper-nested" id="${nestedId}" data-should-loop="false">
        <div class="swiper-wrapper">
          <div class="swiper-slide">
            <div class="placeholder">Đang tải...</div>
          </div>
        </div>
      </div>
    `;
    
    DebugLog.add('GALLERY', 'Empty slide created', { postUrl, nestedId });
    return slide;
  }
  
  function updateNestedSwiperSlides(nestedSwiper, postData) {
    if (!nestedSwiper || !postData) return;
    
    DebugLog.add('SWIPER', 'Updating nested swiper slides', { 
      imageCount: postData.images?.length || 0 
    });
    
    nestedSwiper.removeAllSlides();
    
    if (postData.images && postData.images.length > 0) {
      const newSlides = postData.images.map((imgUrl, idx) => {
        return `<div class="swiper-slide swiper-slide-image">
          ${createImageWithLoader(imgUrl, idx)}
        </div>`;
      });
      
      nestedSwiper.appendSlide(newSlides);
      preloadImages([postData.images[0]]);
      
      const shouldLoop = postData.images.length > 1;
      nestedSwiper.params.loop = shouldLoop;
      nestedSwiper.params.loopAdditionalSlides = shouldLoop ? 2 : 0;
      
      if (shouldLoop) {
        nestedSwiper.loopDestroy();
        nestedSwiper.loopCreate();
      }
      
      nestedSwiper.update();
      
      DebugLog.add('SWIPER', 'Nested swiper updated', { 
        slideCount: nestedSwiper.slides.length,
        loop: shouldLoop
      });
    } else {
      nestedSwiper.appendSlide('<div class="swiper-slide"><div class="placeholder">Không có ảnh</div></div>');
      DebugLog.add('SWIPER', 'No images in post');
    }
    
    nestedSwiper.slideTo(0, 0);
  }
  
  async function loadPostDataForSlide(article) {
    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) {
      DebugLog.add('ERROR', 'loadPostDataForSlide: No postUrl');
      return;
    }
    
    const mainWrapper = galleryContainer?.querySelector('.swiper-main .swiper-wrapper');
    if (!mainWrapper) {
      DebugLog.add('ERROR', 'loadPostDataForSlide: No mainWrapper');
      return;
    }
    
    let slide = mainWrapper.querySelector(`[data-post-url="${postUrl}"]`);
    
    if (!slide) {
      slide = createEmptySlide(article);
      if (slide) mainWrapper.appendChild(slide);
    }
    
    if (slide.dataset.loaded === 'true') {
      DebugLog.add('SWIPER', 'Slide already loaded', { postUrl });
      return;
    }
    
    if (slide.dataset.loading === 'true') {
      DebugLog.add('SWIPER', 'Slide already loading', { postUrl });
      return;
    }
    
    slide.dataset.loading = 'true';
    DebugLog.add('SWIPER', 'Loading post data for slide', { postUrl });
    
    try {
      const postData = await fetchPostData(postUrl);
      postData.url = postUrl;
      postData.article = article;
      
      const nestedEl = slide.querySelector('.swiper-nested');
      const nestedId = nestedEl?.id;
      const existingSwiper = nestedSwipers.get(nestedId);
      
      if (!existingSwiper) {
        const nestedWrapper = slide.querySelector('.swiper-wrapper');
        nestedWrapper.innerHTML = '';
        
        if (postData.images && postData.images.length > 0) {
          nestedEl.dataset.shouldLoop = postData.images.length > 1 ? 'true' : 'false';
          
          postData.images.forEach((imgUrl, idx) => {
            const imgSlide = document.createElement('div');
            imgSlide.className = 'swiper-slide swiper-slide-image';
            imgSlide.innerHTML = createImageWithLoader(imgUrl, idx);
            nestedWrapper.appendChild(imgSlide);
          });
          
          preloadImages([postData.images[0]]);
        } else {
          nestedWrapper.innerHTML = '<div class="placeholder">Không có ảnh</div>';
        }
      } else {
        updateNestedSwiperSlides(existingSwiper, postData);
      }
      
      slide.dataset.loaded = 'true';
      slide.postData = postData;
      DebugLog.add('SWIPER', 'Post data loaded successfully', { 
        postUrl, 
        imageCount: postData.images?.length || 0 
      });
      
    } catch (err) {
      slide.dataset.loaded = 'error';
      DebugLog.add('ERROR', 'Failed to load post data', { postUrl, error: err.message });
    } finally {
      slide.dataset.loading = 'false';
    }
  }
  
  function preloadAdjacentSlides(activeIndex, range = 3) {
    if (!mainSwiper) return;
    
    const slides = mainSwiper.slides || [];
    const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
    
    for (let i = -range; i <= range; i++) {
      if (i === 0) continue;
      
      const idx = activeIndex + i;
      if (idx < 0 || idx >= slides.length) continue;
      
      const slide = slides[idx];
      if (slide.dataset.loaded !== 'true' && slide.dataset.loading !== 'true') {
        const postUrl = slide.dataset.postUrl;
        const article = articles.find(a => 
          a.querySelector('a[data-post-url]')?.dataset.postUrl === postUrl
        );
        
        if (article) {
          loadPostDataForSlide(article).catch(() => {});
        }
      }
    }
  }
  
  function updateCurrentSlide(swiperInstance) {
    const activeSlide = swiperInstance.slides[swiperInstance.activeIndex];
    if (!activeSlide) {
      DebugLog.add('SWIPER', 'updateCurrentSlide: No active slide');
      return;
    }
    
    DebugLog.add('SWIPER', 'Updating current slide', { 
      index: swiperInstance.activeIndex,
      postUrl: activeSlide.dataset.postUrl,
      loaded: activeSlide.dataset.loaded,
      loading: activeSlide.dataset.loading
    });
    
    const postData = activeSlide.postData;
    
    if (!postData || activeSlide.dataset.loaded !== 'true') {
      DebugLog.add('SWIPER', 'Slide not loaded yet, loading now');
      const postUrl = activeSlide.dataset.postUrl;
      const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
      const article = articles.find(a => 
        a.querySelector('a[data-post-url]')?.dataset.postUrl === postUrl
      );
      
      if (article) {
        showLoading();
        loadPostDataForSlide(article).then(() => {
          hideLoading();
          if (activeSlide.postData) {
            initNestedSwiper(activeSlide, activeSlide.postData);
            addCustomUI(activeSlide.postData.url, activeSlide.postData.article, activeSlide.postData);
            DebugLog.add('SWIPER', 'Slide loaded and UI added');
          }
        });
      }
      return;
    }
    
    DebugLog.add('SWIPER', 'Slide already loaded, initializing nested swiper and UI');
    initNestedSwiper(activeSlide, postData);
    addCustomUI(postData.url, postData.article, postData);
  }
  
  function initMainSwiper(container, initialIndex = 0) {
    if (mainSwiper) {
      DebugLog.add('SWIPER', 'Main swiper already exists, sliding to index', { initialIndex });
      mainSwiper.slideTo(initialIndex, 0);
      updateCurrentSlide(mainSwiper);
      return mainSwiper;
    }
    
    DebugLog.add('SWIPER', 'Creating main swiper', { initialIndex });
    
    mainSwiper = new Swiper(container.querySelector('.swiper-main'), {
      direction: 'vertical',
      loop: false,
      speed: 350,
      initialSlide: initialIndex,
      touchRatio: 1,
      threshold: 10,
      resistance: true,
      resistanceRatio: 0.5,
      on: {
        init: function() {
          DebugLog.add('SWIPER', 'Main swiper initialized', { 
            slideCount: this.slides.length,
            initialIndex: this.activeIndex
          });
          updateCurrentSlide(this);
        },
        slideChange: function() {
          DebugLog.add('SWIPER', 'Main swiper slide changed', { 
            newIndex: this.activeIndex 
          });
          updateCurrentSlide(this);
          preloadAdjacentSlides(this.activeIndex, 3);
          
          if (this.activeIndex >= this.slides.length - 2) {
            loadMorePosts(this);
          }
        },
        touchStart: function(swiper, event) {
          DebugLog.add('SWIPER', 'Main swiper touchStart', {
            activeIndex: swiper.activeIndex
          });
        },
        touchEnd: function(swiper, event) {
          DebugLog.add('SWIPER', 'Main swiper touchEnd', {
            activeIndex: swiper.activeIndex
          });
        }
      }
    });

    
    return mainSwiper;
  }
  
  async function preloadInitialPosts() {
    if (isPreloading) {
      DebugLog.add('SYSTEM', 'Already preloading');
      return;
    }
    isPreloading = true;
    
    const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
    DebugLog.add('SYSTEM', 'Starting preload', { articleCount: articles.length });
    
    const first10 = articles.slice(0, 10);
    
    if (first10.length === 0) {
      DebugLog.add('ERROR', 'No articles to preload');
      isPreloading = false;
      return;
    }
    
    const container = createGalleryContainer();
    const mainWrapper = container.querySelector('.swiper-main .swiper-wrapper');
    
    if (!mainWrapper) {
      DebugLog.add('ERROR', 'No mainWrapper for preload');
      isPreloading = false;
      return;
    }
    
    first10.forEach(article => {
      const slide = createEmptySlide(article);
      if (slide) mainWrapper.appendChild(slide);
    });
    
    DebugLog.add('SYSTEM', 'Slides created for preload', { 
      slideCount: mainWrapper.children.length 
    });
    
    const promises = first10.map((article, index) => 
      loadPostDataForSlide(article)
        .then(() => {})
        .catch(err => {
          DebugLog.add('ERROR', 'Preload failed for article', { index, error: err.message });
        })
    );
    
    await Promise.allSettled(promises);
    DebugLog.add('SYSTEM', 'Preload completed');
    
    isPreloading = false;
  }
  
  function initNestedSwiper(slideEl, postData) {
    const nestedEl = slideEl.querySelector('.swiper-nested');
    if (!nestedEl) {
      DebugLog.add('ERROR', 'initNestedSwiper: No nested element');
      return;
    }
    
    if (nestedSwipers.has(nestedEl.id)) {
      DebugLog.add('SWIPER', 'Nested swiper already exists', { id: nestedEl.id });
      return;
    }

    const shouldLoop = nestedEl.dataset.shouldLoop === 'true';
    
    DebugLog.add('SWIPER', 'Creating nested swiper', { 
      id: nestedEl.id,
      shouldLoop,
      imageCount: postData.images?.length || 0
    });

    const nested = new Swiper(nestedEl, {
      direction: 'horizontal',
      loop: shouldLoop,
      loopAdditionalSlides: shouldLoop ? 2 : 0,
      on: {
        init: function() {
          const activeIndex = this.realIndex || this.activeIndex;
          DebugLog.add('SWIPER', 'Nested swiper initialized', { 
            id: nestedEl.id,
            activeIndex,
            slideCount: this.slides.length
          });
          if (postData.images[activeIndex - 1]) preloadImages([postData.images[activeIndex - 1]]);
          if (postData.images[activeIndex + 1]) preloadImages([postData.images[activeIndex + 1]]);
        },
        slideChange: function() {
          const activeIndex = this.realIndex || this.activeIndex;
          DebugLog.add('SWIPER', 'Nested swiper slide changed', { 
            id: nestedEl.id,
            activeIndex 
          });
          if (postData.images[activeIndex - 1]) preloadImages([postData.images[activeIndex - 1]]);
          if (postData.images[activeIndex + 1]) preloadImages([postData.images[activeIndex + 1]]);
        },
        touchStart: function(swiper, event) {
          DebugLog.add('SWIPER', 'Nested swiper touchStart', {
            id: nestedEl.id
          });
        },
        touchEnd: function(swiper, event) {
          DebugLog.add('SWIPER', 'Nested swiper touchEnd', {
            id: nestedEl.id,
            activeIndex: swiper.activeIndex
          });
        }
      }
    });
    

    nestedSwipers.set(nestedEl.id, nested);
  }

  async function preloadAdjacentPosts(article) {
    const nextArticle = getNextArticle(article);
    const prevArticle = getPrevArticle(article);
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
      if (url && !postCache.get(url)) tasks.push(fetchPostData(url));
    }
    
    Promise.all(tasks).catch(() => {});
  }

  async function openGallery(article, skipHistory = false) {
    DebugLog.add('GALLERY', 'openGallery called');

    const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
    if (!postUrl) {
        DebugLog.add('ERROR', 'openGallery: No postUrl');
        return;
    }

    const container = createGalleryContainer(); // đúng ID
    const wrapper = container.querySelector('.swiper-main .swiper-wrapper');

    const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
    const currentIndex = articles.indexOf(article);

    DebugLog.add('GALLERY', 'Opening gallery', {
        postUrl,
        currentIndex,
        totalArticles: articles.length,
        existingSlides: wrapper.children.length
    });

    if (currentIndex === -1) {
        DebugLog.add('ERROR', 'Article not in list');
        return;
    }

    // --- BƯỚC 1: Nếu slide chưa tạo → tạo ngay ---
    if (!wrapper.querySelector(`[data-post-url="${postUrl}"]`)) {
        DebugLog.add('GALLERY', 'Creating slides');
        articles.forEach(a => {
            const s = createEmptySlide(a);
            if (!s) return;

            const url = a.querySelector('a[data-post-url]')?.dataset.postUrl;
            s.dataset.postUrl = url;
            s.dataset.loaded = "false";

            wrapper.appendChild(s);
        });
    }

    // --- BƯỚC 2: Load dữ liệu cho vùng gần currentIndex ---
    const start = Math.max(0, currentIndex - 3);
    const end = Math.min(articles.length, currentIndex + 4);
    const neighbors = articles.slice(start, end);

    showLoading();

    await Promise.allSettled(neighbors.map(loadPostDataForSlide));

    hideLoading();

    // --- BƯỚC 3: Phải update wrapper TRƯỚC khi init swiper ---
    if (mainSwiper && mainSwiper.update) mainSwiper.update();

    // --- BƯỚC 4: Init Swiper ---
    DebugLog.add('GALLERY', 'Initializing main swiper', { initialIndex: currentIndex });

    initMainSwiper(container, currentIndex);

    // --- BƯỚC 5: Show gallery ---
    container.style.display = 'block';
    uiVisible = false;
    
    // THÊM ĐOẠN NÀY ↓
  // Force khởi tạo nested swiper của slide đầu tiên
  setTimeout(() => {
    if (mainSwiper && mainSwiper.slides[currentIndex]) {
      const activeSlide = mainSwiper.slides[currentIndex];
      if (activeSlide.postData) {
        initNestedSwiper(activeSlide, activeSlide.postData);
        addCustomUI(activeSlide.postData.url, activeSlide.postData.article, activeSlide.postData);
        DebugLog.add('GALLERY', 'Initial nested swiper initialized');
      }
    }
  }, 100);
  // HẾT PHẦN THÊM ↑
    
    if (!skipHistory) historyManager.push('gallery');

    DebugLog.add('GALLERY', 'Gallery fully opened');
}

  
  async function loadMorePosts(swiperInstance) {
    if (!nextPage || loading || !swiperInstance) return;
    
    const currentSlideCount = swiperInstance.slides.length;
    
    await loadMore();
    
    const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
    const newArticles = articles.slice(currentSlideCount);
    
    if (newArticles.length === 0) return;
    
    newArticles.forEach(article => {
      const newSlide = createEmptySlide(article);
      if (newSlide) {
        swiperInstance.appendSlide(newSlide);
      }
    });
    
    newArticles.slice(0, 3).forEach(article => {
      loadPostDataForSlide(article).catch(() => {});
    });
  }

  function closeGallery() {
    if (!galleryContainer) return;

    DebugLog.add('GALLERY', 'Closing gallery');

    galleryContainer.style.opacity = '0';
    galleryContainer.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
      galleryContainer.style.display = 'none';
      galleryContainer.style.opacity = '1';
      galleryContainer.style.transition = '';
      
      if (mainSwiper) {
        mainSwiper.destroy(true, true);
        mainSwiper = null;
        DebugLog.add('SWIPER', 'Main swiper destroyed');
      }
      
      nestedSwipers.forEach((s, id) => {
        s.destroy(true, true);
        DebugLog.add('SWIPER', 'Nested swiper destroyed', { id });
      });
      nestedSwipers.clear();

      const wrapper = galleryContainer.querySelector('.swiper-main .swiper-wrapper');
      if (wrapper) wrapper.innerHTML = '';

      currentPostData = null;

      const existingUI = document.querySelector('.gallery-custom-ui');
      if (existingUI) existingUI.remove();
      
      isPreloading = false;
      
      DebugLog.add('GALLERY', 'Gallery closed');
    }, 300);
  }

async function reloadPostData(article, postUrl, activeSlide) {
    try {
        DebugLog.add('UI', 'Reload button clicked', { postUrl });

        showLoading();
        await new Promise(requestAnimationFrame);

        // --- xóa cache ---
        postCache.cache.delete(postUrl);
        postCache.lastAccess.delete(postUrl);
        try { localStorage.removeItem(CACHE_PREFIX + postUrl); } catch(e) {}

        // --- reset slide để reload ---
        if (activeSlide) {
            activeSlide.dataset.loaded = 'false';
            activeSlide.dataset.loading = 'false';
            activeSlide.postData = null;

            const nestedEl = activeSlide.querySelector('.swiper-nested');
            if (nestedEl && nestedSwipers.has(nestedEl.id)) {
                nestedSwipers.get(nestedEl.id).destroy(true, true);
                nestedSwipers.delete(nestedEl.id);
            }
        }

        // --- fetch dữ liệu mới ---
        let freshData = await fetchPostData(postUrl + '?_=' + Date.now());
        if (!freshData) throw new Error('Không lấy được dữ liệu mới từ server');

        // gán postData mới
        if (activeSlide) activeSlide.postData = freshData;

        // --- init nested slide **sau khi DOM slide đã sẵn sàng** ---
        if (activeSlide) {
            const nestedEl = activeSlide.querySelector('.swiper-nested');
            if (nestedEl instanceof HTMLElement) {
                nestedEl.innerHTML = '';
                initNestedSwiper(activeSlide, freshData);
                DebugLog.add('SWIPER', 'Nested slide refreshed', { id: nestedEl.id });
            }
        }

        // --- update custom UI ---
        if (article instanceof HTMLElement) {
            addCustomUI(postUrl, article, freshData);
            const toggleBtn = article.querySelector('.ui-btn.ui-toggle-visibility');
            if (toggleBtn) {
                toggleBtn.removeEventListener('mousedown', toggleUIHandler, true);
                toggleBtn.removeEventListener('touchstart', toggleUIHandler, true);
                toggleBtn.addEventListener('mousedown', toggleUIHandler, true);
                toggleBtn.addEventListener('touchstart', toggleUIHandler, true);
            }
        }

        hideLoading();
        alert('Cập nhật dữ liệu thành công!');
        DebugLog.add('UI', 'Post reloaded successfully', { postUrl });

    } catch (e) {
        hideLoading();
        DebugLog.add('ERROR', 'Reload post failed', { error: e.message });
        alert('Không thể tải dữ liệu mới — xem console để biết chi tiết.');
    }
}



  function addCustomUI(postUrl, article, postData) {
    const existing = document.querySelector('.gallery-custom-ui');
    if (existing) {
      DebugLog.add('UI', 'Removing existing UI');
      existing.remove();
    }

    DebugLog.add('UI', 'Adding custom UI', { postUrl });

    const uiContainer = document.createElement('div');
    uiContainer.className = 'gallery-custom-ui';

    const debugBtn = document.createElement('button');
    debugBtn.className = 'ui-btn ui-debug';
    debugBtn.title = 'Debug Logs';
    debugBtn.style.display = 'none';
    debugBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bug-icon lucide-bug"><path d="M12 20v-9"/><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/><path d="M14.12 3.88 16 2"/><path d="M21 21a4 4 0 0 0-3.81-4"/><path d="M21 5a4 4 0 0 1-3.55 3.97"/><path d="M22 13h-4"/><path d="M3 21a4 4 0 0 1 3.81-4"/><path d="M3 5a4 4 0 0 0 3.55 3.97"/><path d="M6 13H2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/></svg>';

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
    linkBtn.target = "_self";
    linkBtn.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1.5 1.5"/><path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 1 1-7-7l1.5-1.5"/></svg>';

    const contentBtn = document.createElement('button');
    contentBtn.className = 'ui-btn ui-post-content';
    contentBtn.title = 'Nội dung bài viết';
    contentBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text-icon lucide-file-text"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ui-btn ui-toggle-visibility';
    toggleBtn.title = 'Ẩn/Hiện UI';
    toggleBtn.innerHTML = '<svg class="icon-eye" width="24" style="display:none" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
                           '<svg class="icon-eye-slash" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    uiContainer.appendChild(debugBtn);
    uiContainer.appendChild(reloadBtn);
    uiContainer.appendChild(commentBtn);
    uiContainer.appendChild(linkBtn);
    uiContainer.appendChild(contentBtn);
    uiContainer.appendChild(toggleBtn);
    document.body.appendChild(uiContainer);

    [reloadBtn, commentBtn, linkBtn, contentBtn].forEach(b => b.style.display = 'none');

    debugBtn.addEventListener('click', () => {
      DebugLog.add('UI', 'Debug button clicked');
      createDebugDrawer();
    });

    
    reloadBtn.addEventListener('click', async () => {
    const activeSlide = mainSwiper?.slides[mainSwiper.activeIndex];
    await reloadPostData(article, postUrl, activeSlide);
    });


    commentBtn.addEventListener('click', () => { 
      DebugLog.add('UI', 'Comment button clicked');
      window.location.href = postUrl + "#comments"; 
    });

    contentBtn.addEventListener("click", () => {
      DebugLog.add('UI', 'Content button clicked');
      let html = postData?.textContent?.trim() || "";
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      if (tmp.textContent.trim().length === 0) {
        html = `<p style="text-align:center;opacity:.6;padding:25px">Chưa có nội dung</p>`;
      }
      createDrawer("content", html);
    });

    const iconEye = toggleBtn.querySelector('.icon-eye');
    const iconEyeSlash = toggleBtn.querySelector('.icon-eye-slash');
    const buttons = [debugBtn, reloadBtn, commentBtn, linkBtn, contentBtn];

    function toggleUIHandler(e) {
      e && e.preventDefault && e.preventDefault();
      e && e.stopPropagation && e.stopPropagation();
      uiVisible = !uiVisible;
      DebugLog.add('UI', 'UI visibility toggled', { uiVisible });
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
    
    DebugLog.add('UI', 'Custom UI added successfully');
  }

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
          DebugLog.add('CLICK', 'Article clicked', { 
            postUrl: link.dataset.postUrl 
          });
          openGallery(article);
          return false;
        }, true);
      });
      
      observeArticle(article);
    });
  }
      
  attachArticleEvents();

  setTimeout(() => {
    DebugLog.add('INIT', 'Starting setup after 500ms delay');
    setupPreloadObserver();
    
    setTimeout(() => {
      DebugLog.add('INIT', 'Calling preloadInitialPosts');
      preloadInitialPosts();
    }, 1000);
  }, 500);

  const observer = new MutationObserver((mutations) => {
    let hasNew = false;
    mutations.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && (n.tagName === 'ARTICLE' || (n.querySelector && n.querySelector('article')))) {
          hasNew = true;
        }
      });
    });
    if (hasNew) {
      setTimeout(() => {
        attachArticleEvents();
        const newArticles = document.querySelectorAll('article:not([data-gallery-attached])');
        newArticles.forEach(observeArticle);
      }, 300);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });

  window.__myGallery = { 
    openGallery, 
    closeGallery, 
    preloadImages, 
    fetchPostData, 
    postCache,
    getMainSwiper: () => mainSwiper,
    getNestedSwipers: () => nestedSwipers,
    DebugLog
  };
  
  const style = document.createElement('style');
  style.textContent = `
    .debug-log-container {
      height: 100%;
      overflow-y: auto;
      padding: 12px;
      background: #1a1a1a;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
    .debug-log-entry {
      margin-bottom: 12px;
      padding: 10px;
      background: #2a2a2a;
      border-radius: 6px;
      border-left: 3px solid #666;
    }
    .debug-log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .debug-log-time {
      color: #888;
      font-size: 11px;
    }
    .debug-log-category {
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
    }
    .debug-log-message {
      color: #fff;
      margin-bottom: 6px;
      word-wrap: break-word;
    }
    .debug-log-data {
      background: #1a1a1a;
      padding: 8px;
      border-radius: 4px;
      color: #4CAF50;
      overflow-x: auto;
      font-size: 11px;
      margin: 0;
    }
    .debug-copy-btn, .debug-clear-btn {
      background: #333;
      border: none;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
    }
    .debug-copy-btn:hover, .debug-clear-btn:hover {
      background: #444;
    }
    .ui-debug {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
  `;
  document.head.appendChild(style);
});
  
