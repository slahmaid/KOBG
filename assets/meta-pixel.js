/* Meta Pixel (external file so the site's Content-Security-Policy allows it) */
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('set', 'autoConfig', false, '1127670993138595');
fbq('init', '1127670993138595');
// PageView only on the homepage and product pages (merci sends only Purchase, from script.js)
var kobgPath = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
var kobgIsHome = kobgPath === '' || kobgPath === '/index';
var kobgIsProduct = Array.prototype.some.call(document.querySelectorAll('script[type="application/ld+json"]'), function (el) { return /"@type":"Product(Group)?"/.test(el.textContent); });
if (kobgIsHome || kobgIsProduct) fbq('track', 'PageView');
