// ════════════════════════════════════════════════════════════════
//  FleetGuard — Firebase Configuration (Compat SDK)
//  Uses firebase-app-compat / firebase-auth-compat / firebase-database-compat
//  loaded via CDN in index.html — do NOT use ES module import syntax here.
// ════════════════════════════════════════════════════════════════

// Google Apps Script upload endpoint
window.GOOGLE_APPS_SCRIPT_UPLOAD_URL =
    'https://script.google.com/macros/s/AKfycby_-m36jfbfC_bwYHgFPC3jI0U1EBE_mReTpY3rVQnC7n3XMxGjeo1pESWsY1pCXc1dpQ/exec';

// ── One-time cache purge for new Firebase project ─────────────
// If the browser still has localStorage data from the old 3RAG project,
// wipe it now so the new Global Trans Firebase database starts clean.
(function purgeStaleCacheIfNewProject() {
    var STAMP_KEY   = 'fg_firebase_project';
    var CURRENT_PID = 'global-trans-513f3';
    if (localStorage.getItem(STAMP_KEY) !== CURRENT_PID) {
        [
            'fg3_drivers','fg3_trucks','fg3_trailers','fg3_settings',
            'fg3_orders','fg3_jobcards','fg3_hscpolicies','fg3_hscmeetings',
            'fg3_recyclebin','fg3_backup','fg_role'
        ].forEach(function(k){ localStorage.removeItem(k); });
        localStorage.setItem(STAMP_KEY, CURRENT_PID);
        console.log('[FleetGuard] Stale cache cleared for new project: ' + CURRENT_PID);
    }
}());

// ── Firebase project: global-trans-513f3 ──────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyCN6nOSBV_OtxzeX4-KCOwZnzDGpC-fO7Q",
    authDomain:        "global-trans-513f3.firebaseapp.com",
    databaseURL:       "https://global-trans-513f3-default-rtdb.firebaseio.com",
    projectId:         "global-trans-513f3",
    storageBucket:     "global-trans-513f3.firebasestorage.app",
    messagingSenderId: "425151709441",
    appId:             "1:425151709441:web:30c0dc89515f0e97d9db00",
    measurementId:     "G-1L7ZRB5ZZN"
};

// ── Initialize Firebase (compat) ──────────────────────────────
firebase.initializeApp(firebaseConfig);

// Expose as globals so app.js and inline HTML handlers can reach them
window.database = firebase.database();
window.auth     = firebase.auth();

// Also expose as bare globals (app.js uses `database.ref(...)` without `window.`)
var database = window.database;
var auth     = window.auth;

console.log("[Firebase] Realtime Database connected — project: global-trans-513f3");

// ── Auth state & session management ──────────────────────────
// No-persistence: every page refresh requires re-login.
var appInitialized = false;

auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
    .then(function () {
        // Force sign-out on load so the overlay always appears after refresh
        return auth.signOut();
    })
    .then(function () {
        auth.onAuthStateChanged(function (user) {
            var overlay = document.getElementById('auth-overlay');
            if (user) {
                console.log("[Security] Dispatcher authenticated:", user.email);
                overlay.style.display = 'none';

                var rolePromise = (window.App && typeof App.loadUserRoleFromFirebase === 'function')
                    ? App.loadUserRoleFromFirebase(user.uid)
                    : Promise.resolve(null);

                rolePromise.finally(function () {
                    if (!appInitialized && window.App && typeof window.App.init === 'function') {
                        appInitialized = true;
                        App.init();
                    }
                });
            } else {
                appInitialized = false;
                overlay.style.display = 'flex';
            }
        });
    })
    .catch(function (err) {
        console.error("[Firebase] Auth persistence / sign-out error:", err);
        // Still attach the state listener so the overlay works
        auth.onAuthStateChanged(function (user) {
            var overlay = document.getElementById('auth-overlay');
            if (user) {
                overlay.style.display = 'none';
                if (!appInitialized && window.App && typeof window.App.init === 'function') {
                    appInitialized = true;
                    App.init();
                }
            } else {
                appInitialized = false;
                overlay.style.display = 'flex';
            }
        });
    });

// ── Toggle Password Visibility ────────────────────────────────
function togglePasswordVisibility() {
    var input = document.getElementById('login-password');
    var btn   = document.getElementById('toggle-password-btn');
    if (input.type === 'password') {
        input.type    = 'text';
        btn.textContent = '🙈';
        btn.title     = 'Hide password';
    } else {
        input.type    = 'password';
        btn.textContent = '👁';
        btn.title     = 'Show password';
    }
}

// ── Login Handler ─────────────────────────────────────────────
function handleAuthLogin(event) {
    if (event) event.preventDefault();

    var email    = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var errorEl  = document.getElementById('auth-error');
    var btn      = document.getElementById('btn-login');

    if (!email || !password) {
        errorEl.textContent    = "Please fill in all security fields.";
        errorEl.style.display  = "block";
        return;
    }

    btn.textContent  = "Verifying Credentials…";
    btn.disabled     = true;
    errorEl.style.display = "none";

    auth.signInWithEmailAndPassword(email, password)
        .catch(function (error) {
            console.error("Login Failure:", error);
            errorEl.textContent   = "Access Denied: Invalid email or password.";
            errorEl.style.display = "block";
            btn.textContent       = "Initialize Control Center";
            btn.disabled          = false;
        });
}
