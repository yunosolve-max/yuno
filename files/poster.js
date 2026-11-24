// The page customers see when they tap a poster link from the cafe's WhatsApp message.
// It only reads: the cafe's name and phone, and the poster picture the cafe uploaded. Anyone with the link can open it.
import { db, doc, getDoc } from './fb-menu.js';
import { cleanCafe, esc } from './common.js';

const app = document.getElementById('app');
const id = (new URLSearchParams(location.search).get('cafe') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

function show(html) { app.innerHTML = html; }
async function main() {
  if (!id) { show('<p class="poster-note">This poster link is not complete.</p>'); return; }
  try {
    const [cs, ps] = await Promise.all([getDoc(doc(db, 'cafes', id)), getDoc(doc(db, 'cafes', id, 'media', 'poster'))]);
    if (!cs.exists()) { show('<p class="poster-note">This poster is not available.</p>'); return; }
    const cafe = cleanCafe(cs.data()), img = ps.exists() && typeof ps.data().img === 'string' ? ps.data().img : '';
    document.title = cafe.name + ' | Poster';
    if (!img || !/^data:image\//.test(img)) {
      show('<h1 class="poster-name">' + esc(cafe.name) + '</h1><p class="poster-note">There is no poster right now. Have a look at our menu.</p>' +
        '<a class="btn-primary poster-cta" href="/menu.html?cafe=' + encodeURIComponent(id) + '">See our menu</a>');
      return;
    }
    const tel = String(cafe.settings.phone || '').replace(/[^\d+]/g, '');
    show('<h1 class="poster-name">' + esc(cafe.name) + '</h1>' +
      '<img class="poster-img" src="' + esc(img) + '" alt="Poster from ' + esc(cafe.name) + '">' +
      '<a class="btn-primary poster-cta" href="/menu.html?cafe=' + encodeURIComponent(id) + '">See our menu</a>' +
      (tel ? '<a class="btn btn-soft poster-cta" href="tel:' + esc(tel) + '">Call us</a>' : '') +
      (cafe.settings.address ? '<p class="poster-note">' + esc(cafe.settings.address) + '</p>' : ''));
  } catch (e) {
    show('<p class="poster-note">The poster could not load. Check your internet and refresh.</p>');
  }
}
main();
