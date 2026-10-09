<script setup>
import { computed, ref } from 'vue'

const categories = ['All markets', 'Trending', 'Crypto', 'Culture', 'Sports']
const activeCategory = ref('All markets')
const query = ref('')
const connected = ref(false)
const walletOpen = ref(false)
const walletAddress = ref(import.meta.env.VITE_SOLANA_WALLET_ADDRESS || '')
const selectedMarket = ref(null)
const selectedSide = ref('YES')
const stake = ref(0.05)
const toast = ref('')
let toastTimer = 0

const programAddress = import.meta.env.VITE_SOLANA_PROGRAM_ID || 'PROGRAM_ID_PENDING'
const programDeployed = computed(() => programAddress !== 'PROGRAM_ID_PENDING')
const programExplorerUrl = computed(() => import.meta.env.VITE_SOLANA_EXPLORER_URL || (programDeployed.value
  ? `https://explorer.solana.com/address/${programAddress}?cluster=testnet`
  : 'https://explorer.solana.com/?cluster=testnet'))

const shortProgram = computed(() => (programDeployed.value
  ? `${programAddress.slice(0, 4)}...${programAddress.slice(-4)}`
  : 'pending'))

const walletLabel = computed(() => {
  if (!connected.value) return 'Connect wallet'
  if (!walletAddress.value) return 'Wallet connected'
  return `${walletAddress.value.slice(0, 6)}...${walletAddress.value.slice(-4)}`
})

const markets = [
  { id: 1, tag: 'CRYPTO-01', category: 'Crypto', question: 'Will BTC close July above $100k?', closes: 'Closes Jul 01, 2025', closesIn: 'closes in 3d', yes: 68, volume: '$482,910', move: 8.2, hot: true },
  { id: 2, tag: 'CULTURE-02', category: 'Culture', question: 'Will the next big game ship this summer?', closes: 'Closes Aug 31, 2025', closesIn: 'closes in 64d', yes: 43, volume: '$139,420', move: -2.4, hot: false },
  { id: 3, tag: 'CRYPTO-03', category: 'Crypto', question: 'Does SOL flip BTC on daily fees?', closes: 'Closes Jun 30, 2025', closesIn: 'closes in 2d', yes: 21, volume: '$98,260', move: 4.7, hot: true },
  { id: 4, tag: 'SPORTS-04', category: 'Sports', question: 'Will the home team take the crown?', closes: 'Closes Jun 18, 2025', closesIn: 'closes in 11d', yes: 57, volume: '$311,850', move: 1.3, hot: false },
  { id: 5, tag: 'CULTURE-05', category: 'Culture', question: 'Does a pixel classic get a remake?', closes: 'Closes Sep 12, 2025', closesIn: 'closes in 76d', yes: 76, volume: '$76,103', move: 10.1, hot: true },
  { id: 6, tag: 'CRYPTO-06', category: 'Crypto', question: 'Solana daily active addresses over 5M?', closes: 'Closes Dec 31, 2025', closesIn: 'closes in 186d', yes: 34, volume: '$205,600', move: -0.8, hot: false },
]

const boardStats = computed(() => {
  const total = markets.reduce((sum, market) => sum + Number(market.volume.replace(/[$,]/g, '')), 0)
  return [
    { label: 'Markets on the board', value: String(128) },
    { label: '24h volume', value: `$${(total / 1_000_000).toFixed(1)}M` },
    { label: 'Average fee', value: '0.2%' },
  ]
})

const filteredMarkets = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  return markets.filter((market) => {
    const matchesCategory = activeCategory.value === 'All markets'
      || (activeCategory.value === 'Trending' ? market.hot : market.category === activeCategory.value)
    const matchesQuery = !normalized
      || `${market.question} ${market.closes} ${market.tag}`.toLowerCase().includes(normalized)
    return matchesCategory && matchesQuery
  })
})

const yesPrice = computed(() => (selectedMarket.value ? selectedMarket.value.yes : 50))
const activeProbability = computed(() => (selectedSide.value === 'YES' ? yesPrice.value : 100 - yesPrice.value))
const payout = computed(() => {
  const probability = Math.max(activeProbability.value, 1)
  return ((Number(stake.value || 0) / probability) * 100).toFixed(2)
})
const potentialReturn = computed(() => {
  const gain = Number(payout.value) - Number(stake.value || 0)
  return `${gain >= 0 ? '+' : ''}${gain.toFixed(2)} SOL`
})

function flash(message, duration = 3200) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, duration)
}

function openTrade(market, side = 'YES') {
  selectedMarket.value = market
  selectedSide.value = side
  stake.value = 0.05
}

function closeTrade() {
  selectedMarket.value = null
}

function closeOverlays() {
  if (walletOpen.value) {
    walletOpen.value = false
    return
  }
  closeTrade()
}

function connectWallet() {
  connected.value = true
  walletOpen.value = false
  flash(`Test wallet attached to the pit // ${walletLabel.value}`)
}

function confirmTrade() {
  if (!connected.value) {
    walletOpen.value = true
    return
  }
  flash(`${selectedSide.value} call entered on ${selectedMarket.value.tag} // ${Number(stake.value).toFixed(2)} SOL`)
  closeTrade()
}
</script>

<template>
  <div class="pit" @keydown.esc="closeOverlays">
    <div class="pit-field" aria-hidden="true"></div>

    <header class="topbar">
      <a class="brand" href="#top" aria-label="Oracle Pit home">
        <span class="brand-mark">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <rect width="64" height="64" rx="9" fill="var(--mark-ground)" />
            <circle cx="32" cy="32" r="22" fill="none" stroke="var(--amber)" stroke-width="9"
                    stroke-dasharray="131.3 7" stroke-dashoffset="15.9" />
            <circle cx="32" cy="32" r="5.9" fill="var(--amber)" />
          </svg>
        </span>
        <span class="brand-word">ORACLE<em>PIT</em></span>
      </a>

      <nav class="nav" aria-label="Primary">
        <a class="active" href="#board">Board</a>
        <a href="#how">How it works</a>
        <a href="#record">Your record</a>
      </nav>

      <div class="top-actions">
        <button class="wallet-button" type="button" @click="walletOpen = true">
          <svg class="wallet-icon" viewBox="0 0 20 16" aria-hidden="true" focusable="false">
            <path d="M2 2.5h16v11H2z" />
            <path d="M13 7h5v4h-5z" />
          </svg>
          {{ walletLabel }}
        </button>
      </div>
    </header>

    <main id="top">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="pulse"></span>
            {{ programDeployed ? 'Live on Solana' : 'Solana preview' }}
          </p>
          <h1 id="hero-title">
            <span class="h1-line">ASK THE PIT.</span>
            <span class="h1-line accent">TAKE THE SIDE.</span>
          </h1>
          <p class="hero-lede">
            Every question on the board carries a price. Read what the crowd believes, put your
            own read against it, and take a YES or NO side that stays on the record. No crystal
            ball, no house favourite &mdash; just the pit, counted in the open.
          </p>
          <div class="hero-actions">
            <a class="button button--primary" href="#board">Open the board <span aria-hidden="true">&#8594;</span></a>
            <a class="button button--ghost" href="#how">How the pit works <span aria-hidden="true">&#8594;</span></a>
          </div>
          <dl class="hero-facts">
            <div><dt>Chain</dt><dd>Solana</dd></div>
            <div><dt>Settlement</dt><dd>On-chain, automatic</dd></div>
            <div><dt>Preview mode</dt><dd>No real value</dd></div>
          </dl>
        </div>

        <aside class="console" aria-label="Live board readout">
          <p class="console-bar">
            <span>Oracle Pit // market desk</span>
            <span class="console-live"><i></i> streaming</span>
          </p>
          <dl class="console-rows">
            <div v-for="stat in boardStats" :key="stat.label">
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
            </div>
          </dl>
          <div class="console-spark" aria-hidden="true">
            <span v-for="bar in 16" :key="bar" :style="{ height: `${18 + ((bar * 37) % 74)}%` }"></span>
          </div>
          <p class="console-foot"><span>PIT-01</span><span>Demo board data</span></p>
        </aside>
      </section>

      <section id="board" class="board" aria-labelledby="board-title">
        <header class="board-head">
          <div>
            <p class="kicker">// the board</p>
            <h2 id="board-title">OPEN QUESTIONS</h2>
          </div>
          <p class="board-count"><span class="dot"></span>128 markets on the board</p>
        </header>

        <div class="board-controls">
          <div class="tabs" role="tablist" aria-label="Market categories">
            <button v-for="category in categories" :key="category" type="button" role="tab"
                    :aria-selected="activeCategory === category" :class="{ selected: activeCategory === category }"
                    @click="activeCategory = category">{{ category }}</button>
          </div>
          <label class="search">
            <span class="search-icon" aria-hidden="true"></span>
            <input v-model="query" type="search" placeholder="Search the board" aria-label="Search the board" />
          </label>
        </div>

        <div class="board-table">
          <div class="board-row board-row--head">
            <span>Market</span><span>Crowd read</span><span>24h move</span><span>Volume</span><span>Take a side</span>
          </div>

          <article v-for="market in filteredMarkets" :key="market.id" class="board-row">
            <div class="market">
              <span :class="['market-badge', `market-badge--${market.category.toLowerCase()}`]" aria-hidden="true">{{ market.tag.split('-')[1] }}</span>
              <div class="market-text">
                <h3>{{ market.question }}</h3>
                <p>{{ market.tag }} <span aria-hidden="true">//</span> {{ market.closes }} <em v-if="market.hot">hot</em></p>
              </div>
            </div>

            <div class="read">
              <div class="read-top">
                <strong>{{ market.yes }}%</strong>
                <span>yes</span>
              </div>
              <div class="read-bar" role="img" :aria-label="`${market.yes}% YES, ${100 - market.yes}% NO`">
                <span class="read-yes" :style="{ width: `${market.yes}%` }"></span>
              </div>
              <p class="read-split">{{ market.yes }} / {{ 100 - market.yes }}</p>
            </div>

            <div :class="['move', market.move < 0 ? 'move--down' : 'move--up']">
              {{ market.move > 0 ? '+' : '' }}{{ market.move.toFixed(1) }}%
            </div>
            <div class="volume">{{ market.volume }}</div>

            <div class="row-actions">
              <button class="side side--yes" type="button" @click="openTrade(market, 'YES')">
                yes <b>{{ market.yes }}%</b>
              </button>
              <button class="side side--no" type="button" @click="openTrade(market, 'NO')">
                no <b>{{ 100 - market.yes }}%</b>
              </button>
            </div>
          </article>

          <p v-if="!filteredMarkets.length" class="board-empty">
            Nothing on the board matches that. Clear the search or pick another category.
          </p>
        </div>
      </section>

      <section id="how" class="how" aria-labelledby="how-title">
        <p class="kicker">// three moves</p>
        <h2 id="how-title">HOW YOU TAKE A SIDE</h2>
        <div class="steps">
          <div>
            <b>01</b>
            <h3>Read the price</h3>
            <p>Every question on the board carries a crowd probability. That number is the pit's current read, not a promise.</p>
          </div>
          <div>
            <b>02</b>
            <h3>Take a side</h3>
            <p>Back YES or NO with SOL. Both sides sit in the same pool, on the same rules.</p>
          </div>
          <div>
            <b>03</b>
            <h3>Stay on record</h3>
            <p>Your call is written on-chain the moment you enter it. When the question resolves, the pool settles itself.</p>
          </div>
        </div>
      </section>

      <section id="record" class="record" aria-labelledby="record-title">
        <div class="record-title">
          <span class="record-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" focusable="false">
              <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="9"
                      stroke-dasharray="131.3 7" stroke-dashoffset="15.9" />
              <circle cx="32" cy="32" r="5.9" fill="currentColor" />
            </svg>
          </span>
          <div>
            <p class="kicker">// your record</p>
            <h2 id="record-title">ON THE RECORD</h2>
          </div>
        </div>
        <div class="record-stat">
          <span>Available balance</span>
          <strong>{{ connected ? '1,240.00 SOL' : '---' }}</strong>
        </div>
        <div class="record-stat">
          <span>Open positions</span>
          <strong>{{ connected ? '03' : '00' }}</strong>
        </div>
        <button class="button button--ghost" type="button" @click="walletOpen = true">
          {{ connected ? 'Open your record' : 'Connect to see your record' }}
        </button>
      </section>
    </main>

    <footer class="footer">
      <span class="footer-brand">ORACLE PIT <em>/ 2026</em></span>
      <span>Ask the pit. Take the side.</span>
      <span>
        Built on
        <a :href="programExplorerUrl" target="_blank" rel="noreferrer">SOLANA</a>
        // {{ shortProgram }}
      </span>
    </footer>

    <div v-if="selectedMarket" class="overlay" @click.self="closeTrade">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="trade-title">
        <button class="dialog-close" type="button" aria-label="Close" @click="closeTrade">
          <span aria-hidden="true">&#215;</span>
        </button>
        <p class="kicker">// {{ selectedMarket.tag }} &middot; {{ selectedMarket.closesIn }}</p>
        <h2 id="trade-title">{{ selectedMarket.question }}</h2>
        <p class="dialog-sub">{{ selectedMarket.closes }} &middot; settled on-chain</p>

        <div class="sides" role="group" aria-label="Choose a side">
          <button type="button" :class="{ active: selectedSide === 'YES' }" @click="selectedSide = 'YES'">
            <span>YES</span><b>{{ selectedMarket.yes }}%</b>
          </button>
          <button type="button" :class="{ active: selectedSide === 'NO' }" @click="selectedSide = 'NO'">
            <span>NO</span><b>{{ 100 - selectedMarket.yes }}%</b>
          </button>
        </div>

        <label class="amount">
          <span>Stake</span>
          <span class="amount-unit">SOL</span>
          <input v-model="stake" type="number" min="0.01" step="0.01" inputmode="decimal" />
        </label>

        <dl class="quote">
          <div><dt>Side price</dt><dd>{{ activeProbability }}%</dd></div>
          <div><dt>Payout if right</dt><dd class="quote-strong">{{ payout }} SOL</dd></div>
          <div><dt>Return on stake</dt><dd>{{ potentialReturn }}</dd></div>
        </dl>

        <button class="button button--primary button--block" type="button" @click="confirmTrade">
          {{ connected ? `Enter ${selectedSide} call` : 'Connect wallet to enter' }} <span aria-hidden="true">&#8594;</span>
        </button>
        <p class="dialog-note">Nothing here carries real value, and the pit does not promise an outcome.</p>
      </section>
    </div>

    <div v-if="walletOpen" class="overlay" @click.self="walletOpen = false">
      <section class="dialog dialog--narrow" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
        <button class="dialog-close" type="button" aria-label="Close" @click="walletOpen = false">
          <span aria-hidden="true">&#215;</span>
        </button>
        <span class="dialog-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="9"
                    stroke-dasharray="131.3 7" stroke-dashoffset="15.9" />
            <circle cx="32" cy="32" r="5.9" fill="currentColor" />
          </svg>
        </span>
        <p class="kicker">// solana</p>
        <h2 id="wallet-title">STEP INTO THE PIT</h2>
        <p class="dialog-sub">
          Attach a Solana wallet such as Phantom to read the board and place calls.
          This preview does not move real funds.
        </p>
        <button class="button button--primary button--block" type="button" @click="connectWallet">
          Connect wallet <span aria-hidden="true">&#8594;</span>
        </button>
        <p class="dialog-note">By connecting you accept the Oracle Pit terms of use.</p>
      </section>
    </div>

    <transition name="toast">
      <p v-if="toast" class="toast" role="status" aria-live="polite">{{ toast }}</p>
    </transition>
  </div>
</template>
