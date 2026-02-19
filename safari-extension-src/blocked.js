document.getElementById('btn').addEventListener('click', () => {
  window.close();
  setTimeout(() => { location.href = 'about:blank'; }, 300);
});
