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

import {
    loadFinalRoundAdminTree
}
from "./adminTree.js";

import {
    propagateActualFinalRoundTeams
}
from "./finalRoundEngine.js";

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

    const tournamentInfo = await getTournamentInfo();
    const activeRound = tournamentInfo.activeRound;
    const predictionDisplayEnabled = tournamentInfo.predictionDisplayEnabled;

    const predictionAdminPanel = !predictionDisplayEnabled
        ? `
            <div class="adminMatchCard">
                <h3>Prediction Display Control</h3>

                <p class="smallText">
                    Enable this only after the prediction deadline has passed.
                    This will also close predictions for ${formatRoundName(activeRound)}.
                </p>

                <button id="enablePredictionsDisplayBtn" class="bigButton">
                    Enable ${formatRoundName(activeRound)} Predictions Display
                </button>
            </div>

            <div class="adminMatchCard">
                <h3>Prediction Submission Status</h3>
                <div id="predictionStatusContainer"></div>
            </div>

            <hr>
          `
        : "";

    if (currentUserIsFullAdmin) {
        container.innerHTML = `
            <h2>Admin Area</h2>

            ${predictionAdminPanel}

            <h2>⚽ Match Editor</h2>
            <div id="adminMatchesContainer"></div>

            <hr>

            <h2>👥 User Management</h2>
            <div id="adminUsersContainer"></div>

            <hr>

            <h2>🏆 Group Management</h2>
            <div id="adminGroupsContainer"></div>
        `;

        if (!predictionDisplayEnabled) {
            attachPredictionDisplayButton(activeRound);
            await loadPredictionStatusPanel();
        }

        await loadAdminMatches();
        await loadAdminUsers();
        await loadAdminGroups();

        return;
    }

    container.innerHTML = `
        <h2>Match Result Admin</h2>

        <p class="smallText">
            You can update match scores, winner and status only.
        </p>

        ${predictionAdminPanel}

        <div id="adminMatchesContainer"></div>
    `;

    if (!predictionDisplayEnabled) {
        attachPredictionDisplayButton(activeRound);
        await loadPredictionStatusPanel();
    }

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

    const settingsSnap = await getDoc(doc(db, "settings", "tournament"));

    const activeRound =
        settingsSnap.exists()
            ? settingsSnap.data().activePredictionRound || "RoundOf16"
            : "RoundOf16";

    if (activeRound === "QF-SF-F") {
        // Repair and refresh the actual bracket teams from all saved results.
        await propagateActualFinalRoundTeams();

        await loadFinalRoundAdminTree({
            currentUserIsFullAdmin,
            onAfterSave: async () => {
                showAdminStatus("The match result was saved. Qualified teams are being updated...");

                // QF winners fill the Semi Finals.
                // SF winners fill the Final and SF losers fill the 3rd Place match.
                await propagateActualFinalRoundTeams();

                showAdminStatus("Qualified teams are updated. Leaderboards are being updated, please wait...");

                await updateLeaderboardsAfterResult();
                await markResultsUpdated();

                showAdminStatus(
                    "Qualified teams and leaderboards are updated.",
                    "successText"
                );

                alert("Result saved. Qualified teams and leaderboards are updated.");
                await reloadAdminPage();
            }
        });
        return;
    }

    const snapshot = await getDocs(collection(db, "matches"));

    const matches = [];

    snapshot.forEach(docSnap => {
        const match = docSnap.data();

        if (match.round === activeRound) {
            matches.push(match);
        }
    });

    matches.sort((a, b) => a.id.localeCompare(b.id));

    if (matches.length === 0) {
        container.innerHTML = `
            <p class="warningText">
                No matches found for the current round: ${activeRound}
            </p>
        `;
        return;
    }

    container.innerHTML = `
        <p class="leaderboardInfoText">
            Showing match editor for current round only: ${formatRoundName(activeRound)}
        </p>
    `;

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

            button.disabled = true;
            button.innerText = "Saving...";

            await updateDoc(doc(db, "matches", matchId), {
                homeTeam,
                awayTeam,
                homeGoals,
                awayGoals,
                winner,
                status,
                updatedAt: new Date().toISOString()
            });

            showAdminStatus("The match result was saved. Leaderboards are being updated, please wait...");

            await updateLeaderboardsAfterResult();

            await markResultsUpdated();

            showAdminStatus("Leaderboards are updated. Prediction tables will show the new result after users refresh or reopen the Predictions tab.", "successText");

            alert("Result saved and leaderboards updated.");

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

async function enablePredictionsDisplay(round) {
    const settingsRef = doc(db, "settings", "tournament");
    const settingsSnap = await getDoc(settingsRef);

    const currentSettings = settingsSnap.exists()
        ? settingsSnap.data()
        : {};

    const currentDisplayPredictions =
        currentSettings.displayPredictions || {};

    const currentPredictionsClosed =
        currentSettings.predictionsClosed || {};

    await setDoc(settingsRef, {
        ...currentSettings,
        displayPredictions: {
            ...currentDisplayPredictions,
            [round]: true
        },
        predictionsClosed: {
            ...currentPredictionsClosed,
            [round]: true
        },
        predictionDeadlineClosedAt: {
            ...(currentSettings.predictionDeadlineClosedAt || {}),
            [round]: new Date().toISOString()
        }
    }, { merge: true });

    alert(`${formatRoundName(round)} predictions are now visible to everyone. Predictions for this round are also closed.`);

    await reloadAdminPage();
}

function attachPredictionDisplayButton(round) {
    const button = document.getElementById("enablePredictionsDisplayBtn");

    if (!button) return;

    button.addEventListener("click", async () => {
        const confirmEnable = confirm(
            `Enable ${formatRoundName(round)} predictions display for everyone and close predictions for users who did not submit?`
        );

        if (!confirmEnable) return;

        await enablePredictionsDisplay(round);
    });
}

async function getTournamentInfo() {
    const settingsSnap = await getDoc(doc(db, "settings", "tournament"));

    const settings = settingsSnap.exists()
        ? settingsSnap.data()
        : {};

    const activeRound =
        settings.activePredictionRound || "RoundOf16";

    const predictionDisplayEnabled =
        settings.displayPredictions?.[activeRound] === true;

    const predictionsClosed =
        settings.predictionsClosed?.[activeRound] === true;

    return {
        settings,
        activeRound,
        predictionDisplayEnabled,
        predictionsClosed
    };
}

function showAdminStatus(message, className = "warningText") {
    let statusBox = document.getElementById("adminUpdateStatus");

    if (!statusBox) {
        const adminMatchesContainer = document.getElementById("adminMatchesContainer");

        if (!adminMatchesContainer) {
            alert(message);
            return;
        }

        statusBox = document.createElement("p");
        statusBox.id = "adminUpdateStatus";
        adminMatchesContainer.prepend(statusBox);
    }

    statusBox.className = className;
    statusBox.innerText = message;
}

async function updateLeaderboardsAfterResult() {
    await recalculateGlobalLeaderboard();

    const groupsSnap = await getDocs(collection(db, "groups"));

    await Promise.all(
        groupsSnap.docs.map(groupDoc =>
            recalculateGroupLeaderboard(groupDoc.id)
        )
    );
}

async function markResultsUpdated() {
    await setDoc(doc(db, "settings", "tournament"), {
        lastResultsUpdateAt: new Date().toISOString()
    }, { merge: true });
}

async function loadPredictionStatusPanel() {
    const container = document.getElementById("predictionStatusContainer");

    if (!container) return;

    const settingsSnap = await getDoc(doc(db, "settings", "tournament"));

    const activeRound =
        settingsSnap.exists()
            ? settingsSnap.data().activePredictionRound || "RoundOf16"
            : "RoundOf16";

    const submittedField =
        activeRound === "RoundOf32" ? "predictionsSubmittedRound32" :
        activeRound === "RoundOf16" ? "predictionsSubmittedRound16" :
        activeRound === "QF-SF-F" ? "predictionsSubmittedQFSFF" :
        "predictionsSubmittedRound16";

    const usersSnap = await getDocs(collection(db, "users"));

    const users = [];

    usersSnap.forEach(userDoc => {
        const data = userDoc.data();

        users.push({
            username: userDoc.id,
            submitted: data[submittedField] === true
        });
    });

    users.sort((a, b) => a.username.localeCompare(b.username));

    const submittedCount =
        users.filter(user => user.submitted).length;

    const totalCount = users.length;

    const complete =
        totalCount > 0 && submittedCount === totalCount;

    container.innerHTML = `
        <h3>${formatRoundName(activeRound)} Prediction Status</h3>

        <p>
            <strong>${submittedCount} / ${totalCount}</strong>
            submitted
        </p>

        <p class="${complete ? "successText" : "warningText"}">
            ${
                complete
                ? "Prediction phase complete."
                : "Prediction phase not complete yet."
            }
        </p>

        <div class="predictionStatusWrapper">
            <table class="predictionStatusTable">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Status</th>
                    </tr>
                </thead>

                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>👤 <strong>${user.username}</strong></td>
                            <td>
                                ${
                                    user.submitted
                                    ? "✅ Submitted"
                                    : "❌ Not submitted"
                                }
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function formatRoundName(round) {
    if (round === "RoundOf32") return "Round of 32";
    if (round === "RoundOf16") return "Round of 16";
    if (round === "QF-SF-F") return "QF • SF • 3rd Place • Final";

    return round;
}