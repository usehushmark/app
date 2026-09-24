document.querySelectorAll('[data-search-input]').forEach(input=>{
  const scope=input.dataset.searchInput;
  const items=[...document.querySelectorAll(`[data-search-scope="${scope}"] [data-search-item]`)];
  const empty=document.querySelector(`[data-search-empty="${scope}"]`);
  const update=()=>{
    const query=input.value.trim().toLocaleLowerCase();
    let matches=0;
    items.forEach(item=>{
      const visible=!query||item.textContent.toLocaleLowerCase().includes(query);
      item.hidden=!visible;
      if(visible)matches++;
    });
    if(empty)empty.hidden=matches>0;
  };
  input.addEventListener('input',update);
});
