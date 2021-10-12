const deleteLinks = Array.from(document.getElementsByClassName('delete'));
deleteLinks.forEach(link => {
  console.log(link)
  const url = link.dataset["url"];
  const confirmText = link.dataset["confirm"];
  if (!url || !confirmText) return;
  link.addEventListener('click', e => {
    e.preventDefault();
    if (!confirm(confirmText)) return;
    const req = new XMLHttpRequest();
    req.onreadystatechange = function() {
      if (req.readyState === XMLHttpRequest.DONE) location.reload();
    };
    req.open("DELETE", url, true);
    req.send();
  });
});
