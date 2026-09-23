// Navigation uses native links, so every page works without JavaScript.
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
  const target=document.querySelector(link.getAttribute('href'));
  if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
}));
