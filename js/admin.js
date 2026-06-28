import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    deleteDoc,
    deleteField,
    arrayUnion,
    arrayRemove
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    recalculateGlobalLeaderboard,
    recalculateGroupLeaderboard
}
from "./leaderboard.js";


export async function isAdmin(username) {
    const snap = await getDoc(doc(db, "users", username));
    return snap.exists() && snap.data().isAdmin === true;
}


export async function loadAdminPage() {
    const container = document.getElementById("adminContainer");

    container.innerHTML = `
        <h2>Admin Area</h2>

        <h2>Group Management</h2>
        <div id="adminGroupsContainer"></div>

        <hr>

        <h2>Admin Match Editor</h2>
        <div id="adminMatchesContainer"></div>
    `;

    await loadAdminGroups();
    await loadAdminMatches();
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
                                    data-username="${member}">
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
                        <option value="${user}">
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
                        data-group-name="${group.groupName}">
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
        container.innerHTML += `
            <div class="adminMatchCard">

                <h3>${match.id}</h3>

                <input id="${match.id}_homeTeam"
                       value="${match.homeTeam}">

                <span>vs</span>

                <input id="${match.id}_awayTeam"
                       value="${match.awayTeam}">

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
                    Save
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

            await updateDoc(doc(db, "groups", groupId), {
                [`members.${username}`]: true
            });

            await updateDoc(doc(db, "users", username), {
                groups: arrayUnion(groupId)
            });

            await recalculateGroupLeaderboard(groupId);

            alert(`${username} added to group.`);
            loadAdminPage();
        });
    });


    document.querySelectorAll(".removeUserFromGroupBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const groupId = button.dataset.groupId;
            const username = button.dataset.username;

            const confirmRemove =
                confirm(`Remove ${username} from this group?`);

            if (!confirmRemove) return;

            await updateDoc(doc(db, "groups", groupId), {
                [`members.${username}`]: deleteField()
            });

            await updateDoc(doc(db, "users", username), {
                groups: arrayRemove(groupId)
            });

            await recalculateGroupLeaderboard(groupId);

            alert(`${username} removed from group.`);
            loadAdminPage();
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
            loadAdminPage();
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
        });
    });
}