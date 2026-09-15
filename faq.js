document.addEventListener("DOMContentLoaded", () => {
  loadFaqs();
});

async function loadFaqs() {
  const container = document.getElementById("faqList");
  try {
    const res = await fetch("/api/faq");
    const data = await res.json();
    
    if (!data.faqs || data.faqs.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px 0;">No FAQ entries published yet.</div>`;
      return;
    }
    
    container.innerHTML = "";
    data.faqs.forEach(faq => {
      const item = document.createElement("div");
      item.className = "faq-item";
      item.style.cssText = `
        background: #0d1117;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        overflow: hidden;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      `;
      
      const header = document.createElement("div");
      header.className = "faq-header";
      header.style.cssText = `
        padding: 16px 20px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
        user-select: none;
      `;
      header.innerHTML = `
        <h3 style="margin:0; font-size:14.5px; font-weight:700; color:var(--text);">${escapeHtml(faq.question)}</h3>
        <span class="faq-icon" style="
          transition: transform 0.25s ease;
          display: inline-flex;
          color: var(--muted);
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      `;
      
      const content = document.createElement("div");
      content.className = "faq-content";
      content.style.cssText = `
        max-height: 0px;
        overflow: hidden;
        transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s ease;
        padding: 0 20px;
      `;
      
      const contentInner = document.createElement("div");
      contentInner.style.cssText = `
        padding-bottom: 16px;
        color: var(--muted);
        font-size: 13.5px;
        line-height: 1.5;
        white-space: pre-wrap;
      `;
      contentInner.textContent = faq.answer;
      
      content.appendChild(contentInner);
      item.appendChild(header);
      item.appendChild(content);
      container.appendChild(item);
      
      header.addEventListener("click", () => {
        const isOpen = item.classList.toggle("open");
        const icon = header.querySelector(".faq-icon");
        
        if (isOpen) {
          item.style.borderColor = "rgba(255, 42, 133, 0.25)";
          item.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)";
          icon.style.transform = "rotate(180deg)";
          icon.style.color = "var(--pink)";
          content.style.maxHeight = content.scrollHeight + "px";
          content.style.padding = "0 20px";
        } else {
          item.style.borderColor = "rgba(255, 255, 255, 0.06)";
          item.style.boxShadow = "none";
          icon.style.transform = "rotate(0deg)";
          icon.style.color = "var(--muted)";
          content.style.maxHeight = "0px";
        }
      });
    });
  } catch (e) {
    container.innerHTML = `<div style="text-align:center; color:var(--red); padding:40px 0;">Error loading FAQ questions.</div>`;
    console.error(e);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
