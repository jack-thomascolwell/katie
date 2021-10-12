function getSearchParameterByName(name, url = window.location.href) {
  name = name.replace(/[\[\]]/g, '\\$&');
  let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

const qPage = parseInt(getSearchParameterByName('page') || 1);
const paginate = Array.from(document.getElementsByClassName('pagination'));
paginate.forEach(paginator => {
  const prev = paginator.getElementsByClassName('prev')[0];
  const next = paginator.getElementsByClassName('next')[0];
  const current = paginator.getElementsByClassName('current')[0];

  const maxPage = parseInt(paginator.dataset.maxpage);
  const dPage = parseInt(paginator.dataset.page);
  const page = parseInt((dPage || qPage));

  current.innerHTML = ('' + page).padStart(3, '0');

  if (page > 1) prev.addEventListener('click', e => {
    window.location.href = `${window.location.protocol}//${window.location.host + window.location.pathname}?page=${page-1}`;
    //location.reload();
  });
  else prev.classList.add('disabled');

  if (page < maxPage) next.addEventListener('click', e => {
    window.location.href = `${window.location.protocol}//${window.location.host + window.location.pathname}?page=${page+1}`;
    //location.reload()
  });
  else next.classList.add('disabled');
});
