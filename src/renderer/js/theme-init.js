// Apply saved theme before any rendering to avoid flash
(function () {
  var t = localStorage.getItem('theme') ||
    (localStorage.getItem('darkMode') === '1' ? 'dark' : 'light');
  if (t !== 'light') document.documentElement.dataset.theme = t;
})();
