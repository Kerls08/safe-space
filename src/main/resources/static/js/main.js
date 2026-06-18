/* Lightweight main.js reused for Safe Space frontend */

// ---- Navbar scroll effect ----
const navbar_s = document.getElementById('navbar');
if (navbar_s) {
  window.addEventListener('scroll', () => {
    navbar_s.classList.toggle('scrolled', window.scrollY > 20);
  });
}

// ---- Mobile nav toggle ----n
const navToggle_s = document.getElementById('navToggle');
const navMenu_s = document.getElementById('navMenu');
if (navToggle_s && navMenu_s) {
  navToggle_s.addEventListener('click', () => {
    const isOpen = navMenu_s.classList.toggle('open');
    navToggle_s.classList.toggle('active');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  navMenu_s.querySelectorAll('.navbar-link, .navbar-mobile-auth a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu_s.classList.remove('open');
      navToggle_s.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// ---- Simple reveal
function revealOnScroll_s() {
  const reveals = document.querySelectorAll('.reveal');
  const windowHeight = window.innerHeight;
  reveals.forEach(el => {
    const elementTop = el.getBoundingClientRect().top;
    const revealPoint = 100;
    if (elementTop < windowHeight - revealPoint) el.classList.add('visible');
  });
}

window.addEventListener('scroll', revealOnScroll_s);
window.addEventListener('load', revealOnScroll_s);

// Footer year
document.querySelectorAll('.footer-bottom p').forEach(p => {
  const year = new Date().getFullYear();
  p.textContent = p.textContent.replace(/\d{4}/, year);
});
