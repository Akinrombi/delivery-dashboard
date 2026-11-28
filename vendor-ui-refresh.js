/* Zenzora Vendor UI polish. Add after the app's existing scripts. */
(function () {
  "use strict";
  if (window.__zenzoraVendorUiRefresh) return;
  window.__zenzoraVendorUiRefresh = true;

  function installStyles() {
    if (document.getElementById("zzVendorUiRefreshStyles")) return;
    var style = document.createElement("style");
    style.id = "zzVendorUiRefreshStyles";
    style.textContent = `
      :root{--zz-ui-ink:#17231f;--zz-ui-muted:#62736b;--zz-ui-line:#e2ebe6;--zz-ui-canvas:#f5f8f6;--zz-ui-brand:#087f5b;--zz-ui-soft:#eaf7f0;--zz-ui-shadow:0 10px 30px rgba(19,50,36,.07)}
      body{color:var(--zz-ui-ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      .content{width:min(100%,1320px);padding:clamp(18px,3vw,34px)}
      .page-heading{align-items:flex-start;flex-wrap:wrap;row-gap:12px}
      .page-title{letter-spacing:-.035em;line-height:1.15}
      .page-subtitle{line-height:1.55;max-width:65ch}
      .stats-grid{align-items:stretch;gap:clamp(10px,1.5vw,16px)}
      .stat-card,.welcome-card,.auth-card,.order-card,.orders-list>.card,.card{box-shadow:var(--zz-ui-shadow)}
      .stat-card,.order-card,.orders-list>.card{border:1px solid var(--zz-ui-line)}
      .btn,.nav-btn{transition:background-color .16s ease,color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease}
      .btn:active,.nav-btn:active{transform:translateY(1px)}
      .btn:focus-visible,.nav-btn:focus-visible,button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid rgba(8,127,91,.28);outline-offset:2px}
      .form-control{min-height:44px;transition:border-color .16s ease,box-shadow .16s ease}
      .form-control:focus{border-color:var(--zz-ui-brand);box-shadow:0 0 0 3px rgba(8,127,91,.12)}
      .nav-btn.active{box-shadow:inset 3px 0 0 var(--zz-ui-brand)}
      @media(max-width:900px){.content{padding:20px}.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.content{padding:16px 14px calc(24px + env(safe-area-inset-bottom))}.page-heading{margin-bottom:18px}.page-title{font-size:clamp(21px,6vw,27px)}.stats-grid{gap:10px}.stat-card{min-width:0}.btn{min-height:44px}.mobile-header{position:sticky;top:0;z-index:25;padding-top:env(safe-area-inset-top);backdrop-filter:blur(12px)}.sidebar{box-shadow:12px 0 30px rgba(15,23,42,.08)}}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installStyles, { once: true });
  } else {
    installStyles();
  }
})();
