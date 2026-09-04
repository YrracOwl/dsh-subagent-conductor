export const SETTINGS_NAMESPACE = 'subagent-conductor'
export const TOOL_NAME = 'subagent_direct'
export const MARKER_KEY = '__dshSubagentConductor'

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0
const cleanString = (value) => nonEmpty(value) ? value.trim() : undefined
const cleanList = (value) => Array.isArray(value)
  ? [...new Set(value.map(cleanString).filter(Boolean))]
  : undefined

export const DEFAULT_SETTINGS = Object.freeze({
  defaultRoute: Object.freeze({}),
  subagentProvider: 'spawn',
  maxDepth: 3,
  enableRunInBackground: true,
  backgroundMode: 'one-shot',
  roles: Object.freeze({}),
  sessionSelections: Object.freeze({}),
})

export function normalizeRoute(value) {
  if (!value || typeof value !== 'object') return {}
  const provider = cleanString(value.provider)
  const model = cleanString(value.model)
  const reasoningEffort = cleanString(value.reasoningEffort)
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }
}

export function normalizeRole(value) {
  if (!value || typeof value !== 'object') return undefined
  const displayName = cleanString(value.displayName)
  const description = cleanString(value.description)
  if (!displayName || !description) return undefined
  const route = normalizeRoute(value)
  const persona = cleanString(value.persona)
  const allow = cleanList(value.toolFilter && value.toolFilter.allow)
  const deny = cleanList(value.toolFilter && value.toolFilter.deny)
  const toolFilter = allow?.length || deny?.length
    ? { ...(allow?.length ? { allow } : {}), ...(deny?.length ? { deny } : {}) }
    : undefined
  return {
    displayName,
    description,
    ...route,
    ...(persona ? { persona } : {}),
    ...(toolFilter ? { toolFilter } : {}),
  }
}

export function normalizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {}
  const roles = {}
  for (const [id, role] of Object.entries(input.roles || {})) {
    const normalized = normalizeRole(role)
    if (normalized && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) roles[id] = normalized
  }
  const sessionSelections = {}
  for (const [id, route] of Object.entries(input.sessionSelections || {})) {
    const normalized = normalizeRoute(route)
    if (nonEmpty(id) && normalized.provider && normalized.model) sessionSelections[id] = normalized
  }
  const defaultRole = cleanString(input.defaultRole)
  const subagentProvider = cleanString(input.subagentProvider) || 'spawn'
  const maxDepth = Number.isSafeInteger(input.maxDepth) && input.maxDepth >= 0 && input.maxDepth <= 32
    ? input.maxDepth
    : 3
  return {
    defaultRoute: normalizeRoute(input.defaultRoute),
    ...(defaultRole ? { defaultRole } : {}),
    subagentProvider,
    maxDepth,
    enableRunInBackground: input.enableRunInBackground !== false,
    backgroundMode: input.backgroundMode === 'continuable' ? 'continuable' : 'one-shot',
    roles,
    sessionSelections,
  }
}

export function validateSettings(value) {
  const normalized = normalizeSettings(value)
  for (const [id, role] of Object.entries(value?.roles || {})) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`subagent-conductor: role id "${id}" must be kebab-case`)
    if (!normalizeRole(role)) throw new Error(`subagent-conductor: role "${id}" requires non-empty displayName and description`)
  }
  if (normalized.defaultRole && !normalized.roles[normalized.defaultRole]) {
    throw new Error(`subagent-conductor: defaultRole "${normalized.defaultRole}" does not exist`)
  }
  return normalized
}

function roleByReference(roles, reference, warnings) {
  if (!reference) return [undefined, undefined]
  if (roles[reference]) return [reference, roles[reference]]
  const matches = Object.entries(roles).filter(([, role]) => role.displayName === reference)
  if (!matches.length) {
    warnings.push(`role "${reference}" does not exist`)
    return [undefined, undefined]
  }
  if (matches.length > 1) warnings.push(`multiple roles use displayName "${reference}"; using "${matches[0][0]}"`)
  warnings.push(`role "${reference}" resolved by displayName; prefer id "${matches[0][0]}"`)
  return matches[0]
}

export function isFreshSubagent(agent) {
  const depth = agent?.options?.subagentDepth
  return Number.isSafeInteger(depth) && depth >= 1
}

export function resolveRoute({ marker, session, settings, applyDefaultRole }) {
  if (typeof applyDefaultRole !== 'boolean') {
    throw new TypeError('subagent-conductor: resolveRoute requires an explicit applyDefaultRole policy')
  }
  const current = normalizeSettings(settings)
  const call = normalizeRoute(marker && marker.call)
  const warnings = []
  const requestedRole = cleanString(marker && marker.role) || (applyDefaultRole ? current.defaultRole : undefined)
  const [roleId, role] = roleByReference(current.roles, requestedRole, warnings)
  const roleRoute = normalizeRoute(role)
  const sessionRoute = normalizeRoute(session)
  const defaultRoute = current.defaultRoute
  const layers = [
    ['call', call],
    ['role', roleRoute],
    ['session', sessionRoute],
    ['default', defaultRoute],
  ]
  const field = (name) => {
    for (const [layer, route] of layers) if (route[name]) return { value: route[name], layer }
    return { value: undefined, layer: 'inherit' }
  }
  const provider = field('provider')
  const model = field('model')
  const reasoningEffort = field('reasoningEffort')
  return {
    provider: provider.value,
    model: model.value,
    reasoningEffort: reasoningEffort.value,
    provenance: { provider: provider.layer, model: model.layer, reasoningEffort: reasoningEffort.layer },
    ...(roleId ? { roleId } : {}),
    ...(role?.persona ? { persona: role.persona } : {}),
    ...(role?.toolFilter ? { toolFilter: role.toolFilter } : {}),
    warnings,
  }
}

export function makeMarker({ role, provider, model, reasoningEffort } = {}) {
  const call = normalizeRoute({ provider, model, reasoningEffort })
  const roleId = cleanString(role)
  return Object.freeze({ version: 1, ...(roleId ? { role: roleId } : {}), ...(Object.keys(call).length ? { call } : {}) })
}

export function readMarker(agent) {
  const marker = agent?.options?.[MARKER_KEY]
  if (!marker || marker.version !== 1 || typeof marker !== 'object') return undefined
  return makeMarker({ role: marker.role, ...(marker.call || {}) })
}

export function isSubagent(agent) {
  const depth = agent?.options?.subagentDepth
  if (Number.isSafeInteger(depth) && depth >= 1) return true
  return agent?.session?.header?.origin === 'subagent'
}

export function findRootSessionId(agent, agents) {
  let current = agent
  const visited = new Set()
  while (current) {
    const id = current.id
    if (typeof id !== 'string' || visited.has(id)) return undefined
    visited.add(id)
    const header = current.session?.header
    if (header?.origin !== 'subagent') return id
    const parentId = header.parentSession
    if (typeof parentId !== 'string' || !parentId) return id
    current = agents?.get(parentId)
  }
  return undefined
}

export function resolveRootSessionId(sessionId, agents) {
  if (!nonEmpty(sessionId)) return undefined
  const agent = agents?.get(sessionId)
  return agent ? (findRootSessionId(agent, agents) || sessionId) : sessionId
}

export function applyResolvedRoute(baseConfig, route, effort) {
  const base = baseConfig && typeof baseConfig === 'object' ? baseConfig : {}
  const provider = route.provider || base.provider
  const model = route.model || base.model
  const changed = provider !== base.provider || model !== base.model
  const result = { ...base, ...(provider ? { provider } : {}), ...(model ? { model } : {}) }
  if (changed) delete result.reasoningEffort
  if (effort) result.reasoningEffort = effort
  return result
}

export function normalizeReasoningEffort(modelInfo, requested) {
  const effort = cleanString(requested)
  if (!effort || !modelInfo?.reasoning || !Array.isArray(modelInfo.reasoning.efforts)) return undefined
  return modelInfo.reasoning.efforts.some((entry) => entry && entry.id === effort) ? effort : undefined
}
