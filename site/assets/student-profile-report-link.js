(function(){
  'use strict';
  if(window.YPStudentProfileReportLink)return;
  const config=window.APP_CONFIG||{};
  const p=new URLSearchParams(location.hash.replace(/^#/,''));
  const id=p.get(config.serverHashKey||'id'),api=p.get('api')||config.backendUrl||'';
  let url='',loading=false,lastTry=0;
  function attach(){
    if(!url)return;
    const toolbar=document.querySelector('.report-toolbar__buttons');
    if(toolbar&&!toolbar.querySelector('#ypStudentProfileButton')){
      const a=document.createElement('a');a.id='ypStudentProfileButton';a.className='btn btn--soft btn--small';a.href=url;a.textContent='◎ 학생 통합페이지';
      toolbar.insertBefore(a,toolbar.firstChild);
    }
    const side=document.querySelector('.report-side-nav');
    if(side&&!side.querySelector('#ypStudentProfileSide')){
      const a=document.createElement('a');a.id='ypStudentProfileSide';a.className='side-nav__link';a.href=url;a.innerHTML='<span class="side-nav__icon">◎</span><span>학생 통합페이지</span>';side.prepend(a);
    }
  }
  async function resolve(){
    if(!id||!api||loading||url||Date.now()-lastTry<10000)return;
    lastTry=Date.now();loading=true;
    try{
      const cb=`_yp_rep_${Date.now()}_${Math.floor(Math.random()*1e7)}`,u=new URL(api),s=document.createElement('script');
      u.searchParams.set('action','studentResolve');u.searchParams.set('id',id);u.searchParams.set('callback',cb);
      const r=await new Promise((good,bad)=>{
        const timer=setTimeout(()=>{clear();bad(new Error('timeout'));},45000);
        function clear(){clearTimeout(timer);s.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}}
        window[cb]=resp=>{clear();resp?.ok===false?bad(new Error(resp.error)):good(resp)};
        s.onerror=()=>{clear();bad(new Error('network'));};s.src=u.href;document.head.appendChild(s);
      });
      if(r.studentToken){const target=new URL('student.html',location.href),h=new URLSearchParams();h.set('sid',r.studentToken);h.set('api',api);target.hash=h.toString();url=target.href;attach();}
    }catch(e){console.warn('통합페이지 버튼 준비 실패:',e.message);}finally{loading=false;}
  }
  const obs=new MutationObserver(()=>{if(url)attach();});obs.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',resolve);
  window.YPStudentProfileReportLink={version:'3.13.0',resolve};
})();
