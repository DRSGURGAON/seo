/*! GBP Posts Widget v1 - shows Google Business Profile posts from a posts.json feed.
 * Embed: <div data-gbp-posts data-src="/gbp/posts.json" data-cols="4" data-limit="8" data-theme="light" data-accent="#b3202f"></div>
 *        <script src="/gbp/gbp-posts.js" defer></script>
 * Posts appear on the site on their scheduled date (same time they go live on Google). Add ?gbp=all to preview all.
 */
(function(){
var CSS=`.gbp{--a:var(--gbp-accent,#b3202f);--bg:#fff;--fg:#1e293b;--mut:#64748b;--bd:#e2e8f0;font-family:inherit;color:var(--fg)}
.gbp[data-theme=dark]{--bg:#1b1416;--fg:#f1e9ea;--mut:#b9a9ac;--bd:#3a2a2d}
.gbp *{box-sizing:border-box}
.gbp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.gbp-h{font-size:20px;font-weight:800;margin:0;display:flex;align-items:center;gap:10px}.gbp-live{width:10px;height:10px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 0 rgba(22,163,74,.6);animation:gbpp 1.8s infinite}@keyframes gbpp{70%{box-shadow:0 0 0 9px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}@media(prefers-reduced-motion:reduce){.gbp-live{animation:none}}.gbp-acts{display:flex;gap:8px;flex-wrap:wrap}.gbp-act{border:1.5px solid var(--a);color:var(--a);text-decoration:none;font-weight:700;font-size:13px;padding:7px 13px;border-radius:999px}.gbp-grid{display:grid;gap:18px;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr))}
@media(max-width:1024px){.gbp-grid{grid-template-columns:repeat(min(var(--cols,4),2),minmax(0,1fr))}}
@media(max-width:600px){.gbp-grid{grid-template-columns:1fr}}
.gbp-card{background:var(--bg);border:1px solid var(--bd);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:transform .15s,box-shadow .15s}
.gbp-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.10)}
.gbp-img{aspect-ratio:4/3;background:#e5e7eb center/cover no-repeat;display:block;width:100%;border:0;cursor:pointer}
.gbp-body{padding:14px 15px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.gbp-date{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px}
.gbp-g{width:14px;height:14px;border-radius:50%;background:conic-gradient(#ea4335 0 25%,#fbbc05 0 50%,#34a853 0 75%,#4285f4 0)}
.gbp-t{font-size:16px;font-weight:700;line-height:1.3;margin:0}
.gbp-x{font-size:14px;line-height:1.5;color:var(--mut);margin:0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.gbp-row{margin-top:auto;display:flex;gap:8px;align-items:center;justify-content:space-between;padding-top:6px}
.gbp-more{background:none;border:0;color:var(--a);font-weight:700;font-size:13px;cursor:pointer;padding:0}
.gbp-cta{background:var(--a);color:#fff!important;text-decoration:none;font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px}
.gbp-cta:hover{filter:brightness(1.1)}
.gbp-foot{text-align:center;margin-top:22px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.gbp-btn{background:var(--bg);color:var(--a);border:1.5px solid var(--a);font-weight:700;border-radius:999px;padding:10px 20px;cursor:pointer;text-decoration:none;font-size:14px}
.gbp-empty{padding:28px;text-align:center;color:var(--mut);border:1px dashed var(--bd);border-radius:12px}
.gbp-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:99999}
.gbp-sheet{background:var(--bg);color:var(--fg);max-width:640px;width:100%;max-height:90vh;overflow:auto;border-radius:16px;position:relative}
.gbp-sheet .gbp-img{aspect-ratio:16/9;cursor:default}
.gbp-sheet .gbp-body{padding:20px}
.gbp-sheet .gbp-x{display:block;-webkit-line-clamp:unset;font-size:15px;color:var(--fg)}
.gbp-close{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.55);color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}`;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function act(d,id){var a=(d.actions||[]).filter(function(x){return x.id===id})[0];return a}
function fmt(d){try{return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}catch(e){return ''}}
function init(el){
 if(el.__gbp)return;el.__gbp=1;
 var src=el.getAttribute('data-src')||'/gbp/posts.json',cols=+(el.getAttribute('data-cols')||4),limit=+(el.getAttribute('data-limit')||8),step=limit,
  theme=el.getAttribute('data-theme')||'light',acc=el.getAttribute('data-accent'),all=/[?&]gbp=all/.test(location.search)||el.getAttribute('data-show')==='all';
 el.classList.add('gbp');el.setAttribute('data-theme',theme);el.style.setProperty('--cols',cols);if(acc)el.style.setProperty('--gbp-accent',acc);
 fetch(src,{cache:'no-cache'}).then(function(r){return r.json()}).then(function(d){
  var now=Date.now(),list=(d.posts||[]).filter(function(p){return all||new Date(p.date).getTime()<=now}).sort(function(a,b){return new Date(b.date)-new Date(a.date)});
  var shown=limit;function pa(p){return typeof p.cta==='string'?act(d,p.cta):p.cta}
  var head='<div class="gbp-head"><h2 class="gbp-h"><span class="gbp-live"></span>'+esc(el.getAttribute('data-heading')||d.heading||'Live Updates')+(el.getAttribute('data-city')||d.city?' &bull; '+esc(el.getAttribute('data-city')||d.city):'')+'</h2><div class="gbp-acts">'+(d.actions||[]).filter(function(a){return a.id!=='call'}).map(function(a){return '<a class="gbp-act" href="'+esc(a.url)+'"'+(/^http/.test(a.url)?' target="_blank" rel="noopener"':'')+'>'+esc(a.label)+'</a>'}).join('')+'</div></div>';
  function render(){
   if(!list.length){el.innerHTML='<div class="gbp-empty">Fresh updates coming soon.</div>';return}
   var h=head+'<div class="gbp-grid">'+list.slice(0,shown).map(function(p,i){
    return '<article class="gbp-card"><button class="gbp-img" data-i="'+i+'" aria-label="Open post" style="background-image:url(\''+esc(p.image||'')+'\')"></button><div class="gbp-body"><div class="gbp-date"><span class="gbp-g"></span>'+fmt(p.date)+'</div><h3 class="gbp-t">'+esc(p.title)+'</h3><p class="gbp-x">'+esc(p.text)+'</p><div class="gbp-row"><button class="gbp-more" data-i="'+i+'">Read more</button>'+(pa(p)?'<a class="gbp-cta" href="'+esc(pa(p).url)+'">'+esc(pa(p).label)+'</a>':'')+'</div></div></article>'}).join('')+'</div><div class="gbp-foot">'+
    (shown<list.length?'<button class="gbp-btn" data-more>Load more</button>':'')+(d.profile_url?'<a class="gbp-btn" href="'+esc(d.profile_url)+'" target="_blank" rel="noopener">View on Google</a>':'')+'</div>';
   el.innerHTML=h;
   el.querySelectorAll('[data-i]').forEach(function(b){b.onclick=function(){open(list[+b.getAttribute('data-i')])}});
   var m=el.querySelector('[data-more]');if(m)m.onclick=function(){shown+=step;render()};
  }
  function open(p){
   var o=document.createElement('div');o.className='gbp-modal gbp';o.setAttribute('data-theme',theme);if(acc)o.style.setProperty('--gbp-accent',acc);
   o.innerHTML='<div class="gbp-sheet" role="dialog" aria-modal="true"><button class="gbp-close" aria-label="Close">&times;</button><div class="gbp-img" style="background-image:url(\''+esc(p.image||'')+'\')"></div><div class="gbp-body"><div class="gbp-date"><span class="gbp-g"></span>'+fmt(p.date)+'</div><h3 class="gbp-t">'+esc(p.title)+'</h3><p class="gbp-x">'+esc(p.text)+'</p>'+'<div class="gbp-acts">'+(d.actions||[]).map(function(a){return '<a class="gbp-cta" href="'+esc(a.url)+'">'+esc(a.label)+'</a>'}).join('')+'</div>'+'</div></div>';
   function close(){o.remove();document.removeEventListener('keydown',k)}function k(e){if(e.key==='Escape')close()}
   o.onclick=function(e){if(e.target===o)close()};o.querySelector('.gbp-close').onclick=close;document.addEventListener('keydown',k);document.body.appendChild(o);
  }
  render();
  var ld={"@context":"https://schema.org","@type":"ItemList","itemListElement":list.slice(0,limit).map(function(p,i){return{"@type":"ListItem","position":i+1,"item":{"@type":"BlogPosting","headline":p.title,"datePublished":p.date,"image":p.image,"articleBody":p.text}}})};
  var s=document.createElement('script');s.type='application/ld+json';s.text=JSON.stringify(ld);el.appendChild(s);
 }).catch(function(){el.innerHTML=''});
}
var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
function boot(){document.querySelectorAll('[data-gbp-posts]').forEach(init)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
