document.addEventListener("DOMContentLoaded", () => {
  loadPage();
});

async function loadPage() {
  try {
    const res = await fetch("/api/pages?slug=privacy");
    const data = await res.json();
    
    document.getElementById("pageTitle").textContent = data.title || "Privacy Policy";
    document.getElementById("pageContent").textContent = data.content || "Privacy Policy has not been published yet.";
  } catch (e) {
    document.getElementById("pageContent").textContent = "Error loading Privacy Policy.";
    console.error(e);
  }
}
