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

  const landing = document.getElementById('landing');
  const scrollCB = () => {
    const {
      bottom
    } = landing.getBoundingClientRect();
    console.log(bottom);
    if (bottom >= 0) nav.classList.add('hidden'); //landing visible
    else nav.classList.remove('hidden'); //landing hidden
  };
  scrollCB();
  document.getElementById('content').addEventListener('scroll', scrollCB);
})()
