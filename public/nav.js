(function() {
  const navIcon = document.getElementById('navIcon');
  const nav = document.getElementById('nav')
  navIcon.addEventListener('click', () => {
    nav.classList.toggle('expanded');
    if (nav.classList.contains('expanded')) {
      navIcon.classList.remove('fa-bars');
      navIcon.classList.add('fa-times');
    } else {
      navIcon.classList.add('fa-bars');
      navIcon.classList.remove('fa-times');
    }
  });
})()
