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


export async function groupNameExists(groupName) {
    const targetName = groupName.trim().toLowerCase();

    const snapshot = await getDocs(collection(db, "groups"));

    let exists = false;

    snapshot.forEach(groupDoc => {
        const group = groupDoc.data();

        if (
            group.groupName &&
            group.groupName.trim().toLowerCase() === targetName
        ) {
            exists = true;
        }
    });

    return exists;
}


export async function createGroup(groupName, creator) {
    groupName = groupName.trim();

    if (groupName === "") {
        alert("Please enter a group name.");
        return;
    }

    if (await groupNameExists(groupName)) {
        alert("A group with this name already exists.");
        return;
    }

    const joinCode = generateJoinCode();

    const groupRef = await addDoc(collection(db, "groups"), {
        groupName,
        groupNameLower: groupName.toLowerCase(),
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

    loadGroups(creator);
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

    loadGroups(username);
}


export async function loadGroups(username) {
    const groupsContainer = document.getElementById("groupsContainer");
    groupsContainer.innerHTML = "";

    const q = query(collection(db, "groups"), orderBy("groupName"));
    const snapshot = await getDocs(q);

    let visibleGroups = 0;

    snapshot.forEach(groupDoc => {
        const group = groupDoc.data();

        if (!group.members || !group.members[username]) {
            return;
        }

        visibleGroups++;

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

    if (visibleGroups === 0) {
        groupsContainer.innerHTML = `
            <p class="smallText">
                You have not joined any group yet. Enter a join code above to join a group.
            </p>
        `;
    }
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