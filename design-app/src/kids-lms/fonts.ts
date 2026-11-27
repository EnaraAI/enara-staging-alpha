// frontend/index.html: the Google Fonts the lms-test front end loads (Source Sans 3, Bricolage Grotesque, IBM Plex Sans Arabic,
// JetBrains Mono, Poppins). Added once, when a copied lms-test screen is first shown (CSP: fonts.googleapis.com / fonts.gstatic.com).
const FONTS = 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800;900&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Poppins:wght@600&display=swap';

export function loadLmsFonts() {
  if (document.querySelector('link[data-lms-fonts]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS });
  link.dataset.lmsFonts = '';
  document.head.appendChild(link);
}
