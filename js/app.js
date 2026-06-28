import {
    signUp,
    login,
    logout,
    getCurrentUser
}
from "./auth.js";

import {
    createGroup,
    loadGroups,
    joinGroup
}
from "./groups.js";

import {
    initializeMatches,
    loadPredictionPage
}
from "./predictions.js";

import {
    isAdmin,
    canUpdateResults,
    loadAdminPage
}
from "./admin.js";

import {
    loadGlobalLeaderboard,
    loadGroupLeaderboard
}
from "./leaderboard.js";

import {
    showPage,
    setWelcome,
    showApp,
    showAdminButton
}
from "./ui.js";


async function startApp() {
    const username = getCurrentUser();

    if (!username) return;

    showApp();
    setWelcome(username);

    await initializeMatches();

    if (await canUpdateResults(username)) {
        showAdminButton();
    }

    openHomePage();
}


function openHomePage() {
    showPage("homePage");
    loadGroups(getCurrentUser());
}


function openPredictionsPage() {
    showPage("predictionsPage");

    loadPredictionPage(
        getCurrentUser(),
        localStorage.getItem("currentGroupId"),
        localStorage.getItem("currentGroupName")
    );
}


function openAdminPage() {
    showPage("adminPage");
    loadAdminPage();
}


function openGlobalLeaderboardPage() {
    showPage("leaderboardPage");
    loadGlobalLeaderboard();
}


function openGroupLeaderboardPage(groupId, groupName) {
    localStorage.setItem("currentGroupId", groupId);
    localStorage.setItem("currentGroupName", groupName);

    showPage("leaderboardPage");
    loadGroupLeaderboard(groupId, groupName);
}


document.getElementById("signupBtn").addEventListener("click", async () => {
    const username = document.getElementById("usernameInput").value;
    const password = document.getElementById("passwordInput").value;

    const success = await signUp(username, password);

    if (success) {
        startApp();
    }
});


document.getElementById("loginBtn").addEventListener("click", async () => {
    const username = document.getElementById("usernameInput").value;
    const password = document.getElementById("passwordInput").value;

    const success = await login(username, password);

    if (success) {
        startApp();
    }
});


document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
});


document.getElementById("createGroupBtn").addEventListener("click", () => {
    createGroup(
        document.getElementById("groupNameInput").value,
        getCurrentUser()
    );
});


document.getElementById("joinGroupBtn").addEventListener("click", () => {
    joinGroup(
        document.getElementById("joinCodeInput").value,
        getCurrentUser()
    );
});


document.getElementById("homeBtn").addEventListener("click", () => {
    openHomePage();
});


document.getElementById("groupsBtn").addEventListener("click", () => {
    openHomePage();
});


document.getElementById("predictionsBtn").addEventListener("click", () => {
    openPredictionsPage();
});


document.getElementById("leaderboardBtn").addEventListener("click", () => {
    openGlobalLeaderboardPage();
});


document.getElementById("adminBtn").addEventListener("click", () => {
    openAdminPage();
});


document.addEventListener("click", event => {
    if (event.target.classList.contains("openGroupBtn")) {
        const groupId = event.target.dataset.groupId;
        const groupName = event.target.dataset.groupName;

        openGroupLeaderboardPage(groupId, groupName);
    }
});


startApp();