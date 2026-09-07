# Project Report & Guide Documentation: ShopAI 🛍️
**Smart AI-Powered Conversational Shopping Assistant**

---

## 1. Executive Summary & Objective

**ShopAI** is an intelligent, full-stack web-based conversational shopping assistant designed to transform the traditional e-commerce browsing experience into an interactive, dialogue-driven consultation. 

### The Problem
Traditional e-commerce platforms force users to manually filter through complex category trees, sort attributes, and compare dozens of search results tabs. Users often struggle to find recommendations tailored to nuanced preferences (e.g., *"Find a lightweight laptop under ₹60,000 suitable for computer science students"*).

### The Solution
ShopAI combines:
1. **Large Language Model intelligence (Google Gemini)** for contextual understanding, dialogue memory, and reasoning.
2. **Curated In-House Catalog** for immediate, high-fidelity checkout integration and rich product card interaction.
3. **Live Web Search Capability (DuckDuckGo)** to discover and recommend real-world external products beyond the static catalog, complete with outbound store redirect links.
4. **Indian Rupee (INR / ₹) Financial Localization** including realistic product pricing, 18% GST calculation, and free delivery thresholds.

---

## 2. System Architecture & High-Level Design

```
+------------------------------------------------------------------------------------+
|                                CLIENT BROWSER                                      |
|                                                                                    |
|  +-------------------------------------------------------------------------------+ |
|  |                             Presentation Layer                                | |
|  |   - Glassmorphic UI / Midnight Obsidian Theme (styles.css)                    | |
|  |   - Interactive Chat Area & Welcome Chips (index.html, app.js)                | |
|  |   - Browse Products Panel (50 curated items across 5 categories)             | |
|  |   - Dynamic Slide-Out Shopping Cart Drawer (GST & Free Shipping Logic)        | |
|  +-------------------------------------------------------------------------------+ |
|                                       │                                            |
|                                       ▼                                            |
|  +-------------------------------------------------------------------------------+ |
|  |                             Application Logic                                 | |
|  |   - State Management (LocalStorage + Runtime Memory)                          | |
|  |   - In-memory Catalog Indexer & Regex Card Tag Parser ([[PRODUCT:id]])        | |
|  |   - Asynchronous Parallel Query Dispatcher (Gemini + Web Search)              | |
|  +-------------------------------------------------------------------------------+ |
+-----------------------┬───────────────────────────────────────┬--------------------+
                        │                                       │
                        ▼ (Direct client / Secure server)       ▼ (CORS Proxy / Fallback)
+───────────────────────────────────────+       +───────────────────────────────────+
|         Google Gemini API             |       |        ShopAI Node.js Server      |
|  - gemini-2.5-flash (Primary)         |       |   (Express + DotEnv + Deployment) |
|  - gemini-1.5-flash (Fallback 1)      |       |                                   |
|  - gemini-1.5-pro (Fallback 2)        |       |  • Serves static bundle           |
|  - System Instruction Prompting       |       |  • Injects server-side API Key    |
|  - Conversation History Tracking      |       |  • /api/search DuckDuckGo Proxy   |
+───────────────────────────────────────+       +─────────────────┬─────────────────+
                                                                  │
                                                                  ▼
                                                +───────────────────────────────────+
                                                |     DuckDuckGo Instant Answer     |
                                                |  - Real-world external items      |
                                                |  - Direct redirect links          |
                                                +───────────────────────────────────+
```

---

## 3. Key Technical Modules & Implementation Details

### 3.1. Dual Recommendation Engine (Catalog + Web Search)
A standout feature of ShopAI is its **Parallel Hybrid Search Engine**:
* When a user submits a shopping query (e.g., *"Show me ergonomic chairs for back pain"*), `sendMessage()` initiates two parallel requests via `Promise.all`:
  1. **Google Gemini LLM**: Evaluates the curated local catalog using a custom system instruction prompt and references matching products with `[[PRODUCT:id]]`.
  2. **DuckDuckGo Search Engine**: Fetches relevant external products and accessories from the live web.
* **Result Rendering**:
  * Catalog items are transformed into rich cards with badges, prices, ratings, and one-click "+ Add to Cart" buttons.
  * External items appear in a distinct **"🌐 Recommended from the Web"** container with description snippets and **"View Product ↗"** redirect links.

### 3.2. Resilient LLM Fallback Mechanism
To ensure zero service disruption, the system implements multi-tier model fallbacks:
1. `gemini-2.5-flash` — High-speed, next-generation reasoning.
2. `gemini-1.5-flash` — High-throughput production model.
3. `gemini-1.5-pro` — High-capacity fallback model.
If an API quota or model status issue arises, the application gracefully rolls over to the next available model without crashing.

### 3.3. Key Security & Secret Protection Architecture
* **Zero Hardcoded Secrets in Git**: No API keys exist anywhere in git commits.
* **Server-side Injection**: When running via `server.js`, the API key is retrieved from `.env` on the host machine and injected into the client dynamically on initial load.
* **Smart UI Fallback Modal**: If accessed statically (or if the server has no `.env`), the client checks `state.apiKey`. If empty or `null`, it displays an interactive **Connect to Gemini AI (⚙️)** modal. Once entered, the key is securely retained in the browser's `localStorage`.

### 3.4. Complete Product Catalog & Currency Localization
* **50 Products across 5 Segments**: Electronics, Fashion, Home & Kitchen, Sports & Outdoors, and Beauty & Care.
* **Currency**: Standardized on Indian Rupees (`₹` / INR).
* **Tax & Shipping Engine**:
  * Standard 18% GST calculated automatically on subtotals.
  * Tiered shipping rule: Orders > ₹2,000 qualify for **FREE Delivery**; otherwise, a flat ₹199 delivery fee is applied.

---

## 4. Technology Stack & Rationale

| Layer | Technology | Justification |
|---|---|---|
| **Frontend Structure** | HTML5 (Semantic) | Fast load times, SEO-optimized markup, accessibility compliant. |
| **Frontend Styling** | Vanilla CSS3 | Custom design system with glassmorphism, responsive CSS grid/flexbox, zero heavy framework overhead. |
| **Frontend Logic** | Vanilla JavaScript (ES6+) | No bundle compile step required; lightweight, high performance, native `fetch` and DOM APIs. |
| **AI / Machine Learning** | Google Gemini Generative Language API | State-of-the-art reasoning, structured token streaming, and cost-effective latency. |
| **External Search** | DuckDuckGo Instant Answer API | Free, keyless web search integration for product discovery outside local inventory. |
| **Backend & Proxy** | Node.js + Express | Lightweight static hosting, secret injection, and server-side CORS proxy. |
| **Hosting & Deployment** | Render | Production cloud web service with automatic GitHub CI/CD tracking `main`. |

---

## 5. Demonstration & Evaluation Guide

When presenting this project to a guide, committee, or evaluator, follow this structured demo script:

### Step 1: Interface Overview
* Point out the **responsive two-column layout**: conversational chat panel on the left/center, curated live product showcase on the right.
* Demonstrate the **Category Filters** (Electronics, Fashion, Home, Sports, Beauty) and real-time text search.

### Step 2: Conversational Shopping & Catalog Cards
* Type: *"I have a budget of ₹70,000. Recommend a good laptop and headphones."*
* **What to observe**: The AI parses the budget in INR, selects matching items from the catalog, and generates interactive cards directly inside the conversation bubble.
* Click "+ Add to Cart" on the cards; note the cart badge incrementing in real time.

### Step 3: Live Web Product Search Integration
* Type: *"Recommend mechanical gaming keyboards."*
* **What to observe**: The local catalog might not have this specific niche, but the **DuckDuckGo integration** retrieves external web recommendations with direct **"View Product ↗"** links.

### Step 4: Shopping Cart & Financial Summary
* Open the Cart drawer (🛒 icon).
* Demonstrate quantity adjustment (`+` / `−`), automatic 18% GST recalculation, and free shipping logic (orders over ₹2,000).

### Step 5: Live Cloud Deployment
* Share the live production deployment URL: **[https://shopai-ovlc.onrender.com](https://shopai-ovlc.onrender.com/)**
* Highlight that the build pipeline is fully continuous, pulling directly from GitHub.

---

## 6. Future Enhancements
1. **User Authentication & Persistent Profiles**: Storing user preferences and previous orders in a database (e.g., PostgreSQL or MongoDB).
2. **Direct Payment Gateway Integration**: Razorpay or Stripe integration for actual UPI / Card transactions.
3. **Multi-lingual Voice Interface**: Speech-to-text input supporting Hindi, English, and regional Indian languages.
