// Firebase wrapper — ทุกไฟล์เรียก Firebase ผ่านไฟล์นี้ที่เดียว
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, runTransaction, writeBatch, serverTimestamp, Timestamp, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from './config.js';

const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, runTransaction, writeBatch, serverTimestamp, Timestamp, query, orderBy,
  signInWithPopup, signOut, onAuthStateChanged
};

// อ่านข้อมูลโดยให้ serverTimestamp ที่ยังไม่ sync มีค่าประมาณไว้ก่อน
export const data = snap => snap.data({ serverTimestamps: 'estimate' });
