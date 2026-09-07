// ─── ShopAI — Main Application ──────────────────────────────────
// AI-powered shopping assistant with Gemini API integration

// ─── State ──────────────────────────────────────────────────────
const state = {
  apiKey: localStorage.getItem('shopai_api_key') || '',
  cart: JSON.parse(localStorage.getItem('shopai_cart') || '[]'),
  messages: [],
  isTyping: false,
  activeCategory: 'all',
  searchQuery: '',
  cartOpen: false,
};

// ─── Gemini API ─────────────────────────────────────────────────
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are ShopAI, a friendly and knowledgeable AI shopping assistant. You help users find products, make recommendations, compare items, and answer shopping questions.

IMPORTANT RULES:
1. When recommending products, ALWAYS reference them by their exact ID using this format: [[PRODUCT:id]] (e.g., [[PRODUCT:1]] for MacBook Pro)
2. You can recommend multiple products in a single response
3. Be enthusiastic but honest. Mention pros and help users make informed decisions
4. If a user asks for something not in the catalog, suggest the closest alternatives
5. Keep responses concise but helpful (2-4 short paragraphs max)
6. Use markdown-style formatting: **bold** for emphasis, bullet points for lists
7. When comparing products, highlight key differences clearly
8. If user mentions a budget, respect it strictly
9. Always consider the user's stated use case when recommending

Here is the complete product catalog:

${getCatalogSummary()}

Remember: ALWAYS use [[PRODUCT:id]] format when mentioning products so they can be displayed as interactive cards.`;

async function sendToGemini(userMessage) {
  // Build conversation history
  const contents = [];

  // Add conversation history (last 10 messages for context window)
  const recentMessages = state.messages.slice(-10);
  for (const msg of recentMessages) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const response = await fetch(`${GEMINI_API_URL}?key=${state.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response. Please try again.';
}

// ─── Message Parsing ────────────────────────────────────────────
function parseAIResponse(text) {
  // Extract product references [[PRODUCT:id]]
  const productPattern = /\[\[PRODUCT:(\d+)\]\]/g;
  const productIds = [];
  let match;

  while ((match = productPattern.exec(text)) !== null) {
    const id = parseInt(match[1]);
    if (getProductById(id) && !productIds.includes(id)) {
      productIds.push(id);
    }
  }

  // Clean the text: remove product markers
  let cleanText = text.replace(/\[\[PRODUCT:\d+\]\]/g, '').trim();

  // Convert markdown-style formatting to HTML
  cleanText = formatMessageText(cleanText);

  return { html: cleanText, productIds };
}

function formatMessageText(text) {
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Line breaks
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');

  // Bullet points
  text = text.replace(/^[-•]\s+(.+)/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // Wrap in paragraphs
  if (!text.startsWith('<')) {
    text = '<p>' + text + '</p>';
  }

  return text;
}

// ─── UI Rendering ───────────────────────────────────────────────
function renderWelcome() {
  const suggestions = [
    { emoji: '💻', text: 'Find me a laptop under $1000' },
    { emoji: '🎁', text: 'Gift ideas for a tech lover' },
    { emoji: '🏃', text: 'Best running shoes for beginners' },
    { emoji: '☕', text: 'Top-rated coffee makers' },
    { emoji: '💄', text: 'Trending beauty products' },
    { emoji: '📱', text: 'Compare iPhone vs Samsung' },
  ];

  return `
    <div class="welcome-container">
      <div class="welcome-icon">🛍️</div>
      <h1 class="welcome-title">Hi! I'm ShopAI</h1>
      <p class="welcome-subtitle">Your personal AI shopping assistant. Ask me anything about products, recommendations, deals, or comparisons!</p>
      <div class="suggestion-chips">
        ${suggestions.map(s => `
          <button class="suggestion-chip" onclick="handleSuggestion('${s.text.replace(/'/g, "\\'")}')">
            <span class="chip-emoji">${s.emoji}</span>${s.text}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMessage(msg) {
  const isUser = msg.role === 'user';
  const avatarEmoji = isUser ? '👤' : '🛍️';

  let productCardsHtml = '';
  if (msg.productIds && msg.productIds.length > 0) {
    productCardsHtml = `
      <div class="chat-product-cards">
        ${msg.productIds.map(id => {
          const p = getProductById(id);
          if (!p) return '';
          return renderChatProductCard(p);
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="message ${isUser ? 'user' : 'assistant'}">
      <div class="message-avatar">${avatarEmoji}</div>
      <div class="message-content">
        <div class="message-bubble">${msg.html || msg.text}</div>
        ${productCardsHtml}
      </div>
    </div>
  `;
}

function renderChatProductCard(product) {
  const isInCart = state.cart.some(item => item.id === product.id);

  return `
    <div class="chat-product-card" onclick="showProductInPanel(${product.id})">
      <div class="chat-card-image" style="background: ${product.gradient}">
        ${product.emoji}
        ${product.badge ? `<span class="chat-card-badge">${product.badge}</span>` : ''}
      </div>
      <div class="chat-card-body">
        <div class="chat-card-name">${product.name}</div>
        <div class="chat-card-meta">
          <span class="chat-card-price">$${product.price}</span>
          <span class="chat-card-rating">★ ${product.rating}</span>
        </div>
        <button class="chat-card-add ${isInCart ? 'added' : ''}" onclick="event.stopPropagation(); addToCart(${product.id})">
          ${isInCart ? '✓ In Cart' : '+ Add to Cart'}
        </button>
      </div>
    </div>
  `;
}

function renderTypingIndicator() {
  return `
    <div class="typing-indicator" id="typing-indicator">
      <div class="message-avatar" style="background: var(--accent-gradient)">🛍️</div>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
}

// ─── Chat Logic ─────────────────────────────────────────────────
async function sendMessage(text) {
  if (!text?.trim() || state.isTyping) return;

  const chatMessages = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  // Remove welcome screen if present
  const welcome = chatMessages.querySelector('.welcome-container');
  if (welcome) welcome.remove();

  // Add user message
  const userMsg = { role: 'user', text: text.trim(), html: `<p>${escapeHtml(text.trim())}</p>` };
  state.messages.push(userMsg);
  chatMessages.insertAdjacentHTML('beforeend', renderMessage(userMsg));

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // Show typing indicator
  state.isTyping = true;
  chatMessages.insertAdjacentHTML('beforeend', renderTypingIndicator());
  scrollToBottom();

  try {
    // Call Gemini API
    const response = await sendToGemini(text.trim());
    const parsed = parseAIResponse(response);

    // Remove typing indicator
    document.getElementById('typing-indicator')?.remove();

    // Add AI message
    const aiMsg = { role: 'assistant', text: response, html: parsed.html, productIds: parsed.productIds };
    state.messages.push(aiMsg);
    chatMessages.insertAdjacentHTML('beforeend', renderMessage(aiMsg));

  } catch (error) {
    document.getElementById('typing-indicator')?.remove();

    const errorMsg = {
      role: 'assistant',
      text: error.message,
      html: `<p>⚠️ ${escapeHtml(error.message)}</p><p>Please check your API key and try again.</p>`,
      productIds: []
    };
    state.messages.push(errorMsg);
    chatMessages.insertAdjacentHTML('beforeend', renderMessage(errorMsg));
  }

  state.isTyping = false;
  sendBtn.disabled = false;
  scrollToBottom();
}

function handleSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendMessage(text);
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chat-messages');
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Product Panel ──────────────────────────────────────────────
function renderProductGrid() {
  const grid = document.getElementById('product-grid');
  let products;

  if (state.searchQuery) {
    products = searchProducts(state.searchQuery);
    if (state.activeCategory !== 'all') {
      products = products.filter(p => p.category === state.activeCategory);
    }
  } else {
    products = getProductsByCategory(state.activeCategory);
  }

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-text">No products found</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const discount = p.originalPrice > p.price
      ? Math.round((1 - p.price / p.originalPrice) * 100)
      : 0;
    const isInCart = state.cart.some(item => item.id === p.id);
    const stars = '★'.repeat(Math.floor(p.rating)) + (p.rating % 1 >= 0.5 ? '½' : '');

    return `
      <div class="product-card">
        <div class="product-card-image" style="background: ${p.gradient}">
          ${p.emoji}
          ${p.badge ? `<span class="product-card-badge">${p.badge}</span>` : ''}
        </div>
        <div class="product-card-body">
          <div class="product-card-category">${p.category}</div>
          <div class="product-card-name" title="${p.name}">${p.name}</div>
          <div class="product-card-price-row">
            <span class="product-card-price">$${p.price}</span>
            ${discount > 0 ? `
              <span class="product-card-original-price">$${p.originalPrice}</span>
              <span class="product-card-discount">-${discount}%</span>
            ` : ''}
          </div>
          <div class="product-card-rating">
            <span class="product-card-stars">${stars}</span>
            ${p.rating} (${p.reviews.toLocaleString()})
          </div>
          <button class="product-card-add-btn ${isInCart ? 'added' : ''}" onclick="addToCart(${p.id})">
            ${isInCart ? '✓ Added to Cart' : '🛒 Add to Cart'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  container.innerHTML = CATEGORIES.map(cat => `
    <button class="category-pill ${state.activeCategory === cat.id ? 'active' : ''}"
            onclick="setCategory('${cat.id}')">
      ${cat.emoji} ${cat.name}
    </button>
  `).join('');
}

function setCategory(categoryId) {
  state.activeCategory = categoryId;
  renderCategoryFilters();
  renderProductGrid();
}

function showProductInPanel(productId) {
  // Find the product's category and switch to it
  const product = getProductById(productId);
  if (product) {
    state.activeCategory = product.category;
    state.searchQuery = product.name.split(' ')[0]; // search by first word
    document.getElementById('product-search').value = state.searchQuery;
    renderCategoryFilters();
    renderProductGrid();
  }
}

// ─── Cart Management ────────────────────────────────────────────
function addToCart(productId) {
  const product = getProductById(productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({ id: productId, qty: 1 });
  }

  saveCart();
  updateCartBadge();
  renderProductGrid();
  showToast(`${product.emoji} ${product.name} added to cart!`);

  // Also update any chat product cards
  document.querySelectorAll('.chat-card-add').forEach(btn => {
    // Refresh chat messages to update "Added" state
  });
  refreshChatCards();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.id !== productId);
  saveCart();
  updateCartBadge();
  renderCartDrawer();
  renderProductGrid();
  refreshChatCards();
}

function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(productId);
    return;
  }

  saveCart();
  renderCartDrawer();
  updateCartBadge();
}

function saveCart() {
  localStorage.setItem('shopai_cart', JSON.stringify(state.cart));
}

function getCartTotal() {
  return state.cart.reduce((sum, item) => {
    const p = getProductById(item.id);
    return sum + (p ? p.price * item.qty : 0);
  }, 0);
}

function getCartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = getCartCount();
  badge.textContent = count;

  if (count > 0) {
    badge.classList.add('visible');
    badge.classList.add('bounce');
    setTimeout(() => badge.classList.remove('bounce'), 500);
  } else {
    badge.classList.remove('visible');
  }
}

function refreshChatCards() {
  // Re-render all chat product card add buttons
  document.querySelectorAll('.chat-card-add').forEach(btn => {
    const onclickStr = btn.getAttribute('onclick') || '';
    const idMatch = onclickStr.match(/addToCart\((\d+)\)/);
    if (idMatch) {
      const id = parseInt(idMatch[1]);
      const isInCart = state.cart.some(item => item.id === id);
      btn.className = `chat-card-add ${isInCart ? 'added' : ''}`;
      btn.textContent = isInCart ? '✓ In Cart' : '+ Add to Cart';
    }
  });
}

// ─── Cart Drawer ────────────────────────────────────────────────
function toggleCart() {
  state.cartOpen = !state.cartOpen;
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');

  if (state.cartOpen) {
    overlay.classList.add('open');
    drawer.classList.add('open');
    renderCartDrawer();
  } else {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
  }
}

function renderCartDrawer() {
  const itemsContainer = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <div class="cart-empty-text">Your cart is empty</div>
      </div>
    `;
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';

  itemsContainer.innerHTML = state.cart.map(item => {
    const p = getProductById(item.id);
    if (!p) return '';
    return `
      <div class="cart-item">
        <div class="cart-item-image" style="background: ${p.gradient}">${p.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-price">$${(p.price * item.qty).toLocaleString()}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="updateCartQty(${p.id}, -1)">−</button>
            <span class="cart-item-qty">${item.qty}</span>
            <button class="qty-btn" onclick="updateCartQty(${p.id}, 1)">+</button>
            <button class="cart-item-remove" onclick="removeFromCart(${p.id})">🗑 Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Update summary
  const subtotal = getCartTotal();
  const shipping = subtotal > 100 ? 0 : 9.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  document.getElementById('cart-summary').innerHTML = `
    <div class="cart-summary-row">
      <span>Subtotal (${getCartCount()} items)</span>
      <span>$${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
    <div class="cart-summary-row">
      <span>Shipping</span>
      <span>${shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2)}</span>
    </div>
    <div class="cart-summary-row">
      <span>Tax</span>
      <span>$${tax.toFixed(2)}</span>
    </div>
    <div class="cart-summary-row total">
      <span>Total</span>
      <span>$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
  `;
}

// ─── Toast Notifications ────────────────────────────────────────
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✓</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ─── API Key Management ─────────────────────────────────────────
function showApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  modal.classList.add('open');
  document.getElementById('api-key-input').focus();
}

function hideApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  modal.classList.remove('open');
}

function saveApiKey() {
  const input = document.getElementById('api-key-input');
  const key = input.value.trim();
  const error = document.getElementById('api-key-error');

  if (!key) {
    error.textContent = 'Please enter a valid API key';
    error.classList.add('visible');
    return;
  }

  state.apiKey = key;
  localStorage.setItem('shopai_api_key', key);
  error.classList.remove('visible');
  hideApiKeyModal();
  showToast('🔑 API key saved successfully!');
}

// ─── Mobile Product Panel ───────────────────────────────────────
function toggleProductPanel() {
  const panel = document.getElementById('product-panel');
  panel.classList.toggle('mobile-open');
}

// ─── Event Handlers ─────────────────────────────────────────────
function initApp() {
  const chatMessages = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const productSearch = document.getElementById('product-search');

  // Render welcome
  chatMessages.innerHTML = renderWelcome();

  // Render product panel
  renderCategoryFilters();
  renderProductGrid();
  updateCartBadge();

  // Check for API key
  if (!state.apiKey) {
    showApiKeyModal();
  }

  // Chat input handlers
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  input.addEventListener('input', () => {
    // Auto-resize
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendBtn.disabled = !input.value.trim() || state.isTyping;
  });

  sendBtn.addEventListener('click', () => {
    sendMessage(input.value);
  });

  // Product search
  productSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderProductGrid();
  });

  // Cart overlay click to close
  document.getElementById('cart-overlay').addEventListener('click', toggleCart);

  // API key modal enter key
  document.getElementById('api-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });

  // Pre-fill API key if exists
  if (state.apiKey) {
    document.getElementById('api-key-input').value = state.apiKey;
  }
}

// ─── Initialize ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
