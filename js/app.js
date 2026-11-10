// =====================================================================
//  Mi Maleta ✈️ — Completo con Enlaces Clickeables en Notas y Lista Pública
// =====================================================================

import { auth, db, googleProvider } from './firebase-init.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signOut, updateProfile
} from 'firebase/auth';
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, query, where,
  onSnapshot, getDocs
} from 'firebase/firestore';

// =====================================================================
//  CONSTANTES
// =====================================================================
const CATEGORY_ICONS = [
  { emoji: '👕', label: 'Ropa' },
  { emoji: '🧴', label: 'Aseo' },
  { emoji: '💻', label: 'Tecnología' },
  { emoji: '📄', label: 'Documentos' },
  { emoji: '💊', label: 'Medicinas' },
  { emoji: '🎮', label: 'Entretenimiento' },
  { emoji: '👟', label: 'Calzado' },
  { emoji: '🎒', label: 'Accesorios' },
  { emoji: '🍕', label: 'Comida' },
  { emoji: '☀️', label: 'Playa' },
  { emoji: '📷', label: 'Fotografía' },
  { emoji: '📦', label: 'Otros' }
];

// =====================================================================
//  ESTADO
// =====================================================================
let currentUser = null;
let currentTripId = null;
let currentCategoryId = null;
let currentTripData = null;
let currentCategoryData = null;
let allTripCategories = [];
let allTripItems = {};
let activeTripTab = 'categories';
let unsubTrips = null;
let unsubCategories = null;
let unsubTripItems = null;
let deleteCallback = null;
let pendingPhotoFile = null;
let activeShareUrl = '';

// =====================================================================
//  REFS HELPERS
// =====================================================================
const userCol = (colName) => collection(db, 'users', currentUser.uid, colName);
const userDoc = (colName, docId) => doc(db, 'users', currentUser.uid, colName, docId);
const $ = (id) => document.getElementById(id);

// =====================================================================
//  HELPER: DETECCIÓN Y FORMATO DE ENLACES EN NOTAS
// =====================================================================
function formatNotesWithLinks(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const urlRegex = /((https?:\/\/|www\.)[^\s]+)/gi;

  return escaped.replace(urlRegex, (rawUrl) => {
    let cleanUrl = rawUrl;
    let trailing = '';
    while (/[.,;:!?)\]]$/.test(cleanUrl)) {
      trailing = cleanUrl.slice(-1) + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const href = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline font-semibold break-all hover:text-indigo-800 inline-block" onclick="event.stopPropagation()">🔗 ${cleanUrl}</a>${trailing}`;
  });
}

// =====================================================================
//  UI HELPERS
// =====================================================================
function showView(viewId) {
  ['trips-view', 'trip-detail-view', 'category-detail-view'].forEach(id => {
    $(id).classList.add('hidden');
  });
  $(viewId).classList.remove('hidden');
}

function showModal(modalId) {
  $(modalId).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideModal(modalId) {
  $(modalId).classList.add('hidden');
  document.body.style.overflow = '';
}

function hideAllModals() {
  ['trip-modal', 'category-modal', 'item-modal', 'delete-modal', 'photo-viewer-modal', 'share-modal'].forEach(hideModal);
}

let toastTimeout;
function showToast(message, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  $('toast-icon').textContent = icons[type] || '✅';
  $('toast-message').textContent = message;
  const toast = $('toast-notification');
  toast.classList.remove('hidden');
  toast.firstElementChild.className = 'bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 toast-enter';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.firstElementChild.classList.remove('toast-enter');
    toast.firstElementChild.classList.add('toast-exit');
    setTimeout(() => { toast.classList.add('hidden'); toast.firstElementChild.classList.remove('toast-exit'); }, 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function confirmDelete(message, callback) {
  $('delete-message').textContent = message;
  deleteCallback = callback;
  showModal('delete-modal');
}

// =====================================================================
//  COMPARTIR: MODO INVITADO PÚBLICO (ABIERTO POR ENLACE SIN CUENTA)
// =====================================================================
async function checkSharedLink() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('share');
  if (!shareId) return false;

  $('auth-screen').style.setProperty('display', 'none', 'important');
  $('app-screen').style.setProperty('display', 'none', 'important');
  $('shared-public-view').classList.remove('hidden');

  try {
    const docRef = doc(db, 'shared_lists', shareId);
    
    onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) {
        $('shared-trip-title').textContent = "Lista no encontrada";
        $('shared-trip-dest').textContent = "El enlace no es válido o ha expirado.";
        return;
      }

      const data = docSnap.data();
      $('shared-trip-title').textContent = data.tripName || "Lista de la compra";
      $('shared-trip-dest').textContent = data.destination ? `📍 ${data.destination}` : '';

      const items = data.items || [];
      const container = $('shared-items-container');
      const emptyState = $('shared-empty-state');

      if (items.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
      }
      emptyState.classList.add('hidden');

      items.sort((a, b) => (a.packed === b.packed ? 0 : a.packed ? 1 : -1));

      container.innerHTML = items.map((item, idx) => {
        const isBought = item.packed;
        const bg = isBought ? 'bg-emerald-50/70 border-emerald-200' : 'bg-white border-amber-200/80';
        const txt = isBought ? 'line-through text-gray-400' : 'text-gray-900 font-bold';

        return `
          <div class="flex items-start gap-3 p-3.5 rounded-2xl border ${bg} shadow-sm transition-all">
            <input type="checkbox" class="shared-toggle-cb w-5 h-5 rounded cursor-pointer mt-0.5 flex-shrink-0"
                   data-item-idx="${idx}" ${isBought ? 'checked' : ''}>
            ${item.photoUrl ? `<img src="${item.photoUrl}" class="w-11 h-11 object-contain rounded-xl bg-gray-50 border border-gray-100 flex-shrink-0" alt="foto">` : ''}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm ${txt}">${item.name}</span>
                ${item.quantity > 1 ? `<span class="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">×${item.quantity}</span>` : ''}
                ${item.category ? `<span class="text-xs text-gray-400">(${item.category})</span>` : ''}
              </div>
              ${item.notes ? `<div class="text-xs text-gray-600 mt-1 break-words">${formatNotesWithLinks(item.notes)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.shared-toggle-cb').forEach(cb => {
        cb.addEventListener('change', async (e) => {
          const clickedIdx = parseInt(e.target.dataset.itemIdx);
          items[clickedIdx].packed = e.target.checked;
          await updateDoc(docRef, { items });
        });
      });
    });

  } catch (err) {
    console.error("Error al cargar lista compartida:", err);
    $('shared-trip-title').textContent = "Error al cargar la lista";
  }

  return true;
}

// =====================================================================
//  CREAR Y COMPARTIR EL ENLACE PÚBLICO
// =====================================================================
async function handleCreateShareLink() {
  const items = allTripItems[currentTripId] || [];
  const shoppingItems = items.filter(i => i.toBuy);

  if (shoppingItems.length === 0) {
    showToast('No hay artículos marcados "Por comprar"', 'info');
    return;
  }

  const shareBtn = $('share-shopping-btn');
  shareBtn.disabled = true;
  shareBtn.innerHTML = `<span>⏳</span> Generando...`;

  try {
    const shareId = `${currentTripId}_shopping`;

    const sharedData = {
      tripName: currentTripData ? currentTripData.name : 'Mi Viaje',
      destination: currentTripData ? currentTripData.destination : '',
      updatedAt: Date.now(),
      items: shoppingItems.map(item => {
        const cat = allTripCategories.find(c => c.id === item.categoryId);
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity || 1,
          notes: item.notes || '',
          photoUrl: item.photoUrl || '',
          category: cat ? cat.name : 'General',
          packed: !!item.packed
        };
      })
    };

    await setDoc(doc(db, 'shared_lists', shareId), sharedData);

    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    activeShareUrl = `${baseUrl}?share=${shareId}`;

    $('share-url-text').textContent = activeShareUrl;
    showModal('share-modal');

  } catch (err) {
    console.error("Error al compartir:", err);
    showToast('Error al generar enlace', 'error');
  } finally {
    shareBtn.disabled = false;
    shareBtn.innerHTML = `<span>🔗</span> Compartir enlace`;
  }
}

async function copyShareUrl() {
  try {
    await navigator.clipboard.writeText(activeShareUrl);
    showToast('¡Enlace web copiado!');
    hideModal('share-modal');
  } catch (e) {
    showToast('Copia el enlace manualmente del recuadro', 'info');
  }
}

function shareUrlViaWhatsApp() {
  const tripName = currentTripData ? currentTripData.name : 'este viaje';
  const msg = `¡Hola! Aquí tienes la lista interactiva de cosas para comprar para ${tripName}: ${activeShareUrl}`;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// =====================================================================
//  AUTH
// =====================================================================
async function handleLogin() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  $('login-error').classList.add('hidden');
  if (!email || !password) {
    $('login-error').textContent = 'Completa todos los campos';
    $('login-error').classList.remove('hidden');
    return;
  }
  try {
    $('login-btn').disabled = true;
    $('login-btn').textContent = 'Entrando...';
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const msgs = {
      'auth/user-not-found': 'No existe una cuenta con ese correo',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/invalid-email': 'Correo electrónico inválido',
      'auth/invalid-credential': 'Credenciales inválidas',
      'auth/too-many-requests': 'Demasiados intentos. Espera un momento',
    };
    $('login-error').textContent = msgs[e.code] || 'Error al iniciar sesión';
    $('login-error').classList.remove('hidden');
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Iniciar sesión';
  }
}

async function handleRegister() {
  const name = $('register-name').value.trim();
  const email = $('register-email').value.trim();
  const password = $('register-password').value;
  $('register-error').classList.add('hidden');
  if (!name || !email || !password) {
    $('register-error').textContent = 'Completa todos los campos';
    $('register-error').classList.remove('hidden');
    return;
  }
  if (password.length < 6) {
    $('register-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
    $('register-error').classList.remove('hidden');
    return;
  }
  try {
    $('register-btn').disabled = true;
    $('register-btn').textContent = 'Creando cuenta...';
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    const msgs = {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese correo',
      'auth/invalid-email': 'Correo electrónico inválido',
      'auth/weak-password': 'La contraseña es muy débil',
    };
    $('register-error').textContent = msgs[e.code] || 'Error al crear la cuenta';
    $('register-error').classList.remove('hidden');
  } finally {
    $('register-btn').disabled = false;
    $('register-btn').textContent = 'Crear cuenta';
  }
}

async function handleGoogleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error(e);
    if (e.code !== 'auth/popup-closed-by-user') {
      showToast('Error al iniciar con Google', 'error');
    }
  }
}

function handleLogout() {
  cleanupAllListeners();
  signOut(auth);
}

function showAuthScreen() {
  $('auth-screen').style.setProperty('display', 'flex', 'important');
  $('app-screen').style.setProperty('display', 'none', 'important');
}

function showAppScreen(user) {
  $('auth-screen').style.setProperty('display', 'none', 'important');
  $('app-screen').style.setProperty('display', 'block', 'important');
  
  $('user-name-display').textContent = user.displayName || user.email;
  showView('trips-view');
  loadTrips();
}

function cleanupAllListeners() {
  [unsubTrips, unsubCategories, unsubTripItems].forEach(fn => fn && fn());
  unsubTrips = unsubCategories = unsubTripItems = null;
  allTripItems = {};
  allTripCategories = [];
}

function cleanupCategoryListeners() {
  [unsubCategories, unsubTripItems].forEach(fn => fn && fn());
  unsubCategories = unsubTripItems = null;
}

// =====================================================================
//  VIAJES (TRIPS)
// =====================================================================
function loadTrips() {
  if (unsubTrips) unsubTrips();
  const q = query(userCol('trips'));
  unsubTrips = onSnapshot(q, (snap) => {
    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    trips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderTrips(trips);
    trips.forEach(trip => loadTripItemsForProgress(trip.id));
  }, (err) => {
    console.error('Error loading trips:', err);
    showToast('Error al cargar viajes', 'error');
  });
}

function loadTripItemsForProgress(tripId) {
  const q = query(userCol('items'), where('tripId', '==', tripId));
  onSnapshot(q, (snap) => {
    allTripItems[tripId] = snap.docs.map(d => d.data());
    updateTripCardProgress(tripId);
  });
}

function updateTripCardProgress(tripId) {
  const items = allTripItems[tripId] || [];
  const total = items.length;
  const packed = items.filter(i => i.packed).length;
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
  const bar = document.querySelector(`[data-trip-card="${tripId}"] .trip-progress-bar`);
  const text = document.querySelector(`[data-trip-card="${tripId}"] .trip-progress-text`);
  const count = document.querySelector(`[data-trip-card="${tripId}"] .trip-items-count`);
  if (bar) bar.style.width = pct + '%';
  if (text) text.textContent = pct + '%';
  if (count) count.textContent = `${packed}/${total} elementos`;
}

function renderTrips(trips) {
  const container = $('trips-container');
  const empty = $('trips-empty');
  if (trips.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.innerHTML = trips.map(trip => {
    const dest = trip.destination ? `📍 ${trip.destination}` : '';
    let dates = '';
    if (trip.startDate && trip.endDate) {
      dates = `📅 ${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}`;
    } else if (trip.startDate) {
      dates = `📅 ${formatDate(trip.startDate)}`;
    }
    return `
      <div class="trip-card bg-white rounded-2xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
           data-trip-card="${trip.id}" data-trip-id="${trip.id}">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-gray-900 truncate">${trip.name}</h3>
            ${dest ? `<p class="text-sm text-gray-500 mt-1">${dest}</p>` : ''}
            ${dates ? `<p class="text-xs text-gray-400 mt-1">${dates}</p>` : ''}
          </div>
        </div>
        <div class="mt-4">
          <div class="flex justify-between text-xs text-gray-500 mb-1">
            <span class="trip-items-count">0/0 elementos</span>
            <span class="trip-progress-text">0%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-2">
            <div class="trip-progress-bar bg-indigo-500 h-2 rounded-full progress-bar" style="width: 0%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openTripModal(tripData = null) {
  $('trip-form').reset();
  $('trip-id-hidden').value = '';
  if (tripData) {
    $('trip-modal-title').textContent = 'Editar Viaje';
    $('trip-id-hidden').value = tripData.id;
    $('trip-name-input').value = tripData.name || '';
    $('trip-destination-input').value = tripData.destination || '';
    $('trip-start-date').value = tripData.startDate || '';
    $('trip-end-date').value = tripData.endDate || '';
  } else {
    $('trip-modal-title').textContent = 'Nuevo Viaje';
  }
  showModal('trip-modal');
  $('trip-name-input').focus();
}

async function saveTripForm() {
  const name = $('trip-name-input').value.trim();
  if (!name) return;
  const data = {
    name,
    destination: $('trip-destination-input').value.trim(),
    startDate: $('trip-start-date').value,
    endDate: $('trip-end-date').value,
  };
  const editId = $('trip-id-hidden').value;
  try {
    if (editId) {
      await updateDoc(userDoc('trips', editId), data);
      showToast('Viaje actualizado');
      if (currentTripId === editId) {
        currentTripData = { ...currentTripData, ...data };
        renderTripDetailHeader();
      }
    } else {
      data.createdAt = Date.now();
      await addDoc(userCol('trips'), data);
      showToast('Viaje creado');
    }
    hideModal('trip-modal');
  } catch (e) {
    console.error(e);
    showToast('Error al guardar el viaje', 'error');
  }
}

async function deleteTrip(tripId) {
  confirmDelete('Se eliminarán todas las categorías y elementos de este viaje.', async () => {
    try {
      const itemsSnap = await getDocs(query(userCol('items'), where('tripId', '==', tripId)));
      for (const itemDoc of itemsSnap.docs) {
        await deleteDoc(itemDoc.ref);
      }
      const catsSnap = await getDocs(query(userCol('categories'), where('tripId', '==', tripId)));
      for (const catDoc of catsSnap.docs) {
        await deleteDoc(catDoc.ref);
      }
      await deleteDoc(userDoc('trips', tripId));
      showToast('Viaje eliminado');
      if (currentTripId === tripId) {
        currentTripId = null;
        cleanupCategoryListeners();
      }
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar', 'error');
    }
  });
}

// =====================================================================
//  DETALLE DE VIAJE
// =====================================================================
function switchTripTab(tabName) {
  activeTripTab = tabName;
  if (tabName === 'categories') {
    $('tab-categories-btn').className = 'py-3 px-5 border-b-2 border-indigo-600 text-indigo-600 font-bold text-sm sm:text-base flex items-center gap-2 transition';
    $('tab-shopping-btn').className = 'py-3 px-5 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm sm:text-base flex items-center gap-2 transition';
    $('trip-categories-tab-content').classList.remove('hidden');
    $('trip-shopping-tab-content').classList.add('hidden');
  } else {
    $('tab-shopping-btn').className = 'py-3 px-5 border-b-2 border-amber-600 text-amber-700 font-bold text-sm sm:text-base flex items-center gap-2 transition';
    $('tab-categories-btn').className = 'py-3 px-5 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm sm:text-base flex items-center gap-2 transition';
    $('trip-shopping-tab-content').classList.remove('hidden');
    $('trip-categories-tab-content').classList.add('hidden');
    renderShoppingList(allTripItems[currentTripId] || []);
  }
}

function openTrip(tripId) {
  cleanupCategoryListeners();
  currentTripId = tripId;
  showView('trip-detail-view');
  switchTripTab('categories');
  loadCategoriesAndItems(tripId);
}

function renderTripDetailHeader() {
  const t = currentTripData;
  if (!t) return;
  $('trip-detail-name').textContent = t.name;
  let info = '';
  if (t.destination) info += `📍 ${t.destination}`;
  if (t.startDate) {
    if (info) info += '  ·  ';
    info += `📅 ${formatDate(t.startDate)}`;
    if (t.endDate) info += ` — ${formatDate(t.endDate)}`;
  }
  $('trip-detail-info').textContent = info;
}

function loadCategoriesAndItems(tripId) {
  const qCat = query(userCol('categories'), where('tripId', '==', tripId));
  unsubCategories = onSnapshot(qCat, (snap) => {
    allTripCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allTripCategories.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    renderCategories(allTripCategories);
    if (allTripItems[tripId]) {
      renderShoppingList(allTripItems[tripId]);
    }
  }, (err) => console.error("Error categorías:", err));

  const qItems = query(userCol('items'), where('tripId', '==', tripId));
  unsubTripItems = onSnapshot(qItems, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allTripItems[tripId] = items;
    updateTripDetailProgress(items);
    updateCategoryCardsProgress(items);
    renderShoppingList(items);

    if (currentCategoryId) {
      const catItems = items.filter(i => i.categoryId === currentCategoryId);
      renderItems(catItems);
      updateCategoryDetailProgress(catItems);
      updateSubcategoriesDatalist(catItems);
    }
  }, (err) => console.error("Error items:", err));

  const unsubTemp = onSnapshot(doc(db, 'users', currentUser.uid, 'trips', tripId), (snap) => {
    if (snap.exists()) {
      currentTripData = { id: snap.id, ...snap.data() };
      renderTripDetailHeader();
    }
  });
  const origCleanup = unsubCategories;
  unsubCategories = () => { origCleanup && origCleanup(); unsubTemp(); };
}

function updateTripDetailProgress(items) {
  const total = items.length;
  const packed = items.filter(i => i.packed).length;
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
  $('trip-detail-progress-bar').style.width = pct + '%';
  $('trip-detail-progress-text').textContent = `${packed}/${total} · ${pct}%`;

  const maletaCount = items.filter(i => (i.location || 'maleta') === 'maleta').length;
  const mochilaCount = items.filter(i => i.location === 'mochila').length;
  const toBuyCount = items.filter(i => i.toBuy && !i.packed).length;

  $('trip-count-maleta').textContent = maletaCount;
  $('trip-count-mochila').textContent = mochilaCount;
  $('trip-count-tobuy').textContent = toBuyCount;
}

// =====================================================================
//  RENDER LISTA DE COMPRAS
// =====================================================================
function renderShoppingList(items) {
  const shoppingItems = items.filter(i => i.toBuy);
  const pendingCount = shoppingItems.filter(i => !i.packed).length;

  const badge = $('shopping-badge-count');
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  $('shopping-tab-summary').textContent = `${pendingCount} pendientes`;

  const container = $('shopping-list-container');
  const empty = $('shopping-list-empty');
  if (shoppingItems.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  shoppingItems.sort((a, b) => (a.packed === b.packed ? 0 : a.packed ? 1 : -1));

  container.innerHTML = shoppingItems.map(item => {
    const isBought = item.packed;
    const cat = allTripCategories.find(c => c.id === item.categoryId);
    const catLabel = cat ? `${cat.icon || '📦'} ${cat.name}` : 'General';
    const bgClass = isBought ? 'bg-emerald-50/70 border-emerald-200' : 'bg-white border-amber-200/80 hover:border-amber-300';
    const textClass = isBought ? 'line-through text-gray-400' : 'text-gray-900 font-semibold';
    const locIcon = item.location === 'mochila' ? '🎒 Mochila' : '🧳 Maleta';

    return `
      <div class="flex items-start gap-3 p-3.5 rounded-xl border ${bgClass} transition-all shadow-sm">
        <input type="checkbox" class="item-packed-cb w-5 h-5 rounded cursor-pointer mt-0.5 flex-shrink-0"
               data-item-packed="${item.id}" ${isBought ? 'checked' : ''}>
        
        ${item.photoUrl ? `<img src="${item.photoUrl}" class="w-10 h-10 object-contain rounded-lg bg-gray-50 border border-gray-100 flex-shrink-0" alt="foto">` : ''}

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm ${textClass}">${item.name}</span>
            ${item.quantity > 1 ? `<span class="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">×${item.quantity}</span>` : ''}
            <span class="text-[11px] text-gray-400 font-medium">(${catLabel})</span>
            <span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">${locIcon}</span>
          </div>
          ${item.notes ? `<div class="text-xs text-gray-500 mt-1 break-words">${formatNotesWithLinks(item.notes)}</div>` : ''}
        </div>

        <button class="edit-item-btn p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-gray-100 text-xs transition flex-shrink-0" data-item-edit="${item.id}">
          ✏️
        </button>
      </div>
    `;
  }).join('');
}

function updateCategoryCardsProgress(items) {
  const byCategory = {};
  items.forEach(item => {
    if (!byCategory[item.categoryId]) byCategory[item.categoryId] = [];
    byCategory[item.categoryId].push(item);
  });
  document.querySelectorAll('[data-cat-card]').forEach(card => {
    const catId = card.dataset.catCard;
    const catItems = byCategory[catId] || [];
    const total = catItems.length;
    const packed = catItems.filter(i => i.packed).length;
    const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
    const bar = card.querySelector('.cat-progress-bar');
    const text = card.querySelector('.cat-progress-text');
    const toBuyCount = catItems.filter(i => i.toBuy && !i.packed).length;
    const badge = card.querySelector('.cat-tobuy-badge');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `${packed}/${total}`;
    if (badge) {
      if (toBuyCount > 0) {
        badge.classList.remove('hidden');
        badge.textContent = `🛒 ${toBuyCount}`;
      } else {
        badge.classList.add('hidden');
      }
    }
  });
}

function renderCategories(categories) {
  const container = $('categories-container');
  const empty = $('categories-empty');
  if (categories.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.innerHTML = categories.map(cat => `
    <div class="cat-card bg-white rounded-2xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
         data-cat-card="${cat.id}" data-cat-id="${cat.id}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-3xl">${cat.icon || '📦'}</span>
          <div>
            <h4 class="font-semibold text-gray-900">${cat.name}</h4>
            <p class="text-xs text-gray-400 cat-progress-text">0/0</p>
          </div>
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="flex gap-1">
            <button class="edit-cat-btn p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition text-sm" data-cat-edit="${cat.id}">✏️</button>
            <button class="delete-cat-btn p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition text-sm" data-cat-delete="${cat.id}">🗑️</button>
          </div>
          <span class="cat-tobuy-badge hidden text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"></span>
        </div>
      </div>
      <div class="mt-3">
        <div class="w-full bg-gray-100 rounded-full h-1.5">
          <div class="cat-progress-bar bg-emerald-500 h-1.5 rounded-full progress-bar" style="width: 0%"></div>
        </div>
      </div>
    </div>
  `).join('');
  if (allTripItems[currentTripId]) {
    updateCategoryCardsProgress(allTripItems[currentTripId]);
  }
}

// =====================================================================
//  CATEGORÍAS
// =====================================================================
function openCategoryModal(catData = null) {
  $('category-form').reset();
  $('category-id-hidden').value = '';
  $('selected-icon-input').value = '📦';
  const grid = $('category-icon-grid');
  grid.innerHTML = CATEGORY_ICONS.map(ic => `
    <button type="button" class="icon-option p-2 text-2xl rounded-xl border-2 transition hover:bg-indigo-50
      ${ic.emoji === '📦' ? 'border-indigo-500 bg-indigo-50' : 'border-transparent'}"
      data-icon="${ic.emoji}" title="${ic.label}">
      ${ic.emoji}
    </button>
  `).join('');

  if (catData) {
    $('category-modal-title').textContent = 'Editar Categoría';
    $('category-id-hidden').value = catData.id;
    $('category-name-input').value = catData.name || '';
    $('selected-icon-input').value = catData.icon || '📦';
    grid.querySelectorAll('.icon-option').forEach(btn => {
      if (btn.dataset.icon === catData.icon) {
        btn.classList.add('border-indigo-500', 'bg-indigo-50');
      } else {
        btn.classList.remove('border-indigo-500', 'bg-indigo-50');
        btn.classList.add('border-transparent');
      }
    });
  } else {
    $('category-modal-title').textContent = 'Nueva Categoría';
  }
  showModal('category-modal');
  $('category-name-input').focus();
}

async function saveCategoryForm() {
  const name = $('category-name-input').value.trim();
  if (!name) return;
  const data = {
    name,
    icon: $('selected-icon-input').value,
    tripId: currentTripId,
  };
  const editId = $('category-id-hidden').value;
  try {
    if (editId) {
      await updateDoc(userDoc('categories', editId), data);
      showToast('Categoría actualizada');
    } else {
      data.createdAt = Date.now();
      await addDoc(userCol('categories'), data);
      showToast('Categoría creada');
    }
    hideModal('category-modal');
  } catch (e) {
    console.error(e);
    showToast('Error al guardar categoría', 'error');
  }
}

async function deleteCategory(catId) {
  confirmDelete('Se eliminarán todos los elementos de esta categoría.', async () => {
    try {
      const itemsSnap = await getDocs(query(userCol('items'), where('categoryId', '==', catId)));
      for (const itemDoc of itemsSnap.docs) {
        await deleteDoc(itemDoc.ref);
      }
      await deleteDoc(userDoc('categories', catId));
      showToast('Categoría eliminada');
      if (currentCategoryId === catId) {
        currentCategoryId = null;
        openTrip(currentTripId);
      }
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar', 'error');
    }
  });
}

// =====================================================================
//  DETALLE DE CATEGORÍA
// =====================================================================
function openCategory(catId) {
  currentCategoryId = catId;
  const items = (allTripItems[currentTripId] || []).filter(i => i.categoryId === catId);
  const catCard = document.querySelector(`[data-cat-card="${catId}"]`);
  const catName = catCard ? catCard.querySelector('h4').textContent : 'Categoría';
  const catIcon = catCard ? catCard.querySelector('.text-3xl').textContent.trim() : '📦';
  currentCategoryData = { id: catId, name: catName, icon: catIcon };
  $('category-detail-name').textContent = `${catIcon} ${catName}`;
  showView('category-detail-view');
  renderItems(items);
  updateCategoryDetailProgress(items);
  updateSubcategoriesDatalist(items);
}

function updateCategoryDetailProgress(items) {
  const total = items.length;
  const packed = items.filter(i => i.packed).length;
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
  $('category-detail-progress-bar').style.width = pct + '%';
  $('category-detail-progress-text').textContent = `${packed} / ${total} empacados`;
}

function updateSubcategoriesDatalist(items) {
  const datalist = $('subcategories-datalist');
  if (!datalist) return;
  const uniqueMap = new Map();
  items.forEach(i => {
    if (i.subcategory && i.subcategory.trim()) {
      const clean = i.subcategory.trim();
      const key = clean.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase());
      }
    }
  });

  datalist.innerHTML = Array.from(uniqueMap.values())
    .map(sub => `<option value="${sub}">`)
    .join('');
}

function renderItems(items) {
  const container = $('items-container');
  const empty = $('items-empty');
  if (items.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const groups = {};
  items.forEach(item => {
    const raw = (item.subcategory && item.subcategory.trim()) || '';
    let groupKey = 'general';
    let displayTitle = 'General / Varios';

    if (raw) {
      groupKey = raw.toLowerCase();
      displayTitle = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }

    if (!groups[groupKey]) {
      groups[groupKey] = { title: displayTitle, items: [] };
    }
    groups[groupKey].items.push(item);
  });

  let html = '';
  for (const group of Object.values(groups)) {
    const groupName = group.title;
    const groupItems = group.items;
    groupItems.sort((a, b) => (a.packed === b.packed ? 0 : a.packed ? 1 : -1));
    const packedCount = groupItems.filter(i => i.packed).length;

    html += `
      <div class="mb-6">
        <div class="flex items-center justify-between pb-2 mb-3 border-b border-gray-200">
          <h4 class="font-bold text-gray-800 text-sm tracking-wide uppercase flex items-center gap-1.5">
            <span>🏷️</span> ${groupName}
          </h4>
          <span class="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-semibold">
            ${packedCount}/${groupItems.length}
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
          ${groupItems.map(item => renderSingleItemRow(item)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderSingleItemRow(item) {
  const isPacked = item.packed;
  const cardBorder = isPacked ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white hover:border-indigo-300';
  const nameClass = isPacked ? 'line-through text-gray-400' : 'text-gray-900';
  const locBadge = item.location === 'mochila'
    ? `<span class="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded font-medium">🎒 Mochila</span>`
    : `<span class="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-medium">🧳 Maleta</span>`;
  
  const photoHtml = item.photoUrl
    ? `<div class="p-2.5 pb-0">
         <div class="w-full h-28 bg-gray-100/80 rounded-xl flex items-center justify-center p-1.5 overflow-hidden cursor-pointer item-photo-thumb border border-gray-100" 
              data-photo-url="${item.photoUrl}" title="Toca para ampliar">
           <img src="${item.photoUrl}" class="max-w-full max-h-full object-contain rounded-lg transition-transform hover:scale-105 duration-200" alt="${item.name}">
         </div>
       </div>`
    : `<div class="p-2.5 pb-0">
         <div class="w-full h-20 bg-indigo-50/50 rounded-xl flex items-center justify-center text-2xl select-none border border-indigo-100/50">
           🧳
         </div>
       </div>`;

  const toBuyBadge = item.toBuy && !isPacked
    ? `<span class="inline-block text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">🛒 Comprar</span>`
    : '';

  const notesHtml = item.notes
    ? `<div class="text-[11px] text-gray-500 mt-1 break-words">${formatNotesWithLinks(item.notes)}</div>`
    : '';

  return `
    <div class="item-card rounded-2xl border ${cardBorder} shadow-sm overflow-hidden flex flex-col justify-between transition-all hover:shadow-md" data-item-id="${item.id}">
      <div>
        ${photoHtml}
        <div class="p-2.5">
          <div class="flex items-start gap-2">
            <input type="checkbox" class="item-packed-cb w-4 h-4 rounded cursor-pointer mt-0.5 flex-shrink-0"
                   data-item-packed="${item.id}" ${isPacked ? 'checked' : ''}>
            <div class="min-w-0 flex-1">
              <span class="font-semibold text-xs sm:text-sm ${nameClass} leading-tight block truncate">
                ${item.name}
              </span>
              <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                ${locBadge}
                ${item.quantity > 1 ? `<span class="text-[11px] text-indigo-600 font-bold">×${item.quantity}</span>` : ''}
                ${toBuyBadge}
              </div>
              ${notesHtml}
            </div>
          </div>
        </div>
      </div>
      <div class="px-2.5 py-1.5 flex justify-end gap-1 border-t border-gray-100 bg-gray-50/40">
        <button class="edit-item-btn p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-white text-xs transition" data-item-edit="${item.id}" title="Editar">
          ✏️
        </button>
        <button class="delete-item-btn p-1 text-gray-400 hover:text-red-500 rounded hover:bg-white text-xs transition" data-item-delete="${item.id}" title="Eliminar">
          🗑️
        </button>
      </div>
    </div>
  `;
}

// =====================================================================
//  ELEMENTOS (ITEMS)
// =====================================================================
function setItemLocationUI(loc) {
  const chosenLoc = loc === 'mochila' ? 'mochila' : 'maleta';
  $('item-location-input').value = chosenLoc;

  const btnMaleta = $('btn-loc-maleta');
  const btnMochila = $('btn-loc-mochila');

  if (chosenLoc === 'maleta') {
    btnMaleta.className = 'py-2.5 px-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer';
    btnMochila.className = 'py-2.5 px-3 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-gray-50 cursor-pointer';
  } else {
    btnMochila.className = 'py-2.5 px-3 rounded-xl border-2 border-sky-600 bg-sky-50/80 text-sky-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer';
    btnMaleta.className = 'py-2.5 px-3 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-gray-50 cursor-pointer';
  }
}

function openItemModal(itemData = null) {
  $('item-form').reset();
  $('item-id-hidden').value = '';
  $('item-existing-photo').value = '';
  $('item-quantity-input').value = '1';
  $('item-subcategory-input').value = '';
  $('item-photo-container').classList.add('hidden');
  $('item-photo-preview').src = '';
  pendingPhotoFile = null;

  if (itemData) {
    $('item-modal-title').textContent = 'Editar Elemento';
    $('item-id-hidden').value = itemData.id;
    $('item-name-input').value = itemData.name || '';
    $('item-subcategory-input').value = itemData.subcategory || '';
    $('item-quantity-input').value = itemData.quantity || 1;
    $('item-notes-input').value = itemData.notes || '';
    $('item-to-buy').checked = !!itemData.toBuy;
    setItemLocationUI(itemData.location || 'maleta');

    if (itemData.photoUrl) {
      $('item-existing-photo').value = itemData.photoUrl;
      $('item-photo-preview').src = itemData.photoUrl;
      $('item-photo-container').classList.remove('hidden');
    }
  } else {
    $('item-modal-title').textContent = 'Nuevo Elemento';
    setItemLocationUI('maleta');
  }
  showModal('item-modal');
  $('item-name-input').focus();
}

async function compressImage(file, maxWidth = 500, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

async function saveItemForm() {
  const name = $('item-name-input').value.trim();
  if (!name) return;

  const submitBtn = $('item-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  try {
    let photoUrl = $('item-existing-photo').value || '';

    if (pendingPhotoFile) {
      const compressedBlob = await compressImage(pendingPhotoFile, 400, 0.6);
      photoUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(compressedBlob);
      });
    }

    const data = {
      name,
      subcategory: $('item-subcategory-input').value.trim(),
      location: $('item-location-input').value || 'maleta',
      quantity: parseInt($('item-quantity-input').value) || 1,
      notes: $('item-notes-input').value.trim(),
      toBuy: $('item-to-buy').checked,
      photoUrl,
      tripId: currentTripId,
      categoryId: currentCategoryId,
    };

    const editId = $('item-id-hidden').value;
    if (editId) {
      await updateDoc(userDoc('items', editId), data);
      showToast('Elemento actualizado');
    } else {
      data.packed = false;
      data.createdAt = Date.now();
      await addDoc(userCol('items'), data);
      showToast('Elemento añadido');
    }
    hideModal('item-modal');
    pendingPhotoFile = null;
  } catch (e) {
    console.error(e);
    showToast('Error al guardar', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar elemento';
  }
}

async function togglePacked(itemId, packed) {
  try {
    await updateDoc(userDoc('items', itemId), { packed });
  } catch (e) {
    console.error(e);
    showToast('Error al actualizar', 'error');
  }
}

async function deleteItem(itemId) {
  confirmDelete('Este elemento será eliminado.', async () => {
    try {
      await deleteDoc(userDoc('items', itemId));
      showToast('Elemento eliminado');
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar', 'error');
    }
  });
}

// =====================================================================
//  MANEJO DE FOTOS
// =====================================================================
function handlePhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    $('item-photo-preview').src = e.target.result;
    $('item-photo-container').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removePhotoPreview() {
  pendingPhotoFile = null;
  $('item-photo-preview').src = '';
  $('item-photo-container').classList.add('hidden');
  $('item-existing-photo').value = '';
  $('item-photo-input').value = '';
  $('item-camera-input').value = '';
}

// =====================================================================
//  EVENT LISTENERS
// =====================================================================
function setupEventListeners() {
  $('login-btn').addEventListener('click', handleLogin);
  $('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  $('register-btn').addEventListener('click', handleRegister);
  $('register-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });
  $('google-login-btn').addEventListener('click', handleGoogleLogin);
  $('logout-btn').addEventListener('click', handleLogout);
  $('show-register').addEventListener('click', () => {
    $('login-view').classList.add('hidden');
    $('register-view').classList.remove('hidden');
    $('register-error').classList.add('hidden');
  });
  $('show-login').addEventListener('click', () => {
    $('register-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('login-error').classList.add('hidden');
  });

  $('back-to-trips').addEventListener('click', () => {
    currentTripId = null;
    currentCategoryId = null;
    cleanupCategoryListeners();
    showView('trips-view');
  });
  $('back-to-trip').addEventListener('click', () => {
    currentCategoryId = null;
    showView('trip-detail-view');
  });

  $('tab-categories-btn').addEventListener('click', () => switchTripTab('categories'));
  $('tab-shopping-btn').addEventListener('click', () => switchTripTab('shopping'));

  $('share-shopping-btn').addEventListener('click', handleCreateShareLink);
  $('close-share-modal').addEventListener('click', () => hideModal('share-modal'));
  $('share-copy-btn').addEventListener('click', copyShareUrl);
  $('share-whatsapp-btn').addEventListener('click', shareUrlViaWhatsApp);

  $('btn-loc-maleta').addEventListener('click', () => setItemLocationUI('maleta'));
  $('btn-loc-mochila').addEventListener('click', () => setItemLocationUI('mochila'));

  $('add-trip-btn').addEventListener('click', () => openTripModal());
  $('trip-form').addEventListener('submit', (e) => { e.preventDefault(); saveTripForm(); });
  $('close-trip-modal').addEventListener('click', () => hideModal('trip-modal'));
  $('edit-trip-btn').addEventListener('click', () => {
    if (currentTripData) openTripModal(currentTripData);
  });
  $('delete-trip-btn').addEventListener('click', () => {
    if (currentTripId) deleteTrip(currentTripId);
  });

  $('trips-container').addEventListener('click', (e) => {
    const card = e.target.closest('[data-trip-id]');
    if (card) openTrip(card.dataset.tripId);
  });

  $('add-category-btn').addEventListener('click', () => openCategoryModal());
  $('category-form').addEventListener('submit', (e) => { e.preventDefault(); saveCategoryForm(); });
  $('close-category-modal').addEventListener('click', () => hideModal('category-modal'));

  $('category-icon-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-option');
    if (!btn) return;
    $('selected-icon-input').value = btn.dataset.icon;
    $('category-icon-grid').querySelectorAll('.icon-option').forEach(b => {
      b.classList.remove('border-indigo-500', 'bg-indigo-50');
      b.classList.add('border-transparent');
    });
    btn.classList.remove('border-transparent');
    btn.classList.add('border-indigo-500', 'bg-indigo-50');
  });

  $('categories-container').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-cat-btn');
    if (editBtn) {
      e.stopPropagation();
      const catId = editBtn.dataset.catEdit;
      const card = editBtn.closest('[data-cat-card]');
      const name = card.querySelector('h4').textContent;
      const icon = card.querySelector('.text-3xl').textContent.trim();
      openCategoryModal({ id: catId, name, icon });
      return;
    }
    const delBtn = e.target.closest('.delete-cat-btn');
    if (delBtn) {
      e.stopPropagation();
      deleteCategory(delBtn.dataset.catDelete);
      return;
    }
    const card = e.target.closest('[data-cat-id]');
    if (card) openCategory(card.dataset.catId);
  });

  $('add-item-btn').addEventListener('click', () => openItemModal());
  $('item-form').addEventListener('submit', (e) => { e.preventDefault(); saveItemForm(); });
  $('close-item-modal').addEventListener('click', () => hideModal('item-modal'));

  $('item-upload-btn').addEventListener('click', () => $('item-photo-input').click());
  $('item-camera-btn').addEventListener('click', () => $('item-camera-input').click());
  $('item-photo-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handlePhotoFile(e.target.files[0]);
  });
  $('item-camera-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handlePhotoFile(e.target.files[0]);
  });
  $('item-remove-photo').addEventListener('click', removePhotoPreview);

  const handleItemActions = (e) => {
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      return;
    }

    const cb = e.target.closest('.item-packed-cb');
    if (cb) {
      togglePacked(cb.dataset.itemPacked, cb.checked);
      return;
    }
    const thumb = e.target.closest('.item-photo-thumb');
    if (thumb) {
      $('photo-viewer-img').src = thumb.dataset.photoUrl;
      showModal('photo-viewer-modal');
      return;
    }
    const editBtn = e.target.closest('.edit-item-btn');
    if (editBtn) {
      const itemId = editBtn.dataset.itemEdit;
      const item = (allTripItems[currentTripId] || []).find(i => i.id === itemId);
      if (item) openItemModal(item);
      return;
    }
    const delBtn = e.target.closest('.delete-item-btn');
    if (delBtn) {
      deleteItem(delBtn.dataset.itemDelete);
      return;
    }
  };

  $('items-container').addEventListener('click', handleItemActions);
  $('shopping-list-container').addEventListener('click', handleItemActions);

  $('delete-confirm').addEventListener('click', () => {
    hideModal('delete-modal');
    if (deleteCallback) {
      deleteCallback();
      deleteCallback = null;
    }
  });
  $('delete-cancel').addEventListener('click', () => {
    hideModal('delete-modal');
    deleteCallback = null;
  });

  $('photo-viewer-modal').addEventListener('click', () => hideModal('photo-viewer-modal'));

  ['trip-modal', 'category-modal', 'item-modal', 'delete-modal', 'share-modal'].forEach(modalId => {
    $(modalId).addEventListener('click', (e) => {
      if (e.target === $(modalId)) hideModal(modalId);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAllModals();
  });
}

// =====================================================================
//  INICIALIZACIÓN LIMPIA
// =====================================================================
setupEventListeners();

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('share')) {
  checkSharedLink();
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      showAppScreen(user);
    } else {
      currentUser = null;
      currentTripId = null;
      currentCategoryId = null;
      cleanupAllListeners();
      showAuthScreen();
    }
  });
}