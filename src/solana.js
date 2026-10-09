/**
 * Neonline wallet layer.
 *
 * Talks to the Solana wallet the visitor actually has installed, through the
 * provider API the wallet injects into the page. No simulated wallet and no
 * mock session: the public key, the balance and every signature below come
 * from the real wallet and the real cluster.
 *
 *   - connect()      asks the provider for an account (real approval prompt)
 *   - balance()      reads lamports from the cluster RPC over JSON-RPC
 *   - signMemo()     builds, signs and broadcasts a real memo transaction
 *
 * Supported providers: Phantom, Solflare, Backpack, Glow, Brave, and any other
 * wallet that exposes the standard `solana` provider interface.
 */

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const LAMPORTS_PER_SOL = 1_000_000_000n
const SESSION_KEY = 'neonline.session.v1'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** Providers we look for, in the order we offer them. */
const CATALOG = [
  {
    id: 'phantom',
    name: 'Phantom',
    install: 'https://phantom.app/download',
    detect: () => [window.phantom?.solana, window.solana?.isPhantom ? window.solana : null],
  },
  {
    id: 'solflare',
    name: 'Solflare',
    install: 'https://solflare.com/download',
    detect: () => [window.solflare, window.solana?.isSolflare ? window.solana : null],
  },
  {
    id: 'backpack',
    name: 'Backpack',
    install: 'https://backpack.app/download',
    detect: () => [window.backpack, window.solana?.isBackpack ? window.solana : null],
  },
  {
    id: 'glow',
    name: 'Glow',
    install: 'https://glow.app/download',
    detect: () => [window.glow, window.solana?.isGlow ? window.solana : null],
  },
  {
    id: 'brave',
    name: 'Brave Wallet',
    install: 'https://brave.com/wallet/',
    detect: () => [window.braveSolana, window.solana?.isBraveWallet ? window.solana : null],
  },
]

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(text) {
  let value = 0n
  for (const char of text) {
    const digit = BASE58.indexOf(char)
    if (digit < 0) throw new Error('Address is not valid base58.')
    value = value * 58n + BigInt(digit)
  }
  const bytes = []
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn))
    value >>= 8n
  }
  for (const char of text) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

function base58Encode(bytes) {
  let value = 0n
  for (const byte of bytes) value = value * 256n + BigInt(byte)
  let out = ''
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    out = '1' + out
  }
  return out
}

function readPublicKey(provider) {
  const raw = provider?.publicKey
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw.toBase58 === 'function') return raw.toBase58()
  if (typeof raw.toString === 'function') return raw.toString()
  return ''
}

/** Human wording for the errors wallets actually raise. */
export function describeError(error) {
  if (!error) return 'The wallet returned no detail.'
  const code = error.code ?? error.error?.code
  const text = String(error.message || error.error?.message || error)
  if (code === 4001 || /user rejected|user denied|rejected the request|declined/i.test(text)) {
    return 'You declined the request in your wallet.'
  }
  if (/not connected|disconnected|wallet must be connected/i.test(text)) {
    return 'The wallet is not connected right now.'
  }
  if (/locked/i.test(text)) return 'Your wallet is locked. Unlock it and try again.'
  if (/insufficient (lamports|funds)|0x1\b/i.test(text)) {
    return 'This account does not have enough SOL to cover the amount plus the fee.'
  }
  if (/blockhash/i.test(text)) return 'The network moved on before the transaction was signed. Try once more.'
  if (/base58|invalid character/i.test(text)) return `The wallet returned an address this app cannot decode: ${text}`.slice(0, 180)
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return 'The Solana RPC endpoint did not answer. Check the connection and retry.'
  }
  return text.slice(0, 180)
}

export function createWallet(config = {}) {
  const cluster = config.cluster || 'testnet'
  const rpcUrl = config.rpcUrl || `https://api.${cluster}.solana.com`
  const programId = config.programId || ''

  const state = {
    phase: 'idle', // idle | connecting | connected | error
    providerId: '',
    providerName: '',
    address: '',
    error: '',
    balance: null, // lamports as bigint
    balanceAt: 0,
    balanceError: '',
  }

  const listeners = new Set()
  const bump = () => listeners.forEach((fn) => fn({ ...state }))
  const patch = (next) => Object.assign(state, next)

  let provider = null
  let rpcId = 0
  let unsubscribe = []

  function catalog() {
    return CATALOG.map((entry) => {
      const found = entry.detect().find((candidate) => candidate && typeof candidate.connect === 'function')
      return { id: entry.id, name: entry.name, install: entry.install, available: Boolean(found) }
    })
  }

  function providerFor(id) {
    const entry = CATALOG.find((item) => item.id === id)
    if (!entry) return null
    return entry.detect().find((candidate) => candidate && typeof candidate.connect === 'function') || null
  }

  function bind(target) {
    unbind()
    provider = target
    if (typeof provider.on !== 'function') return
    const onAccount = (key) => {
      const address = key ? readPublicKey({ publicKey: key }) : readPublicKey(provider)
      if (!address) {
        disconnect(true)
        return
      }
      patch({ address, phase: 'connected', error: '' })
      saveSession()
      refreshBalance()
      bump()
    }
    const onDisconnect = () => disconnect(true)
    provider.on('accountChanged', onAccount)
    provider.on('disconnect', onDisconnect)
    unsubscribe = [
      () => provider.off?.('accountChanged', onAccount),
      () => provider.off?.('disconnect', onDisconnect),
    ]
  }

  function unbind() {
    unsubscribe.forEach((fn) => {
      try {
        fn()
      } catch {
        /* the provider already tore the listener down */
      }
    })
    unsubscribe = []
  }

  function saveSession() {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          wallet: state.providerId,
          address: state.address,
          cluster,
          at: Date.now(),
        }),
      )
    } catch {
      /* storage can be unavailable in private mode; the session is then tab-local */
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* nothing to clear */
    }
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      const saved = JSON.parse(raw)
      if (!saved?.address || saved.cluster !== cluster) return null
      if (Date.now() - Number(saved.at || 0) > SESSION_TTL_MS) return null
      return saved
    } catch {
      return null
    }
  }

  /** Solana JSON-RPC. Returns the `result` field or throws with the RPC message. */
  async function rpc(method, params) {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    })
    if (!response.ok) throw new Error(`${rpcUrl} answered HTTP ${response.status}.`)
    const body = await response.json()
    if (body.error) throw new Error(body.error.message || `RPC error on ${method}.`)
    return body.result
  }

  async function refreshBalance() {
    if (!state.address) return null
    try {
      const result = await rpc('getBalance', [state.address, { commitment: 'confirmed' }])
      patch({ balance: BigInt(result?.value ?? 0), balanceAt: Date.now(), balanceError: '' })
    } catch (error) {
      patch({ balance: null, balanceError: describeError(error) })
    }
    bump()
    return state.balance
  }

  async function connect(id) {
    const entry = CATALOG.find((item) => item.id === id) || CATALOG.find((item) => item.detect().some(Boolean))
    if (!entry) throw new Error('No Solana wallet was found in this browser.')
    const target = providerFor(entry.id)
    if (!target) {
      const error = new Error(`${entry.name} is not installed in this browser.`)
      error.install = entry.install
      throw error
    }

    patch({ phase: 'connecting', providerId: entry.id, providerName: entry.name, error: '' })
    bump()

    try {
      const result = await target.connect()
      const address = readPublicKey({ publicKey: result?.publicKey || target.publicKey })
      if (!address) throw new Error('The wallet approved the request but returned no account.')
      bind(target)
      patch({ phase: 'connected', address, error: '' })
      saveSession()
      bump()
      refreshBalance()
      return address
    } catch (error) {
      patch({ phase: 'error', error: describeError(error) })
      bump()
      throw error
    }
  }

  /** Re-attach silently to a wallet that already trusts this origin. */
  async function resume() {
    const saved = readSession()
    if (!saved) return false
    const target = providerFor(saved.wallet)
    if (!target) return false
    bind(target)
    try {
      if (typeof target.connect === 'function') await target.connect({ onlyIfTrusted: true })
      const address = readPublicKey(target) || saved.address
      patch({ phase: 'connected', providerId: saved.wallet, providerName: CATALOG.find((i) => i.id === saved.wallet)?.name || saved.wallet, address, error: '' })
      bump()
      refreshBalance()
      return true
    } catch {
      unbind()
      clearSession()
      patch({ phase: 'idle', address: '', balance: null })
      bump()
      return false
    }
  }

  async function disconnect(silent = false) {
    const target = provider
    unbind()
    provider = null
    if (!silent && target && typeof target.disconnect === 'function') {
      try {
        await target.disconnect()
      } catch {
        /* the wallet may already be closed; the local session is what matters */
      }
    }
    clearSession()
    patch({ phase: 'idle', providerId: '', providerName: '', address: '', error: '', balance: null, balanceError: '' })
    if (!silent) bump()
  }

  function solFromLamports(lamports) {
    if (lamports === null || lamports === undefined) return null
    const value = BigInt(lamports)
    const whole = value / LAMPORTS_PER_SOL
    const frac = (value % LAMPORTS_PER_SOL).toString().padStart(9, '0').slice(0, 4)
    return `${whole}.${frac}`
  }

  /**
   * Sign and broadcast a real transaction that carries `note` in the SPL memo
   * program. Returns the signature, which is a permanent record on the cluster.
   */
  async function signMemo(note) {
    if (!provider || !state.address) throw new Error('Connect a wallet before signing.')
    const latest = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])
    const recentBlockhash = latest?.value?.blockhash || latest?.blockhash || ''
    if (!recentBlockhash) throw new Error('The cluster returned no recent blockhash.')

    const signer = base58Decode(state.address)
    const memo = new TextEncoder().encode(String(note))
    const memoProgram = base58Decode(MEMO_PROGRAM_ID)

    // Minimal legacy message: one writable signer, no lookups, one instruction
    // to the memo program carrying the note as its data.
    const keys = [signer, memoProgram]
    const parts = []
    parts.push(Uint8Array.from([1, 0, 1])) // 1 signature required, 0 readonly signed, 1 readonly unsigned
    parts.push(Uint8Array.from([keys.length]))
    keys.forEach((key) => parts.push(key))
    parts.push(base58Decode(recentBlockhash))
    parts.push(Uint8Array.from([1])) // one instruction
    parts.push(Uint8Array.from([1, 0])) // program id index, then zero account indexes
    parts.push(Uint8Array.from([memo.length]))
    parts.push(memo)

    const message = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    parts.forEach((part) => {
      message.set(part, offset)
      offset += part.length
    })

    const transaction = new Uint8Array(1 + 64 + message.length)
    transaction[0] = 1 // one signature; the zeros are replaced by the wallet
    transaction.set(message, 65)

    const signed = await provider.signTransaction({ message, signatures: [], feePayer: signer })
    // Wallets answer either with a serializable transaction object or with the
    // raw signature bytes; both shapes become the same wire transaction here.
    let raw = null
    if (typeof signed?.serialize === 'function') {
      raw = signed.serialize()
    } else if (signed?.signature?.length === 64) {
      raw = new Uint8Array(1 + 64 + message.length)
      raw[0] = 1
      raw.set(signed.signature, 1)
      raw.set(message, 65)
    } else if (signed?.signatures?.[0]?.length === 64) {
      raw = new Uint8Array(1 + 64 + message.length)
      raw[0] = 1
      raw.set(signed.signatures[0], 1)
      raw.set(message, 65)
    }
    if (!raw || !raw.length) throw new Error('The wallet returned an unsigned transaction.')

    const signature = await rpc('sendTransaction', [
      bytesToBase64(raw),
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 },
    ])
    return { signature, blockhash: recentBlockhash, bytes: raw.length }
  }

  function bytesToBase64(bytes) {
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  }

  return {
    state,
    cluster,
    rpcUrl,
    programId,
    catalog,
    connect,
    resume,
    disconnect,
    refreshBalance,
    signMemo,
    solFromLamports,
    /** Raw cluster read, used by the build probe and useful when debugging RPC wiring. */
    probeRpc: (method, params) => rpc(method, params),
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
