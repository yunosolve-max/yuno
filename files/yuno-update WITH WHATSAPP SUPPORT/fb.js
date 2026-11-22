// Firebase setup for YUNO. The config below is safe to be public:
// your data is protected by the Firestore security rules (firestore.rules).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, Timestamp, writeBatch,
  arrayUnion, arrayRemove, runTransaction, increment
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBe-MKZqI-z6HiSgBd3xK_3Vht8XY2KMgc",
  authDomain: "yumotapit-5027e.firebaseapp.com",
  projectId: "yumotapit-5027e",
  storageBucket: "yumotapit-5027e.firebasestorage.app",
  messagingSenderId: "790220678120",
  appId: "1:790220678120:web:582955bc21f5591da6fa5d"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  initializeApp, getAuth, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, Timestamp, writeBatch,
  arrayUnion, arrayRemove, runTransaction, increment, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail
};
