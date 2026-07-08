import { db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    groupNameExists
}
from "./groups.js";


async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}


function isValidPassword(password) {
    return /^[0-9]{5}$/.test(password);
}


export async function signUp(username, password) {
    username = username.trim();

    if (username === "") {
        alert("Please enter a username.");
        return false;
    }

    if (!isValidPassword(password)) {
        alert("Please enter a 5-digit numerical password.");
        return false;
    }

    if (await groupNameExists(username)) {
        alert("This username is already used as a group name. Please choose another username.");
        return false;
    }

    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        alert("Username already exists.");
        return false;
    }

    const passwordHash = await hashPassword(password);

    await setDoc(userRef, {
        username,
        passwordHash,
        createdAt: new Date().toISOString(),
        predictionsSubmittedRound32: false,
        predictionsSubmittedRound16: false,
        predictionsSubmittedFinalRound: false,
        groups: [],
        isAdmin: username.toLowerCase() === "umair"
    });

    localStorage.setItem("username", username);

    return true;
}


export async function login(username, password) {
    username = username.trim();

    if (username === "") {
        alert("Please enter a username.");
        return false;
    }

    if (!isValidPassword(password)) {
        alert("Please enter your 5-digit numerical password.");
        return false;
    }

    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        alert("User does not exist.");
        return false;
    }

    const userData = userSnap.data();
    const passwordHash = await hashPassword(password);

    if (!userData.passwordHash) {
        await updateDoc(userRef, {
            passwordHash
        });

        localStorage.setItem("username", username);
        alert("Password added to your existing account.");
        return true;
    }

    if (userData.passwordHash !== passwordHash) {
        alert("Incorrect password.");
        return false;
    }

    localStorage.setItem("username", username);

    return true;
}


export function logout() {
    localStorage.removeItem("username");
    localStorage.removeItem("currentGroupId");
    localStorage.removeItem("currentGroupName");
    localStorage.removeItem("currentPage");
    location.reload();
}


export function getCurrentUser() {
    return localStorage.getItem("username");
}