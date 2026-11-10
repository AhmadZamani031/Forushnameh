(() => {
  "use strict";
  const toggle = document.getElementById("publicMenuToggle");
  const nav = document.getElementById("publicNav");
  if (!toggle || !nav) return;

  const closeMenu = () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "باز کردن منو");
    nav.classList.remove("is-open");
  };

  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.setAttribute("aria-label", opening ? "بستن منو" : "باز کردن منو");
    nav.classList.toggle("is-open", opening);
  });

  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
      toggle.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });
  const themeKey="forushnameh.theme";
  const applyTheme=mode=>{const theme=mode==="dark"?"dark":"light";document.documentElement.dataset.theme=theme;document.querySelectorAll(".brand-logo,.public-brand img").forEach(img=>{img.src=theme==="dark"?"logo-forushnameh-dark.svg":"logo-forushnameh.svg"});document.querySelectorAll(".hero-product-illustration").forEach(img=>{img.src=theme==="dark"?"hero-dashboard-dark.svg":"hero-dashboard.svg"});document.querySelectorAll("[data-theme-toggle]").forEach(button=>{button.setAttribute("aria-pressed",String(theme==="dark"));button.setAttribute("aria-label",theme==="dark"?"فعال‌سازی تم روشن":"فعال‌سازی تم تاریک");button.title=theme==="dark"?"تغییر به تم روشن":"تغییر به تم تاریک"});const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==="dark"?"#101a2b":"#103b86"};
  let mode="light";try{mode=localStorage.getItem(themeKey)==="dark"?"dark":"light"}catch(e){}applyTheme(mode);
  document.querySelectorAll("[data-theme-toggle]").forEach(button=>button.addEventListener("click",()=>{mode=mode==="dark"?"light":"dark";try{localStorage.setItem(themeKey,mode)}catch(e){}applyTheme(mode)}));
})();