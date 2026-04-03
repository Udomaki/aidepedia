// AIdepedia Performance Optimizations

// Lazy load images with Intersection Observer
if ('IntersectionObserver' in window) {
  const lazyImages = document.querySelectorAll('img[loading="lazy"]');
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src || img.src;
        img.classList.remove('lazy');
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.01
  });

  lazyImages.forEach(img => imageObserver.observe(img));
}

// Preload critical resources
function preloadCriticalResources() {
  // Preload fonts
  const criticalFonts = [
    '/fonts/inter-var.woff2'
  ];

  criticalFonts.forEach(font => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = font;
    document.head.appendChild(link);
  });
}

// Defer non-critical CSS
function deferNonCriticalCSS() {
  const nonCriticalStyles = document.querySelectorAll('link[data-defer]');
  
  nonCriticalStyles.forEach(link => {
    link.rel = 'stylesheet';
    link.removeAttribute('data-defer');
  });
}

// Optimize scroll performance
let ticking = false;

function optimizeScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      // Throttled scroll handlers here
      ticking = false;
    });
    ticking = true;
  }
}

window.addEventListener('scroll', optimizeScroll, { passive: true });

// Reduce layout shifts
function reserveSpaceForImages() {
  document.querySelectorAll('img[width][height]').forEach(img => {
    img.style.aspectRatio = `${img.width} / ${img.height}`;
  });
}

// Initialize performance optimizations
document.addEventListener('DOMContentLoaded', () => {
  reserveSpaceForImages();
  
  // Defer non-critical operations
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      deferNonCriticalCSS();
    });
  } else {
    setTimeout(deferNonCriticalCSS, 100);
  }
});

// Monitor Core Web Vitals
if ('PerformanceObserver' in window) {
  // Largest Contentful Paint
  try {
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log('LCP:', lastEntry.startTime);
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  // First Input Delay
  try {
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        console.log('FID:', entry.processingStart - entry.startTime);
      });
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch (e) {}

  // Cumulative Layout Shift
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      console.log('CLS:', clsValue);
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
}

// Export for use in other scripts
window.AIdePediaPerformance = {
  preloadCriticalResources,
  deferNonCriticalCSS,
  reserveSpaceForImages
};
