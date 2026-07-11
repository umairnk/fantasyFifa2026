import {
    signUp,
    login,
    logout,
    getCurrentUser,
    isLoginDisabled
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

import {
    loadInsightsPage
}
from "./insights.js";


async function startApp() {
    const username = getCurrentUser();

    if (!username) return;

    if (await isLoginDisabled(username)) {
        alert("Your account has been disabled. Please contact the administrator.");
        logout();
        return;
    }

    showApp();
    setWelcome(username);

    await initializeMatches();

    if (await canUpdateResults(username)) {
        showAdminButton();
    }

    restoreLastOpenPage();
}


function openHomePage() {
    localStorage.setItem("currentPage", "home");
    showPage("homePage");
    loadGroups(getCurrentUser());
}


function openPredictionsPage() {
    localStorage.setItem("currentPage", "predictions");
    showPage("predictionsPage");

    loadPredictionPage(
        getCurrentUser(),
        localStorage.getItem("currentGroupId"),
        localStorage.getItem("currentGroupName")
    );
}


function openAdminPage() {
    localStorage.setItem("currentPage", "admin");
    showPage("adminPage");
    loadAdminPage(getCurrentUser());
}


function openGlobalLeaderboardPage() {
    localStorage.setItem("currentPage", "leaderboard");
    showPage("leaderboardPage");
    loadGlobalLeaderboard();
}


function openGroupLeaderboardPage(groupId, groupName) {
    localStorage.setItem("currentPage", "groupLeaderboard");
    localStorage.setItem("currentGroupId", groupId);
    localStorage.setItem("currentGroupName", groupName);

    showPage("leaderboardPage");
    loadGroupLeaderboard(groupId, groupName);
}

function openInsightsPage() {
    localStorage.setItem("currentPage", "insights");
    showPage("insightsPage");

    loadInsightsPage(
        localStorage.getItem("currentGroupId"),
        localStorage.getItem("currentGroupName")
    );
}

function restoreLastOpenPage() {
    const currentPage = localStorage.getItem("currentPage") || "home";
    const groupId = localStorage.getItem("currentGroupId");
    const groupName = localStorage.getItem("currentGroupName");

    if (currentPage === "predictions") {
        openPredictionsPage();
        return;
    }

    if (currentPage === "leaderboard") {
        openGlobalLeaderboardPage();
        return;
    }

    if (currentPage === "groupLeaderboard" && groupId && groupName) {
        openGroupLeaderboardPage(groupId, groupName);
        return;
    }

    if (currentPage === "insights") {
        openInsightsPage();
        return;
    }

    if (currentPage === "admin") {
        openAdminPage();
        return;
    }

    openHomePage();
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


document.getElementById("insightsBtn").addEventListener("click", () => {
    openInsightsPage();
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