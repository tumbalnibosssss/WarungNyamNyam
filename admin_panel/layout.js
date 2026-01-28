document.querySelectorAll('.nav a').forEach(link => {
  if (location.pathname.endsWith(link.getAttribute('href'))) {
    link.classList.add('active')
  }
})
