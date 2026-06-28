import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    setDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    recalculateGlobalLeaderboard,
    recalculateGroupLeaderboard
}
from "./leaderboard.js";


let currentAdminUsername = null;
let currentUserIsFullAdmin = false;


export async function isAdmin(username) {
    const snap = await getDoc(doc(db, "users", username));
    return snap.exists() && snap.data().isAdmin === true;
}


export async function canUpdateResults(username) {
    const snap = await getDoc(doc(db, "users", username));

    if (!snap.exists()) return false;

    const data = snap.data();

    return data.isAdmin === true || data.canUpdateResults === true;
}


export async function loadAdminPage(username = null) {
    currentAdminUsername = username;
    currentUserIsFullAdmin = username ? await isAdmin(username) : false;

    const container = document.getElementById("adminContainer");

    if (currentUserIsFullAdmin) {
        container.innerHTML = `
            <h2>Admin Area</h2>

            <h2>User Management</h2>
            <div id="adminUsersContainer"></div>

            <hr>

            <h2>Group Management</h2>
            <div id="adminGroupsContainer"></div>

            <hr>

            <h2>Admin Match Editor</h2>
            <div id="adminMatchesContainer"></div>
        `;

        await loadAdminUsers();
        await loadAdminGroups();
        await loadAdminMatches();
        return;
    }

    container.innerHTML = `
        <h2>Match Result Admin</h2>

        <p class="smallText">
            You can update match scores, winner and status only.
        </p>

        <div id="adminMatchesContainer"></div>
    `;

    await loadAdminMatches();
}


async function reloadAdminPage() {
    await loadAdminPage(currentAdminUsername);
}


async function loadAdminUsers() {
    const container = document.getElementById("adminUsersContainer");
    container.innerHTML = "";

    const usersSnap = await getDocs(collection(db, "users"));

    const users = [];

    usersSnap.forEach(userDoc => {
        users.push({
            username: userDoc.id,
            ...userDoc.data()
        });
    });

    users.sort((a, b) => a.username.localeCompare(b.username));

    container.innerHTML = users.map(user => `
        <div class="adminMemberRow">
            <span>👤 ${user.username}</span>

            <input
                type="text"
                id="renameUserInput_${safeHtmlId(user.username)}"
                placeholder="New username">

            <button class="renameUserBtn"
                    data-username="${escapeHtml(user.username)}">
                Rename
            </button>

            <button class="deleteUserBtn"
                    data-username="${escapeHtml(user.username)}">
                Delete User
            </button>
        </div>
    `).join("");

    attachUserAdminEvents();
}


function attachUserAdminEvents() {
    document.querySelectorAll(".deleteUserBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const username = button.dataset.username;

            if (username === currentAdminUsername) {
                alert("You cannot delete your own account while logged in.");
                return;
            }

            const confirmDelete = confirm(
                `Delete user "${username}" completely?\n\nThis deletes the user profile, predictions, group memberships and leaderboard records.`
            );

            if (!confirmDelete) return;

            await deleteUserCompletely(username);

            alert(`${username} deleted completely.`);
            await reloadAdminPage();
        });
    });


    document.querySelectorAll(".renameUserBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const oldUsername = button.dataset.username;

            const input =
                document.getElementById(`renameUserInput_${safeHtmlId(oldUsername)}`);

            const newUsername = input.value.trim();

            if (!newUsername) {
                alert("Please enter a new username.");
                return;
            }

            if (oldUsername === newUsername) {
                alert("New username is same as old username.");
                return;
            }

            const confirmRename = confirm(
                `Rename "${oldUsername}" to "${newUsername}"?\n\nYes, the login username will also change.`
            );

            if (!confirmRename) return;

            await renameUserCompletely(oldUsername, newUsername);

            if (oldUsername === currentAdminUsername) {
                localStorage.setItem("username", newUsername);
                currentAdminUsername = newUsername;
            }

            alert(`${oldUsername} renamed to ${newUsername}.`);
            await reloadAdminPage();
        });
    });
}


async function loadAdminGroups() {
    const container = document.getElementById("adminGroupsContainer");
    container.innerHTML = "";

    const groupsSnap = await getDocs(collection(db, "groups"));
    const usersSnap = await getDocs(collection(db, "users"));

    const users = [];

    usersSnap.forEach(userDoc => {
        users.push(userDoc.id);
    });

    users.sort();

    groupsSnap.forEach(groupDoc => {
        const group = groupDoc.data();
        const groupId = groupDoc.id;
        const members = group.members ? Object.keys(group.members).sort() : [];

        container.innerHTML += `
            <div class="adminMatchCard">

                <h3>${group.groupName}</h3>

                <p>
                    <strong>Group ID:</strong> ${groupId}
                </p>

                <p>
                    <strong>Join Code:</strong> ${group.joinCode}
                </p>

                <p>
                    <strong>Creator:</strong> ${group.creator}
                </p>

                <h4>Members</h4>

                ${
                    members.length === 0
                    ? "<p>No members.</p>"
                    : members.map(member => `
                        <div class="adminMemberRow">
                            <span>👤 ${member}</span>

                            <button class="removeUserFromGroupBtn"
                                    data-group-id="${groupId}"
                                    data-username="${escapeHtml(member)}">
                                Remove
                            </button>
                        </div>
                    `).join("")
                }

                <br>

                <h4>Add User to Group</h4>

                <select id="addUserSelect_${groupId}">
                    <option value="">Select user</option>

                    ${users.map(user => `
                        <option value="${escapeHtml(user)}">
                            ${user}
                        </option>
                    `).join("")}
                </select>

                <button class="addUserToGroupBtn"
                        data-group-id="${groupId}">
                    Add User
                </button>

                <br><br>

                <button class="deleteGroupBtn"
                        data-group-id="${groupId}"
                        data-group-name="${escapeHtml(group.groupName)}">
                    Delete Group
                </button>

            </div>
        `;
    });

    attachGroupAdminEvents();
}


async function loadAdminMatches() {
    const container = document.getElementById("adminMatchesContainer");
    container.innerHTML = "";

    const snapshot = await getDocs(collection(db, "matches"));

    const matches = [];

    snapshot.forEach(docSnap => {
        matches.push(docSnap.data());
    });

    matches.sort((a, b) => a.id.localeCompare(b.id));

    matches.forEach(match => {
        const teamInputs = currentUserIsFullAdmin
            ? `
                <input id="${match.id}_homeTeam"
                       value="${match.homeTeam}">

                <span>vs</span>

                <input id="${match.id}_awayTeam"
                       value="${match.awayTeam}">
            `
            : `
                <p>
                    <strong>${match.homeTeam}</strong>
                    vs
                    <strong>${match.awayTeam}</strong>
                </p>

                <input type="hidden"
                       id="${match.id}_homeTeam"
                       value="${match.homeTeam}">

                <input type="hidden"
                       id="${match.id}_awayTeam"
                       value="${match.awayTeam}">
            `;

        container.innerHTML += `
            <div class="adminMatchCard">

                <h3>${match.id}</h3>

                ${teamInputs}

                <br><br>

                <input type="number"
                       id="${match.id}_homeGoals"
                       placeholder="Home Goals"
                       value="${match.homeGoals ?? ""}">

                <input type="number"
                       id="${match.id}_awayGoals"
                       placeholder="Away Goals"
                       value="${match.awayGoals ?? ""}">

                <br><br>

                <label>Status:</label>

                <select id="${match.id}_status">
                    <option value="upcoming" ${match.status === "upcoming" ? "selected" : ""}>Upcoming</option>
                    <option value="live" ${match.status === "live" ? "selected" : ""}>Live</option>
                    <option value="finished" ${match.status === "finished" ? "selected" : ""}>Finished</option>
                </select>

                <br><br>

                <label>Winner:</label>

                <select id="${match.id}_winner">
                    <option value="">Auto from score</option>

                    <option value="${match.homeTeam}"
                        ${match.winner === match.homeTeam ? "selected" : ""}>
                        ${match.homeTeam}
                    </option>

                    <option value="${match.awayTeam}"
                        ${match.winner === match.awayTeam ? "selected" : ""}>
                        ${match.awayTeam}
                    </option>
                </select>

                <br><br>

                <button class="saveMatchBtn"
                        data-id="${match.id}">
                    Save Result
                </button>

            </div>
        `;
    });

    attachMatchAdminEvents();
}


function attachGroupAdminEvents() {
    document.querySelectorAll(".addUserToGroupBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const groupId = button.dataset.groupId;

            const username =
                document.getElementById(`addUserSelect_${groupId}`).value;

            if (!username) {
                alert("Please select a user.");
                return;
            }

            await addUserToGroupSafe(username, groupId);

            await recalculateGroupLeaderboard(groupId);

            alert(`${username} added to group.`);
            await reloadAdminPage();
        });
    });


    document.querySelectorAll(".removeUserFromGroupBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const groupId = button.dataset.groupId;
            const username = button.dataset.username;

            const confirmRemove =
                confirm(`Remove ${username} from this group?`);

            if (!confirmRemove) return;

            await removeUserFromGroupSafe(username, groupId);

            await recalculateGroupLeaderboard(groupId);

            alert(`${username} removed from group.`);
            await reloadAdminPage();
        });
    });


    document.querySelectorAll(".deleteGroupBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const groupId = button.dataset.groupId;
            const groupName = button.dataset.groupName;

            const confirmDelete =
                confirm(
                    `Delete group "${groupName}"?\n\nThis removes the group, but does not delete users.`
                );

            if (!confirmDelete) return;

            const groupSnap = await getDoc(doc(db, "groups", groupId));

            if (groupSnap.exists()) {
                const group = groupSnap.data();
                const members = group.members ? Object.keys(group.members) : [];

                for (const member of members) {
                    await updateDoc(doc(db, "users", member), {
                        groups: arrayRemove(groupId)
                    });
                }
            }

            const leaderboardUsersSnap =
                await getDocs(collection(db, "leaderboards", groupId, "users"));

            for (const leaderboardUserDoc of leaderboardUsersSnap.docs) {
                await deleteDoc(
                    doc(
                        db,
                        "leaderboards",
                        groupId,
                        "users",
                        leaderboardUserDoc.id
                    )
                );
            }

            await deleteDoc(doc(db, "groups", groupId));

            alert(`Group "${groupName}" deleted.`);
            await reloadAdminPage();
        });
    });
}


function attachMatchAdminEvents() {
    document.querySelectorAll(".saveMatchBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;

            const homeTeam =
                document.getElementById(`${matchId}_homeTeam`).value.trim();

            const awayTeam =
                document.getElementById(`${matchId}_awayTeam`).value.trim();

            const homeGoalsValue =
                document.getElementById(`${matchId}_homeGoals`).value;

            const awayGoalsValue =
                document.getElementById(`${matchId}_awayGoals`).value;

            const status =
                document.getElementById(`${matchId}_status`).value;

            const selectedWinner =
                document.getElementById(`${matchId}_winner`).value;

            const homeGoals =
                homeGoalsValue === "" ? null : Number(homeGoalsValue);

            const awayGoals =
                awayGoalsValue === "" ? null : Number(awayGoalsValue);

            let winner = selectedWinner;

            if (!winner && homeGoals !== null && awayGoals !== null) {
                if (homeGoals > awayGoals) {
                    winner = homeTeam;
                } else if (awayGoals > homeGoals) {
                    winner = awayTeam;
                } else {
                    winner = null;
                }
            }

            if (
                status === "finished" &&
                homeGoals !== null &&
                awayGoals !== null &&
                homeGoals === awayGoals &&
                !winner
            ) {
                alert("This match is tied. Please manually select the winner.");
                return;
            }

            await updateDoc(doc(db, "matches", matchId), {
                homeTeam,
                awayTeam,
                homeGoals,
                awayGoals,
                winner,
                status,
                updatedAt: new Date().toISOString()
            });

            await recalculateGlobalLeaderboard();

            const groupsSnap = await getDocs(collection(db, "groups"));

            for (const groupDoc of groupsSnap.docs) {
                await recalculateGroupLeaderboard(groupDoc.id);
            }

            alert(`${matchId} saved and all leaderboards recalculated.`);
            await reloadAdminPage();
        });
    });
}


async function addUserToGroupSafe(username, groupId) {
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) return;

    const group = groupSnap.data();
    const members = group.members ? { ...group.members } : {};

    members[username] = true;

    await updateDoc(groupRef, {
        members
    });

    await updateDoc(doc(db, "users", username), {
        groups: arrayUnion(groupId)
    });
}


async function removeUserFromGroupSafe(username, groupId) {
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) return;

    const group = groupSnap.data();
    const members = group.members ? { ...group.members } : {};

    delete members[username];

    await updateDoc(groupRef, {
        members
    });

    await updateDoc(doc(db, "users", username), {
        groups: arrayRemove(groupId)
    });

    await deleteDoc(doc(db, "leaderboards", groupId, "users", username));
}


async function deleteUserCompletely(username) {
    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        alert("User not found.");
        return;
    }

    const groupsSnap = await getDocs(collection(db, "groups"));

    for (const groupDoc of groupsSnap.docs) {
        await removeUserFromGroupSafe(username, groupDoc.id);
    }

    const predictionsSnap =
        await getDocs(collection(db, "predictions", username, "matches"));

    for (const predictionDoc of predictionsSnap.docs) {
        await deleteDoc(
            doc(db, "predictions", username, "matches", predictionDoc.id)
        );
    }

    await deleteDoc(doc(db, "predictions", username));

    await deleteUserFromAllLeaderboards(username);

    await deleteDoc(userRef);

    await recalculateGlobalLeaderboard();

    const groupsAfterSnap = await getDocs(collection(db, "groups"));

    for (const groupDoc of groupsAfterSnap.docs) {
        await recalculateGroupLeaderboard(groupDoc.id);
    }
}


async function renameUserCompletely(oldUsername, newUsername) {
    const oldUserRef = doc(db, "users", oldUsername);
    const oldUserSnap = await getDoc(oldUserRef);

    if (!oldUserSnap.exists()) {
        alert("Old user not found.");
        return;
    }

    const newUserRef = doc(db, "users", newUsername);
    const newUserSnap = await getDoc(newUserRef);

    if (newUserSnap.exists()) {
        alert("New username already exists.");
        return;
    }

    const oldUserData = oldUserSnap.data();

    await setDoc(newUserRef, {
        ...oldUserData,
        username: newUsername,
        renamedFrom: oldUsername,
        renamedAt: new Date().toISOString()
    });

    const groupsSnap = await getDocs(collection(db, "groups"));

    for (const groupDoc of groupsSnap.docs) {
        const groupRef = doc(db, "groups", groupDoc.id);
        const group = groupDoc.data();

        const members = group.members ? { ...group.members } : {};

        if (members[oldUsername]) {
            delete members[oldUsername];
            members[newUsername] = true;

            const updateData = {
                members
            };

            if (group.creator === oldUsername) {
                updateData.creator = newUsername;
            }

            await updateDoc(groupRef, updateData);
        }
    }

    await updatePredictionsUsername(oldUsername, newUsername);

    await deleteUserFromAllLeaderboards(oldUsername);

    await deleteDoc(oldUserRef);

    await recalculateGlobalLeaderboard();

    const groupsAfterSnap = await getDocs(collection(db, "groups"));

    for (const groupDoc of groupsAfterSnap.docs) {
        await recalculateGroupLeaderboard(groupDoc.id);
    }
}


async function updatePredictionsUsername(oldUsername, newUsername) {
    const predictionsSnap =
        await getDocs(collection(db, "predictions", oldUsername, "matches"));

    for (const predictionDoc of predictionsSnap.docs) {
        await setDoc(
            doc(db, "predictions", newUsername, "matches", predictionDoc.id),
            predictionDoc.data()
        );

        await deleteDoc(
            doc(db, "predictions", oldUsername, "matches", predictionDoc.id)
        );
    }

    await deleteDoc(doc(db, "predictions", oldUsername));
}


async function deleteUserFromAllLeaderboards(username) {
    const leaderboardsSnap = await getDocs(collection(db, "leaderboards"));

    for (const leaderboardDoc of leaderboardsSnap.docs) {
        const leaderboardUserRef =
            doc(db, "leaderboards", leaderboardDoc.id, "users", username);

        const leaderboardUserSnap = await getDoc(leaderboardUserRef);

        if (leaderboardUserSnap.exists()) {
            await deleteDoc(leaderboardUserRef);
        }
    }
}


function safeHtmlId(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}