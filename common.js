(function(){
  function initDarkMode(){
    const toggle=document.getElementById('darkModeToggle');
    if(!toggle)return;
    const isDark=localStorage.getItem('darkMode')==='true'||(window.matchMedia('(prefers-color-scheme: dark)').matches&&localStorage.getItem('darkMode')!=='false');
    if(isDark){
      document.documentElement.classList.add('dark');
      toggle.checked=true;
    }
    toggle.addEventListener('change',()=>{
      if(toggle.checked){
        document.documentElement.classList.add('dark');
        localStorage.setItem('darkMode','true');
      }else{
        document.documentElement.classList.remove('dark');
        localStorage.setItem('darkMode','false');
      }
    });
  }
  const apiStored=localStorage.getItem('apiDomains')||localStorage.getItem('apiDomain')||'';
  const imgStored=localStorage.getItem('imgDomains')||'';
  window.apiDomains=apiStored?apiStored.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean):[];
  window.imgDomains=imgStored?imgStored.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean):[];
  if(window.apiDomains.length===0&&Array.isArray(window.API_DOMAINS)){
    window.apiDomains=window.API_DOMAINS;
  }
  if(window.imgDomains.length===0&&Array.isArray(window.IMG_DOMAINS)){
    window.imgDomains=window.IMG_DOMAINS;
  }
  window.buildUrl=(p,d)=>d?d.replace(/\/$/,'')+p:p;
  window.withDomain=p=>window.buildUrl(p,window.imgDomains[0]);
  window.loadImgWithFallback=function(img){
    const path=img.dataset.path;
    if(!path)return;
    let i=0;
    function attempt(){img.src=window.buildUrl(path,window.imgDomains[i]||'');}
    img.onerror=()=>{if(++i<window.imgDomains.length)attempt();};
    attempt();
  };
  window.fetchWithFallback=async function(path,opt={}){
    const isApi=path.startsWith('/api/wx')||path.startsWith('/api/bil')||path.startsWith('/api/article')||path.startsWith('/api/daily')||path.startsWith('/a/');
    const domains=isApi?window.apiDomains:window.imgDomains;
    for(const d of domains){
      try{
        const res=await fetch(window.buildUrl(path,d),opt);
        if(res.ok) return res;
      }catch{}
    }
    return fetch(path,opt);
  };
  const homeLink=document.querySelector('a[aria-label="\u4e3b\u9875"]');
  let notifyDot=null;
  window.showDot=function(){
    if(!notifyDot&&homeLink){
      notifyDot=document.createElement('span');
      notifyDot.className='notify-dot';
      homeLink.classList.add('relative');
      homeLink.appendChild(notifyDot);
    }
  };
  window.hideDot=function(){
    if(notifyDot){
      notifyDot.remove();
      notifyDot=null;
    }
  };
  document.addEventListener('DOMContentLoaded',initDarkMode);
})();
