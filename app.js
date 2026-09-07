// ─── Configuration ──────────────────────────────────────────────


// ─── State ──────────────────────────────────────────────────────
function getInitialApiKey() {
  const windowKey = typeof window !== 'undefined' ? window.__GEMINI_API_KEY__ : null;
  const localKey = typeof localStorage !== 'undefined' ? localStorage.getItem('shopai_api_key') : null;
  const key = windowKey || localKey || null;
  if (!key || key === 'null' || key === 'undefined' || key.trim() === '') return null;
  return key.trim();
}

const state = {
  apiKey: getInitialApiKey(),
  cart: JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('shopai_cart')) || '[]'),
  messages: [],
  isTyping: false,
  activeCategory: 'all',
  searchQuery: '',
  cartOpen: false,
};

// ─── Currency Formatter ─────────────────────────────────────────
function formatINR(amount) {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

// ─── Gemini API ─────────────────────────────────────────────────
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

const SYSTEM_PROMPT = `You are ShopAI, a friendly and knowledgeable AI shopping assistant. You help users find products, make recommendations, compare items, and answer shopping questions. All prices are in Indian Rupees (₹ / INR).

IMPORTANT RULES:
1. When recommending products, ALWAYS reference them by their exact ID using this format: [[PRODUCT:id]] (e.g., [[PRODUCT:1]] for MacBook Pro)
2. You can recommend multiple products in a single response
3. Be enthusiastic but honest. Mention pros and help users make informed decisions
4. If a user asks for something not in the catalog, explain what alternatives are available or note that web recommendations have also been retrieved for them
5. Keep responses concise but helpful (2-4 short paragraphs max)
6. Use markdown-style formatting: **bold** for emphasis, bullet points for lists
7. When comparing products, highlight key differences clearly
8. If user mentions a budget (e.g., under ₹10,000 or under ₹50,000), respect it strictly in INR
9. Always consider the user's stated use case when recommending
10. Quote and reference prices in Indian Rupees (₹)

Here is the complete product catalog:

${getCatalogSummary()}

Remember: ALWAYS use [[PRODUCT:id]] format when mentioning catalog products so they can be displayed as interactive cards.`;

// ─── DuckDuckGo External Web Search ─────────────────────────────
async function searchExternalProducts(query) {
  if (!query || query.trim().length < 2) return [];
  const cleanQ = query.replace(/[^\w\s]/gi, ' ').trim();
  
  // Strategy 1: Try backend proxy (avoids CORS)
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQ)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    // Backend proxy unavailable (e.g. running directly or via another server)
  }

  // Strategy 2: Direct client-side JSONP or fallback search results
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    if (res.ok) {
      const data = await res.json();
      const results = [];
      if (data.Heading && data.AbstractText) {
        results.push({
          title: data.Heading,
          description: data.AbstractText,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(cleanQ)}`
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              description: topic.Text,
              url: topic.FirstURL
            });
          }
        }
      }
      if (results.length > 0) return results.slice(0, 4);
    }
  } catch (e) {
    // CORS or network error on direct fetch
  }

  // Fallback: Return curated direct shopping search links so the user can always redirect
  return [
    {
      title: `${query} on Amazon`,
      description: `Browse latest deals and customer reviews for "${query}" on Amazon India.`,
      url: `https://www.amazon.in/s?k=${encodeURIComponent(query)}`
    },
    {
      title: `${query} on Flipkart`,
      description: `Explore models, prices, discounts, and offers for "${query}" on Flipkart.`,
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`
    }
  ];
}

async function sendToGemini(userMessage) {
  if (!state.apiKey) {
    showApiKeyModal();
    throw new Error('Please enter your Gemini API key to chat with ShopAI.');
  }

  const contents = [];
  const recentMessages = state.messages.slice(-10);
  for (const msg of recentMessages) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const requestBody = {
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
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (candidate?.content?.parts?.[0]?.text) {
          return candidate.content.parts[0].text;
        }
      } else {
        const err = await response.json().catch(() => ({}));
        lastError = new Error(err.error?.message || `API error: ${response.status}`);
        
        // If the API key is unauthorized or invalid, open modal
        if (response.status === 400 && (err.error?.message?.includes('API_KEY') || err.error?.message?.includes('API key'))) {
          showApiKeyModal();
          throw lastError;
        }

        // If it's a model not found / deprecated error, continue to next model
        if (response.status === 404 || err.error?.message?.includes('not found') || err.error?.message?.includes('no longer available')) {
          continue;
        }
        throw lastError;
      }
    } catch (e) {
      lastError = e;
      if (model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Unable to connect to Gemini AI.');
}

// ─── Message Parsing ────────────────────────────────────────────
function parseAIResponse(text) {
  const productIds = [];
  const productRegex = /\[\[PRODUCT:(\d+)\]\]/g;
  let match;

  while ((match = productRegex.exec(text)) !== null) {
    const id = parseInt(match[1], 10);
    if (!productIds.includes(id) && getProductById(id)) {
      productIds.push(id);
    }
  }

  const cleanText = text.replace(/\[\[PRODUCT:\d+\]\]/g, '').trim();

  return {
    text: cleanText,
    html: formatMarkdown(cleanText),
    productIds,
  };
}

function formatMarkdown(text) {
  text = escapeHtml(text);

  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  const paragraphs = text.split(/\n\n+/);
  text = paragraphs.map(p => {
    if (p.includes('\n- ') || p.startsWith('- ') || p.includes('\n• ') || p.startsWith('• ')) {
      p = p.replace(/^[-•]\s+(.+)/gm, '<li>$1</li>');
      return p.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return text;
}

// ─── UI Rendering ───────────────────────────────────────────────
function renderWelcome() {
  const suggestions = [
    { emoji: '💻', text: 'Find me a laptop under ₹60,000' },
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

function renderChatExternalCard(ext) {
  return `
    <div class="chat-external-card">
      <span class="chat-external-badge">🌐 Web Product</span>
      <div class="chat-external-body">
        <div class="chat-external-title">${escapeHtml(ext.title)}</div>
        <div class="chat-external-desc">${escapeHtml(ext.description)}</div>
        <a href="${escapeHtml(ext.url)}" target="_blank" rel="noopener noreferrer" class="chat-external-link">
          View Product ↗
        </a>
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

  let externalCardsHtml = '';
  if (msg.externalProducts && msg.externalProducts.length > 0) {
    externalCardsHtml = `
      <div class="chat-external-section">
        <div class="chat-external-header">🌐 Recommended from the Web</div>
        <div class="chat-product-cards">
          ${msg.externalProducts.map(ext => renderChatExternalCard(ext)).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="message ${isUser ? 'user' : 'assistant'}">
      <div class="message-avatar">${avatarEmoji}</div>
      <div class="message-content">
        <div class="message-bubble">${msg.html || msg.text}</div>
        ${productCardsHtml}
        ${externalCardsHtml}
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
          <span class="chat-card-price">${formatINR(product.price)}</span>
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
    // Call Gemini API and DuckDuckGo web search in parallel
    const [response, externalProducts] = await Promise.all([
      sendToGemini(text.trim()),
      searchExternalProducts(text.trim())
    ]);

    const parsed = parseAIResponse(response);

    // Remove typing indicator
    document.getElementById('typing-indicator')?.remove();

    // Add AI message with catalog products AND external web recommendations
    const aiMsg = {
      role: 'assistant',
      text: response,
      html: parsed.html,
      productIds: parsed.productIds,
      externalProducts: externalProducts || []
    };
    state.messages.push(aiMsg);
    chatMessages.insertAdjacentHTML('beforeend', renderMessage(aiMsg));

  } catch (error) {
    document.getElementById('typing-indicator')?.remove();

    const errorMsg = {
      role: 'assistant',
      text: error.message,
      html: `<p>⚠️ ${escapeHtml(error.message)}</p>`,
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
            <span class="product-card-price">${formatINR(p.price)}</span>
            ${discount > 0 ? `
              <span class="product-card-original-price">${formatINR(p.originalPrice)}</span>
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
          <div class="cart-item-price">${formatINR(p.price * item.qty)}</div>
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
  const shipping = subtotal > 2000 ? 0 : 199;
  const tax = subtotal * 0.18; // 18% GST standard in India
  const total = subtotal + shipping + tax;

  document.getElementById('cart-summary').innerHTML = `
    <div class="cart-summary-row">
      <span>Subtotal (${getCartCount()} items)</span>
      <span>${formatINR(subtotal)}</span>
    </div>
    <div class="cart-summary-row">
      <span>Shipping (Free over ₹2,000)</span>
      <span>${shipping === 0 ? '<strong style="color: #10b981;">FREE</strong>' : formatINR(shipping)}</span>
    </div>
    <div class="cart-summary-row">
      <span>Estimated GST (18%)</span>
      <span>${formatINR(tax)}</span>
    </div>
    <div class="cart-summary-row total">
      <span>Total</span>
      <span>${formatINR(total)}</span>
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
  showToast('🔑 API key updated successfully!');
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

  // Pre-fill API key input with active key, or auto-show modal if missing
  if (state.apiKey) {
    document.getElementById('api-key-input').value = state.apiKey;
  } else {
    // Automatically prompt user to enter key if none is loaded from .env or localStorage
    setTimeout(() => {
      showApiKeyModal();
    }, 400);
  }
}

// ─── Initialize ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
