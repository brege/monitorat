window.monitorShared = window.monitorShared || {}
window.monitorShared._scriptPromises = window.monitorShared._scriptPromises || {}

window.monitorShared.loadScript = function (source, globalName) {
  const cache = window.monitorShared._scriptPromises

  if (window[globalName]) {
    return Promise.resolve()
  }

  if (cache[source]) {
    return cache[source]
  }

  const promise = new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script')
    scriptElement.src = source
    scriptElement.async = true
    scriptElement.onload = () => {
      if (!window[globalName]) {
        reject(new Error(`Script loaded but ${globalName} not defined: ${source}`))
        return
      }
      resolve()
    }
    scriptElement.onerror = () => {
      delete cache[source]
      reject(new Error(`Failed to load script: ${source}`))
    }
    document.head.appendChild(scriptElement)
  })

  cache[source] = promise
  return promise
}

window.monitorShared.loadFeatureScripts = async function (featureScripts) {
  const loadScript = window.monitorShared.loadScript

  await Promise.all(
    featureScripts.map((feature) => loadScript(feature.source, feature.globalName))
  )

  const missing = featureScripts.filter((feature) => !window[feature.globalName])
  if (missing.length) {
    const names = missing.map((feature) => feature.globalName).join(', ')
    throw new Error(`Feature scripts missing after load: ${names}`)
  }
}
