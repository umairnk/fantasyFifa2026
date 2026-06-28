import { db } from "./firebase.js";

console.log("Firebase connected");

document.getElementById("status").innerText =
    "✅ Successfully connected to Firebase";