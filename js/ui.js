export function showPage(pageId) {
    const pages = [
        "homePage",
        "predictionsPage",
        "adminPage",
        "leaderboardPage"
    ];

    pages.forEach(id => {
        const page = document.getElementById(id);
        if (page) {
            page.style.display = id === pageId ? "block" : "none";
        }
    });
}


export function setWelcome(username) {
    document.getElementById("welcomeText").innerText =
        `Welcome ${username}`;
}


export function showApp() {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("appSection").style.display = "block";
}


export function showAdminButton() {
    document.getElementById("adminBtn").style.display = "inline-block";
}