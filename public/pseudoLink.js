const pseudoLinks = Array.from(document.getElementsByClassName('pseudoLink'));
pseudoLinks.forEach(link => {
  const href = link.dataset["href"];
  if (!href) return;
  link.addEventListener('click', e => {
    e.preventDefault();
    window.location.href = href;
  });
});
