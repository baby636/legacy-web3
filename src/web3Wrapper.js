require('web3/dist/web3.min.js')

const getMessage = (message) => `@metamask/legacy-web3 - ${message}`
const getExitMessage = (message) => `${getMessage(message)} Exiting without initializing window.web3.`

setupWeb3()

/**
 * Inject window.web3 and set up auto reload on chain/network change.
 */
function setupWeb3 () {

  // if used before MetaMask stops injecting window.web3
  if (window.ethereum && window.ethereum.isMetaMask && window.web3) {
    console.log(getExitMessage('Detected MetaMask-injected window.web3.'))
    return
  }

  if (window.web3) {
    console.log(getExitMessage('Detected existing window.web3.'))
    return
  }

  if (window.ethereum && !window.ethereum.isMetaMask) {
    console.warn(getMessage(
      'Detected non-MetaMask window.ethereum. ' +
      'Proceeding to initialize window.web3, but may experience undefined behavior.',
    ))
  }

  if (!('autoRefreshOnNetworkChange' in window.ethereum)) {
    window.ethereum.autoRefreshOnNetworkChange = true
  }

  /*
   * We now construct a lazy provider in case this script is run before the ethereum provider is injected.
   * This can happen either because this script is run in a different extension for backwards-compat,
   * or because the provider is being injected late for another reason (platform specific).
   */
  const lazyProvider = new Proxy({}, {
    get (_target, prop, receiver) {
      return Reflect.get(window.ethereum, prop, receiver)
    },
    set (_target, sKey, vValue) {
      return Reflect.set(window.ethereum, sKey, vValue)
    },
    deleteProperty (_target, sKey) {
      return Reflect.deleteProperty(window.ethereum, sKey)
    },
    enumerate (_target, sKey) {
      return Object.keys(window.ethereum)
    },
    ownKeys (_target, sKey) {
      return Reflect.ownKeys(window.ethereum)
    },
    has (_target, sKey) {
      return Reflect.has(window.ethereum, sKey)
    },
    defineProperty (_target, sKey, oDesc) {
      return Reflect.defineProperty(window.ethereum, oKey, oDesc)
    },
    getOwnPropertyDescriptor (_target, sKey) {
      return Reflect.getOwnPropertyDescriptor(window.ethereum, sKey)
    },
  })

  const web3 = new Web3(lazyProvider)

  web3.setProvider = function () {
    console.warn(getMessage('Overrode web3.setProvider.'))
  }
  console.log(getMessage('Injected web3.js'))

  // update the default account when the revealed accounts change
  window.ethereum.on('accountsChanged', (accounts) => {
    web3.eth.defaultAccount = Array.isArray(accounts) && accounts.length > 0
      ? accounts[0]
      : null
  })

  // export web3 as a global, checking for usage
  let reloadInProgress = false
  let lastTimeUsed
  let previousChainId

  const web3Proxy = new Proxy(web3, {
    get: (_web3, key) => {
      // get the time of use
      lastTimeUsed = Date.now()
      // return value normally
      return _web3[key]
    },
    set: (_web3, key, value) => {
      // set value normally
      _web3[key] = value
    },
  })

  Object.defineProperty(window, 'web3', {
    enumerable: false,
    writable: true,
    configurable: true,
    value: web3Proxy,
  })

  window.ethereum.on('chainChanged', (currentChainId) => {
    // if the auto refresh on network change is false do not
    // do anything
    if (!window.ethereum.autoRefreshOnNetworkChange) {
      return
    }

    // if reload in progress, no need to check reload logic
    if (reloadInProgress) {
      return
    }

    // set the initial chain
    if (!previousChainId) {
      previousChainId = currentChainId
      return
    }

    // skip reload logic if web3 not used
    if (!lastTimeUsed) {
      return
    }

    // if chain did not change, skip reload
    if (currentChainId === previousChainId) {
      return
    }

    // initiate page reload
    reloadInProgress = true
    const timeSinceUse = Date.now() - lastTimeUsed
    // if web3 was recently used then delay the reloading of the page
    if (timeSinceUse > 500) {
      window.location.reload()
    } else {
      setTimeout(window.location.reload, 500)
    }
  })
}
