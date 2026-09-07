# ShopAI — AI Shopping Assistant 🛍️

A sleek, modern, and intelligent AI-powered shopping assistant built with Vanilla JavaScript, HTML5, CSS3, Google's Gemini API, and DuckDuckGo Web Search. ShopAI delivers conversational product discovery, smart recommendations from both its internal catalog and the live web, product comparisons, and an interactive shopping cart with pricing in Indian Rupees (INR / ₹).

---

## ✨ Features

- **🤖 Conversational Gemini AI Assistant**:
  - Automatic model fallback sequence (`gemini-2.5-flash` ➔ `gemini-1.5-flash` ➔ `gemini-1.5-pro`).
  - Context-aware recommendations respecting budget constraints, specifications, and comparisons.
  - Automatically embeds interactive product cards inside conversation bubbles.
  - Interactive API Key settings modal with auto-prompt when a key is missing.

- **🌐 Live Web Search Capability (DuckDuckGo)**:
  - When users search for items, ShopAI queries both the curated catalog and the live web simultaneously.
  - Displays external web recommendations with direct **"View Product ↗"** redirect links alongside internal catalog items.
  - Built-in proxy to prevent browser CORS restrictions.

- **🇮🇳 Indian Rupee (INR / ₹) Pricing & Cart**:
  - Entire 50-product catalog priced realistically in INR.
  - Formatted currency (`₹1,69,900`, `₹29,990`, etc.).
  - Slide-out cart drawer with quantity adjustments (`+` / `−`), removal, 18% GST calculation, and free shipping thresholds (> ₹2,000).
  - Cart state persisted in `localStorage`.

- **🏪 Curated Product Catalog**:
  - 50 curated items across 5 categories:
    - 💻 **Electronics** (Laptops, Phones, Smartwatches, Cameras, Audio)
    - 👗 **Fashion** (Sneakers, Jackets, Sunglasses, Bags)
    - 🏠 **Home & Kitchen** (Coffee makers, Robot vacuums, Cookware, Mixers)
    - ⚽ **Sports & Outdoors** (Running shoes, Fitness trackers, Yoga mats, Camping gear)
    - ✨ **Beauty & Care** (Hair stylers, Luxury skincare, Fragrances)
  - Real-time search and filter tabs.

- **🎨 Modern Dark Glassmorphic UI**:
  - Obsidian theme with cyber cyan & violet gradients.
  - Fully responsive on desktop, tablet, and mobile screens.

---

## 📁 Project Structure

```
├── index.html        # Main HTML structure, layout, modals, and templates
├── styles.css        # Design tokens, dark mode theme, glassmorphism, responsive styles
├── products.js       # Curated 50-item product catalog and search helpers
├── app.js            # Frontend logic, Gemini API connection, DuckDuckGo search, cart
├── server.js         # Node/Express server for static hosting, .env injection & search proxy
├── package.json      # Project dependencies and start scripts
├── .env              # Environment variables (GEMINI_API_KEY, PORT) [Ignored in Git]
├── .gitignore        # Ignores .env and node_modules
└── README.md         # Documentation and deployment guide
```

---

## 🚀 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create or edit your `.env` file in the project root:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

> **Note:** Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com).

### 3. Run the Server
```bash
npm start
# or: node server.js
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.

---

## 🌐 Step-by-Step Deployment Guide

You can deploy ShopAI to free hosting platforms like **Render**, **Railway**, or **Vercel**.

### Option A: Deploy on Render (Recommended for Node.js)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```
   *(Ensure `.env` is listed in `.gitignore` so your API key is never committed to GitHub).*

2. **Create a Web Service on Render**:
   - Go to [render.com](https://render.com) and sign in.
   - Click **New +** ➔ **Web Service**.
   - Connect your GitHub repository (`AI-Chatbot`).

3. **Configure Settings**:
   - **Name**: `shopai` (or your chosen name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`

4. **Add Environment Variables**:
   - Scroll down to **Environment Variables**.
   - Key: `GEMINI_API_KEY` | Value: *Your Gemini API Key*
   - (Render automatically supplies the `PORT` variable).

5. **Deploy**:
   - Click **Create Web Service**.
   - Render will build and deploy your app, providing a live URL like `https://shopai-xxxx.onrender.com`.

---

### Option B: Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** ➔ **Deploy from GitHub repo**.
3. Select your repository.
4. Go to the project **Variables** tab and add:
   - `GEMINI_API_KEY`: *Your Gemini API Key*
5. Railway will automatically detect `package.json`, install dependencies, run `node server.js`, and generate a public domain for you under **Settings** ➔ **Generate Domain**.

---

### Option C: Deploy as a Static Site (Vercel / Netlify / GitHub Pages)

If you prefer deploying pure client-side static files:
1. Deploy `index.html`, `styles.css`, `app.js`, and `products.js` to Vercel, Netlify, or GitHub Pages.
2. When users first open the app, ShopAI will automatically prompt for their Gemini API key via the built-in ⚙️ modal and securely store it in their browser's `localStorage`.

---

## 💬 Example Prompts to Try

- *"Find me a gaming mechanical keyboard"* *(Triggers catalog + live web search with links)*
- *"Find me a lightweight laptop under ₹60,000"*
- *"Compare MacBook Pro 14 and Dell XPS"*
- *"What are good gift ideas for fitness lovers?"*
- *"Show me top-rated espresso makers"*
