import { db } from "./firebase.js";

import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    where,
    doc,
    updateDoc,
    arrayUnion,
    getDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


function generateJoinCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}


export async function createGroup(groupName, creator) {
    groupName = groupName.trim();

    if (groupName === "") {
        alert("Please enter a group name.");
        return;
    }

    const joinCode = generateJoinCode();

    const groupRef = await addDoc(collection(db, "groups"), {
        groupName,
        creator,
        joinCode,
        createdAt: new Date().toISOString(),
        members: {
            [creator]: true
        }
    });

    await updateDoc(doc(db, "users", creator), {
        groups: arrayUnion(groupRef.id)
    });

    alert(`Group created.\nJoin Code: ${joinCode}`);

    loadGroups();
}


export async function joinGroup(joinCode, username) {
    joinCode = joinCode.trim().toUpperCase();

    if (joinCode === "") {
        alert("Please enter a join code.");
        return;
    }

    const q = query(
        collection(db, "groups"),
        where("joinCode", "==", joinCode)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        alert("No group found with this code.");
        return;
    }

    const groupDoc = snapshot.docs[0];
    const group = groupDoc.data();

    if (group.members && group.members[username]) {
        alert("You are already a member of this group.");
        return;
    }

    await updateDoc(doc(db, "groups", groupDoc.id), {
        [`members.${username}`]: true
    });

    await updateDoc(doc(db, "users", username), {
        groups: arrayUnion(groupDoc.id)
    });

    alert(`You joined: ${group.groupName}`);

    loadGroups();
}


export async function loadGroups() {
    const groupsContainer = document.getElementById("groupsContainer");
    groupsContainer.innerHTML = "";

    const q = query(collection(db, "groups"), orderBy("groupName"));
    const snapshot = await getDocs(q);

    snapshot.forEach(groupDoc => {
        const group = groupDoc.data();

        groupsContainer.innerHTML += `
            <div class="groupCard">
                <h3>${group.groupName}</h3>

                <p>
                    Creator:
                    <strong>${group.creator}</strong>
                </p>

                <button class="openGroupBtn"
                        data-group-id="${groupDoc.id}"
                        data-group-name="${group.groupName}">
                    Open Group
                </button>
            </div>
        `;
    });
}


export async function getGroup(groupId) {
    const snap = await getDoc(doc(db, "groups", groupId));

    if (!snap.exists()) {
        return null;
    }

    return {
        id: snap.id,
        ...snap.data()
    };
}