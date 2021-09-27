const landingLink = document.querySelector('#landing nav a');
const nav = document.getElementById('nav');
const scrollCB = () => {
  const {
    y
  } = landingLink.getBoundingClientRect();
  if (y >= 0) nav.classList.add('hidden'); //landing visible
  else nav.classList.remove('hidden'); //landing hidden
};
nav.style
scrollCB();
window.addEventListener('scroll', scrollCB);
