import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


const firebaseConfig = {
            apiKey: "AIzaSyBrAVo6DZafG3vxftopaVB7V0QaxzuTwYc",
            authDomain: "fifafantasy2026-704d9.firebaseapp.com",
            projectId: "fifafantasy2026-704d9",
            storageBucket: "fifafantasy2026-704d9.firebasestorage.app",
            messagingSenderId: "510838555863",
            appId: "1:510838555863:web:2782ca41fedfdfcdc75c92",
            measurementId: "G-BQ7LQPBYJ6"
        };


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

export { db };