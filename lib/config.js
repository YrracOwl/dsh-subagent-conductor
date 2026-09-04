// dsh-subagent-conductor — v2 pure configuration and routing helpers.
//
// v0.2 model: the official `subagent` / `subagent_fork` tools own delegation
// and explicit model selection. This package is a settings and default-route
// layer on top: it never registers a delegation tool, never reads or writes a
// private marker, and never wraps ctx.subagents methods. At every subagent
// request boundary the Host listener applies the conductor layers first:
//
//   root-session selection > default role > global default > official choice
//
// "Official choice" is whatever the creation-time child AgentOptions carry
// (an explicit model-facing route, a tool-instance config default, or the
// creation-time snapshot of the parent route). When every conductor layer is
// empty the listener leaves the official/inherited request untouched.

export const SETTINGS_NAMESPACE = 'subagent-conductor'

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0
const cleanString = (value) => nonEmpty(value) ? value.trim() : undefined

export const DEFAULT_SETTINGS = Object.freeze({
  defaultRoute: Object.freeze({}),
  defaultRole: undefined,
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
  return {
    displayName,
    description,
    ...normalizeRoute(value),
  }
}

// v1 fields that are deliberately dropped in v0.2. The official tool row owns
// transport, persona, toolFilter, maxDepth and background policy now; keeping
// dead copies here would silently pretend they still route requests.
const DROPPED_V1_KEYS = ['subagentProvider', 'maxDepth', 'enableRunInBackground', 'backgroundMode', 'persona', 'toolFilter', 'defaultRouteEffort']

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
  const defaultRoute = normalizeRoute(input.defaultRoute)
  void DROPPED_V1_KEYS
  return {
    defaultRoute,
    ...(defaultRole ? { defaultRole } : {}),
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

/**
 * Resolve the conductor layers only: root-session selection > default role >
 * global default. Each field (provider, model, reasoningEffort) resolves
 * independently from the first layer that defines it; the default role is
 * looked up only when no per-session route exists for a field.
 * @param {{ session?: object, settings?: object }} input
 * @returns {{ provider?: string, model?: string, reasoningEffort?: string, roleId?: string, provenance: object, warnings: string[] }}
 */
export function resolveRoute({ session, settings } = {}) {
  const current = normalizeSettings(settings)
  const warnings = []
  const sessionRoute = normalizeRoute(session)
  const [roleId, role] = roleByReference(current.roles, current.defaultRole, warnings)
  const roleRoute = normalizeRoute(role)
  const defaultRoute = normalizeRoute(current.defaultRoute)
  const layers = [
    ['session', sessionRoute],
    ['role', roleRoute],
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
    warnings,
  }
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

/**
 * Merge the conductor layer over the official creation-time route and express
 * the routing intent of this request boundary, or return undefined when the
 * conductor has nothing to say (pure official/inherit flow). Effort is not
 * decided here: the caller validates the exact provider/model route first and
 * applies conductor effort only when that model publishes it.
 * @param {object} base - resolved request config from next() (provider/model/reasoningEffort).
 * @param {object} conductor - output of resolveRoute().
 * @param {{ provider?: string, model?: string, reasoningEffort?: string }} official - child AgentOptions snapshot.
 * @returns {{ provider: string, model: string, conductorEffort?: string } | undefined}
 */
export function decideRequestRoute(base, conductor, official = {}) {
  const conductorProvider = cleanString(conductor?.provider)
  const conductorModel = cleanString(conductor?.model)
  const conductorEffort = cleanString(conductor?.reasoningEffort)
  if (!conductorProvider && !conductorModel && !conductorEffort) return undefined
  const provider = conductorProvider || cleanString(official.provider) || cleanString(base?.provider)
  const model = conductorModel || cleanString(official.model) || cleanString(base?.model)
  if (!provider || !model) return undefined
  return {
    provider,
    model,
    ...(conductorEffort ? { conductorEffort } : {}),
  }
}

export function applyResolvedRoute(baseConfig, route, effort) {
  const base = baseConfig && typeof baseConfig === 'object' ? baseConfig : {}
  const provider = route?.provider || base.provider
  const model = route?.model || base.model
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
