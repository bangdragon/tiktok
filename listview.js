/* ListView */
alert('v4');
document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("list-view")) return;
  
      // ===== Ẩn các nút More Posts =====
    const hideSelectors = [
        ".blog-pager",
        ".blog-pager-older-link",
        ".load-more",
        "#blog-pager"
    ];
    hideSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.style.display = "none";
            el.style.opacity = "0";
            el.style.visibility = "hidden";
        });
    });
    // ==================================

    const container = document.querySelector(".list-view .blog-posts.hfeed.container");
    if (!container) return;

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

        // append 1 skeleton tạm thời ngay lập tức để người dùng thấy
        const tempSkeleton = createSkeleton();
        container.appendChild(tempSkeleton);

        try {
            const res = await fetch(nextPage);
            const html = await res.text();
            const temp = document.createElement("div");
            temp.innerHTML = html;

            // lấy tất cả bài mới
            const posts = temp.querySelectorAll(".post-outer-container");

            // Nếu có nhiều hơn 1 bài → thêm skeleton tương ứng
            const skeletons = [tempSkeleton];
            for (let i = 1; i < posts.length; i++) {
                const sk = createSkeleton();
                container.appendChild(sk);
                skeletons.push(sk);
            }

            // Replace skeleton bằng bài thật
            posts.forEach((post, i) => {
                if (skeletons[i]) skeletons[i].replaceWith(post);
                else container.appendChild(post);
            });

            // cập nhật next page
            const newPager = temp.querySelector(".blog-pager-older-link");
            nextPage = newPager ? newPager.href : null;

        } catch (err) {
            console.error(err);
        }

        loading = false;
    }

    window.addEventListener("scroll", function () {
        if (!nextPage || loading) return;
        const reachBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
        if (reachBottom) loadMore();
    });

    // ========== CACHE MANAGER ==========
  // ========== IMPROVED CACHE MANAGER ==========
const CACHE_VERSION = 'v4';
const CACHE_PREFIX = 'tiktok_cache_';

// Image cache với memory + disk
const imageCache = new Map();
const imageLoadStatus = new Map();

// Post cache cải tiến với LRU và localStorage backup
const postCache = {
  maxSize: 30, // Tăng lên 30 bài
  cache: new Map(),
  lastAccess: new Map(),
  
  // Get với update access time
  get(url) {
    const data = this.cache.get(url);
    if (data) {
      this.lastAccess.set(url, Date.now());
      return data;
    }
    
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(CACHE_PREFIX + url);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.version === CACHE_VERSION && Date.now() - parsed.timestamp < 86400000) { // 24h
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
  
  // Set với LRU eviction
  set(url, data) {
    // LRU: Remove least recently used
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
    
    // Backup to localStorage (async, không block)
    this.saveToStorage(url, data);
  },
  
  // Save to localStorage async
  saveToStorage(url, data) {
    try {
      const payload = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(payload));
    } catch (e) {
      // Quota exceeded, clear old cache
      this.clearOldStorage();
    }
  },
  
  // Clear localStorage cache cũ hơn 24h
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

// Clear old cache on init
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
          // Preload data ngầm
          fetchPostData(postUrl).then(data => {
            if (data.images && data.images.length > 0) {
              preloadImages([data.images[0]]); // Preload ảnh đầu tiên
            }
          }).catch(() => {});
        }
      }
    });
  }, {
    root: null,
    rootMargin: '300px', // Preload khi còn cách 300px
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

  // ========== PRELOAD IMAGES WITH STATUS TRACKING ==========
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

  // Check if image is in cache
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
      } else if (type === 'drawer') { 
        this.state.drawer = type; 
        history.pushState({ drawerOpen: type }, ''); 
      }
    },
    pop() {
      if (this.state.drawer) { closeDrawer(); this.state.drawer = null; return true; }
      if (this.state.gallery) { closeGallery(); this.state.gallery = false; return true; }
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
      // Image is cached, show directly
      return `<img src="${imgUrl}" alt="Ảnh ${idx + 1}" draggable="false">`;
    } else {
      // Image not cached, show loader
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
let isPreloading = false; // Flag để tránh preload trùng lặp

  // Tạo gallery container với Swiper
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
    return galleryContainer;
  }
  
  // ========== CREATE EMPTY SLIDE ==========
function createEmptySlide(article) {
  const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
  if (!postUrl) return null;
  
  const mainWrapper = galleryContainer?.querySelector('.swiper-main .swiper-wrapper');
  if (!mainWrapper) return null;
  
  // Check nếu slide đã tồn tại
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
  
  return slide;
}
  // ========== UPDATE NESTED SWIPER SLIDES ==========
function updateNestedSwiperSlides(nestedSwiper, postData) {
  if (!nestedSwiper || !postData) return;
  
  // Remove all slides
  nestedSwiper.removeAllSlides();
  
  if (postData.images && postData.images.length > 0) {
    const newSlides = postData.images.map((imgUrl, idx) => {
      return `<div class="swiper-slide swiper-slide-image">
        ${createImageWithLoader(imgUrl, idx)}
      </div>`;
    });
    
    nestedSwiper.appendSlide(newSlides);
    preloadImages([postData.images[0]]);
    
    // Update loop
    const shouldLoop = postData.images.length > 1;
    nestedSwiper.params.loop = shouldLoop;
    nestedSwiper.params.loopAdditionalSlides = shouldLoop ? 2 : 0;
    
    if (shouldLoop) {
      nestedSwiper.loopDestroy();
      nestedSwiper.loopCreate();
    }
    
    nestedSwiper.update();
  } else {
    nestedSwiper.appendSlide('<div class="swiper-slide"><div class="placeholder">Không có ảnh</div></div>');
  }
  
  nestedSwiper.slideTo(0, 0);
}
  // ========== LOAD POST DATA FOR SLIDE ==========
async function loadPostDataForSlide(article) {
  const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
  if (!postUrl) return;
  
  const mainWrapper = galleryContainer?.querySelector('.swiper-main .swiper-wrapper');
  if (!mainWrapper) return;
  
  let slide = mainWrapper.querySelector(`[data-post-url="${postUrl}"]`);
  
  // Tạo slide nếu chưa có
  if (!slide) {
    slide = createEmptySlide(article);
    if (slide) mainWrapper.appendChild(slide);
  }
  
  // Đã load hoặc đang load thì skip
  if (slide.dataset.loaded === 'true' || slide.dataset.loading === 'true') {
    return;
  }
  
  slide.dataset.loading = 'true';
  
  try {
    const postData = await fetchPostData(postUrl);
    postData.url = postUrl;
    postData.article = article;
    
    const nestedEl = slide.querySelector('.swiper-nested');
    const nestedId = nestedEl?.id;
    const existingSwiper = nestedSwipers.get(nestedId);
    
    if (!existingSwiper) {
      // Swiper chưa init → update HTML
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
      // Swiper đã init → dùng API
      updateNestedSwiperSlides(existingSwiper, postData);
    }
    
    slide.dataset.loaded = 'true';
    slide.postData = postData;
    
  } catch (err) {
    console.error('Load error:', err);
    slide.dataset.loaded = 'error';
  } finally {
    slide.dataset.loading = 'false';
  }
} 

// ========== PRELOAD ADJACENT SLIDES ==========
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
  
  // ========== UPDATE CURRENT SLIDE ==========
function updateCurrentSlide(swiperInstance) {
  const activeSlide = swiperInstance.slides[swiperInstance.activeIndex];
  if (!activeSlide) return;
  
  const postData = activeSlide.postData;
  
  if (!postData || activeSlide.dataset.loaded !== 'true') {
    // Data chưa có, trigger load
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
        }
      });
    }
    return;
  }
  
  // Data đã có
  initNestedSwiper(activeSlide, postData);
  addCustomUI(postData.url, postData.article, postData);
}

// ========== UPDATE CURRENT SLIDE ==========
function updateCurrentSlide(swiperInstance) {
  const activeSlide = swiperInstance.slides[swiperInstance.activeIndex];
  if (!activeSlide) return;
  
  const postData = activeSlide.postData;
  
  if (!postData || activeSlide.dataset.loaded !== 'true') {
    // Data chưa có, trigger load
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
        }
      });
    }
    return;
  }
  
  // Data đã có
  initNestedSwiper(activeSlide, postData);
  addCustomUI(postData.url, postData.article, postData);
}

// ========== INIT MAIN SWIPER ==========
function initMainSwiper(container, initialIndex = 0) {
  if (mainSwiper) {
    mainSwiper.slideTo(initialIndex, 0);
    updateCurrentSlide(mainSwiper);
    return mainSwiper;
  }
  
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
        updateCurrentSlide(this);
      },
      slideChange: function() {
        updateCurrentSlide(this);
        preloadAdjacentSlides(this.activeIndex, 3);
        
        // Load more nếu gần hết
        if (this.activeIndex >= this.slides.length - 2) {
          loadMorePosts(this);
        }
      }
    }
  });
  
  return mainSwiper;
}

  // ========== PRELOAD INITIAL POSTS ==========
async function preloadInitialPosts() {
  if (isPreloading) return;
  isPreloading = true;
  
  const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
  const first10 = articles.slice(0, 10);
  
  console.log('🚀 Preloading', first10.length, 'bài viết...');
  
  // Tạo gallery container ngay (nhưng ẩn)
  const container = createGalleryContainer();
  const mainWrapper = container.querySelector('.swiper-main .swiper-wrapper');
  
  // Tạo empty slides
  first10.forEach(article => {
    const slide = createEmptySlide(article);
    if (slide) mainWrapper.appendChild(slide);
  });
  
  // Load dữ liệu song song
  const promises = first10.map((article, index) => 
    loadPostDataForSlide(article)
      .then(() => console.log(`✅ ${index + 1}/10`))
      .catch(err => console.error(`❌ ${index + 1}/10:`, err))
  );
  
  await Promise.allSettled(promises);
  console.log('⚡ Preload hoàn tất');
  
  isPreloading = false;
}

  
  // ========== PRELOAD INITIAL POSTS ==========
async function preloadInitialPosts() {
  if (isPreloading) return;
  isPreloading = true;
  
  const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
  const first10 = articles.slice(0, 10);
  
  console.log('🚀 Preloading', first10.length, 'bài viết...');
  
  // Tạo gallery container ngay (nhưng ẩn)
  const container = createGalleryContainer();
  const mainWrapper = container.querySelector('.swiper-main .swiper-wrapper');
  
  // Tạo empty slides
  first10.forEach(article => {
    const slide = createEmptySlide(article);
    if (slide) mainWrapper.appendChild(slide);
  });
  
  // Load dữ liệu song song
  const promises = first10.map((article, index) => 
    loadPostDataForSlide(article)
      .then(() => console.log(`✅ ${index + 1}/10`))
      .catch(err => console.error(`❌ ${index + 1}/10:`, err))
  );
  
  await Promise.allSettled(promises);
  console.log('⚡ Preload hoàn tất');
  
  isPreloading = false;
}


  
  // Khởi tạo nested swiper cho ảnh
  function initNestedSwiper(slideEl, postData) {
    const nestedEl = slideEl.querySelector('.swiper-nested');
    if (!nestedEl || nestedSwipers.has(nestedEl.id)) return;

    const shouldLoop = nestedEl.dataset.shouldLoop === 'true';

    const nested = new Swiper(nestedEl, {
      direction: 'horizontal',
      loop: shouldLoop, // Enable loop
      loopAdditionalSlides: shouldLoop ? 2 : 0, // Preload 2 slides for smooth loop
      // Pagination is removed - không hiển thị số slide nữa
      on: {
        init: function() {
          // Preload adjacent images
          const activeIndex = this.realIndex || this.activeIndex;
          if (postData.images[activeIndex - 1]) preloadImages([postData.images[activeIndex - 1]]);
          if (postData.images[activeIndex + 1]) preloadImages([postData.images[activeIndex + 1]]);
        },
        slideChange: function() {
          const activeIndex = this.realIndex || this.activeIndex;
          if (postData.images[activeIndex - 1]) preloadImages([postData.images[activeIndex - 1]]);
          if (postData.images[activeIndex + 1]) preloadImages([postData.images[activeIndex + 1]]);
        }
      }
    });

    nestedSwipers.set(nestedEl.id, nested);
  }

  // Preload bài viết lân cận
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

  // Mở gallery từ article// ========== OPEN GALLERY (REFACTORED) ==========
async function openGallery(article, skipHistory = false) {
  const postUrl = article.querySelector('a[data-post-url]')?.dataset.postUrl;
  if (!postUrl) return;

  const container = createGalleryContainer();
  const mainWrapper = container.querySelector('.swiper-main .swiper-wrapper');
  
  const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
  const currentIndex = articles.indexOf(article);
  
  if (currentIndex === -1) return;
  
  // Check xem đã có slide chưa
  let slide = mainWrapper.querySelector(`[data-post-url="${postUrl}"]`);
  const alreadyLoaded = slide && slide.dataset.loaded === 'true';
  
  // Chỉ hiện loading nếu chưa có data
  if (!alreadyLoaded) {
    showLoading();
  }
  
  // Nếu chưa có slides, tạo structure cho tất cả
  if (mainWrapper.children.length === 0) {
    articles.forEach(art => {
      const s = createEmptySlide(art);
      if (s) mainWrapper.appendChild(s);
    });
  }
  
  // Load data cho bài hiện tại + lân cận
  const startIdx = Math.max(0, currentIndex - 3);
  const endIdx = Math.min(articles.length, currentIndex + 4);
  const articlesToLoad = articles.slice(startIdx, endIdx);
  
  await Promise.allSettled(
    articlesToLoad.map(art => loadPostDataForSlide(art))
  );
  
  hideLoading();
  
  // Init hoặc update main swiper
  initMainSwiper(container, currentIndex);
  
  container.style.display = 'block';
  uiVisible = false;
  
  if (!skipHistory) historyManager.push('gallery');
}
  

  // ========== LOAD MORE POSTS (REFACTORED) ==========
async function loadMorePosts(swiperInstance) {
  if (!nextPage || loading || !swiperInstance) return;
  
  // Lưu số slides hiện tại
  const currentSlideCount = swiperInstance.slides.length;
  
  // Load thêm bài từ pagination
  await loadMore();
  
  // Lấy các bài mới
  const articles = getArticles().filter(a => !a.classList.contains('skeleton'));
  const newArticles = articles.slice(currentSlideCount);
  
  if (newArticles.length === 0) return;
  
  console.log('📦 Thêm', newArticles.length, 'bài mới vào gallery');
  
  // Tạo slides cho bài mới
  newArticles.forEach(article => {
    const newSlide = createEmptySlide(article);
    if (newSlide) {
      swiperInstance.appendSlide(newSlide);
    }
  });
  
  // Preload 3 bài đầu của batch mới
  newArticles.slice(0, 3).forEach(article => {
    loadPostDataForSlide(article).catch(() => {});
  });
}

  // Đóng gallery
  function closeGallery() {
    if (!galleryContainer) return;

    galleryContainer.style.opacity = '0';
    galleryContainer.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
      galleryContainer.style.display = 'none';
      galleryContainer.style.opacity = '1';
      galleryContainer.style.transition = '';
      
      if (mainSwiper) {
        mainSwiper.destroy(true, true);
        mainSwiper = null;
      }
      
      nestedSwipers.forEach(s => s.destroy(true, true));
      nestedSwipers.clear();

      const wrapper = galleryContainer.querySelector('.swiper-main .swiper-wrapper');
      if (wrapper) wrapper.innerHTML = '';

      currentPostData = null;

      const existingUI = document.querySelector('.gallery-custom-ui');
      if (existingUI) existingUI.remove();
      // THÊM: Reset flag
    isPreloading = false;
    }, 300);
  }

  // ========== CUSTOM UI ==========
  function addCustomUI(postUrl, article, postData) {
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
      showLoading();
      const newData = await fetchPostData(postUrl);
      hideLoading();
      alert("Đã tải lại bài viết");
      
      // Refresh current slide
      if (mainSwiper) {
        const activeSlide = mainSwiper.slides[mainSwiper.activeIndex];
        if (activeSlide && activeSlide.dataset.postUrl === postUrl) {
          newData.url = postUrl;
          newData.article = article;
          const newSlideEl = createPostSlide(newData, article);
          activeSlide.innerHTML = newSlideEl.innerHTML;
          initNestedSwiper(activeSlide, newData);
        }
      }
    });

    commentBtn.addEventListener('click', () => { 
      window.location.href = postUrl + "#comments"; 
    });

    contentBtn.addEventListener("click", () => {
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

  // ========== ATTACH EVENTS TO ARTICLES ==========
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
    
    // THÊM DÒNG NÀY: Observe article để preload
    observeArticle(article);
  }
  
  setTimeout(() => {
  attachArticleEvents();
  setupPreloadObserver(); // Setup observer
  
  // Preload 10 bài đầu tiên
  setTimeout(preloadInitialPosts, 1000);
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
      // Observe các article mới
      const newArticles = document.querySelectorAll('article:not([data-gallery-attached])');
      newArticles.forEach(observeArticle);
    }, 300);
  }
});
  
  observer.observe(document.body, { childList: true, subtree: true });

  // Expose functions
  window.__myGallery = { 
    openGallery, 
    closeGallery, 
    preloadImages, 
    fetchPostData, 
    postCache,
    getMainSwiper: () => mainSwiper,
    getNestedSwipers: () => nestedSwipers
  };
});
