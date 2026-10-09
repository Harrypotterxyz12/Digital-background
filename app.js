const grid = document.querySelector("#product-grid");
document.querySelector("#year").textContent = new Date().getFullYear();

const artClasses = ["art-one", "art-two", "art-one", "art-two"];
const symbols = ["✦", "▦", "◇", "✧"];

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Products unavailable");
    const products = await response.json();
    grid.innerHTML = products.map((p, i) => `
      <article class="product-card">
        <div class="art ${artClasses[i % artClasses.length]}">${symbols[i % symbols.length]}</div>
        <p class="tag">DIGITAL DOWNLOAD</p>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="muted">${escapeHtml(p.description)}</p>
        <div class="buy-row">
          <strong>$${Number(p.price).toFixed(2)}</strong>
          <button onclick="choosePayment('${p.id}')">Buy now ↗</button>
        </div>
      </article>`).join("");
  } catch (e) {
    console.error(e);
    grid.insertAdjacentHTML("beforeend", '<p class="notice">Could not load products. Please try again later.</p>');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

async function choosePayment(productId) {
  const choice = prompt("Enter 1 for Card (Visa/Mastercard) or 2 for PayPal:");
  if (choice !== "1" && choice !== "2") return;
  const endpoint = choice === "1" ? "/api/checkout/stripe" : "/api/checkout/paypal";
  const button = event && event.target;
  if (button) { button.disabled = true; button.textContent = "Starting…"; }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Checkout failed");
    window.location.href = choice === "1" ? data.url : data.approveUrl;
  } catch (err) {
    alert(err.message + "\nPlease check the payment setup.");
    if (button) { button.disabled = false; button.textContent = "Buy now ↗"; }
  }
}
loadProducts();