/* Meta Pixel (external file so the site's Content-Security-Policy allows it) */
// local previews never report to the shop's pixel (script.js only calls fbq if it exists)
if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;
// fetch fbevents.js (~100 KB) only once the page has loaded, so it never competes with the shop's own files;
// fbq() calls made before that wait in the queue above and are sent when it arrives
var go=function(){s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)};
if(b.readyState==='complete')go();else f.addEventListener('load',go,{once:true})}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('set', 'autoConfig', false, '1127670993138595');
fbq('init', '1127670993138595');
// PageView only on the homepage and product pages (merci sends only Purchase, from script.js)
var kobgPath = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
var kobgIsHome = kobgPath === '' || kobgPath === '/index';
var kobgIsProduct = Array.prototype.some.call(document.querySelectorAll('script[type="application/ld+json"]'), function (el) { return /"@type":"Product(Group)?"/.test(el.textContent); });
if (kobgIsHome || kobgIsProduct) fbq('track', 'PageView');
}
