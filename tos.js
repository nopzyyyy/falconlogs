document.addEventListener("DOMContentLoaded", () => {
  loadPage();
});

async function loadPage() {
  try {
    const res = await fetch("/api/pages?slug=tos");
    const data = await res.json();
    
    document.getElementById("pageTitle").textContent = data.title || "Terms of Service";
    document.getElementById("pageContent").textContent = data.content || "Terms have not been published yet.";
  } catch (e) {
    document.getElementById("pageContent").textContent = "Error loading Terms of Service.";
    console.error(e);
  }
}
