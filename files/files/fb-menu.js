// Firebase for the customer menu only: the database, without the login library customers never use.
// Keep the config and version in step with fb.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, doc, collection, addDoc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, deleteDoc, runTransaction,
  query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyBe-MKZqI-z6HiSgBd3xK_3Vht8XY2KMgc",
  authDomain: "yumotapit-5027e.firebaseapp.com",
  projectId: "yumotapit-5027e",
  storageBucket: "yumotapit-5027e.firebasestorage.app",
  messagingSenderId: "790220678120",
  appId: "1:790220678120:web:582955bc21f5591da6fa5d"
});
export const db = getFirestore(app);
export { doc, collection, addDoc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, deleteDoc, runTransaction, query, where, orderBy, limit, getDocs };
