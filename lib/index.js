// dsh-subagent-conductor — Host half (v0.2)
//
// Settings and default-route layer over the OFFICIAL subagent tools. This
// package does NOT register a delegation tool, does NOT read or write a
// private AgentOptions marker, and never wraps ctx.subagents methods. The
// official tool rows (tool-subagent / tool-subagent-fork) own delegation and
// explicit model-facing selection.
//
// One agent/request listener applies the conductor layers first:
//
//   root-session selection > default role > global default > official choice
//
// "Official choice" is the creation-time child AgentOptions snapshot
// (explicit model-facing route, tool-instance config default, or the parent
// route copied at creation). When every conductor layer is empty the listener
// returns next()'s config untouched, so pure official/inherit flows never
// change. Conductor routes are validated as exact provider/model pairs; a
// conductor reasoning effort is applied only when that exact model publishes
// it. Invalid configured routes degrade with a warning and leave the
// official/inherited request intact — stock delegation never breaks.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import {
  SETTINGS_NAMESPACE,
  applyResolvedRoute,
  decideRequestRoute,
  findRootSessionId,
  isSubagent,
  normalizeReasoningEffort,
  normalizeSettings,
  resolveRoute,
  validateSettings,
} from './config.js'

// ── version-portable settings surface (DSH ≤ 0.1.5 ↔ ≥ 0.1.7-rc.1) ──────────
//
// `volatile()` exists only in @deepseek-ai/schemastery ≥ 3.18.4 (the 0.1.7
// corridor declares ~3.18.4). The 0.1.5 line resolves 3.18.1/3.18.2, where
// `Schema.prototype.volatile` is undefined and calling it throws, so the mark is
// applied capability-detected: without the capability this helper is the
// identity and the schema stays the plain ≤ 0.1.5 registration schema.
const volatile = (schema) => (typeof schema?.volatile === 'function' ? schema.volatile() : schema)

// A volatile field's parsed value is a cosmokit wrapper that carries get() plus
// the registered write symbol and nothing else — there is no `.set`, so the
// reader must key on the symbol. Never import @deepseek-ai/cosmokit for this:
// the 0.1.5 line does not export the guard, this plugin must not add a
// dependency, and Symbol.for is available on every supported host.
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')
// Exported as the single reader both the Host branch and the tests use: a value
// this function does not unwrap is a plain value, not a wrapper.
export function readVolatile(value) {
  if (value === null || typeof value !== 'object') return value
  if (typeof value.get !== 'function') return value
  if (!(VOLATILE_WRITE in value)) return value
  return value.get()
}

const RouteSchema = Schema.object({ provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string() })
const RoleSchema = Schema.object({
  displayName: Schema.string(),
  description: Schema.string(),
  provider: Schema.string(),
  model: Schema.string(),
  reasoningEffort: Schema.string(),
})
// ONE schema expression serves both hosts. On ≤ 0.1.5 it is the namespace schema
// handed to ctx.settings.register (the volatile() helper above is the identity
// there, so that path is unchanged); on ≥ 0.1.7 it is this entry's `Config`,
// which the settings service keys by the loader entry id — the `id:` of the row
// in cordis.patch.yml, which is why SETTINGS_NAMESPACE and that row id must stay
// equal (the client resolves the same key through the settings-form transport).
//
// Volatility placement follows the declarative host's rules:
//   * defaultRoute sits at a fixed path, so its LEAVES are volatile: a write
//     addressing the whole node ("defaultRoute") is refused as "not volatile",
//     while "defaultRoute.provider" is accepted. The client therefore writes
//     each leaf separately and unsets the leaves it wants to inherit.
//   * roles / sessionSelections are records keyed at RUNTIME (role id, root
//     session id), so the dict NODE itself is volatile and its children stay
//     plain: a volatile field inside a dict/record, or a volatile field enclosed
//     by another volatile field, is rejected at resolve time.
const SettingsSchema = Schema.object({
  defaultRoute: Schema.object({
    provider: volatile(Schema.string()),
    model: volatile(Schema.string()),
    reasoningEffort: volatile(Schema.string()),
  }).default({}),
  defaultRole: volatile(Schema.string()),
  roles: volatile(Schema.dict(RoleSchema).default({})),
  sessionSelections: volatile(Schema.dict(RouteSchema).default({})),
})

export const name = 'dsh-subagent-conductor'
export const inject = ['llm']

/** Detached provider/model/effort snapshot carried on the child AgentOptions. */
function officialOptions(agent) {
  const options = agent?.options && typeof agent?.options === 'object' ? agent.options : {}
  return {
    ...(typeof options.provider === 'string' && options.provider ? { provider: options.provider } : {}),
    ...(typeof options.model === 'string' && options.model ? { model: options.model } : {}),
    ...(typeof options.reasoningEffort === 'string' && options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
  }
}

/**
 * Project the declarative host's parsed Config into the plain settings shape
 * normalizeSettings/validateSettings accept. A volatile node's parsed value is a
 * cosmokit wrapper, so every read goes through readVolatile. Nothing is cached:
 * the settings service edits volatile fields in place without remounting the
 * entry, so the effective value must be read on every routing decision.
 */
function readConfiguredSettings(config) {
  const source = config && typeof config === 'object' ? config : {}
  const route = readVolatile(source.defaultRoute)
  const record = route && typeof route === 'object' ? route : {}
  return {
    defaultRoute: {
      provider: readVolatile(record.provider),
      model: readVolatile(record.model),
      reasoningEffort: readVolatile(record.reasoningEffort),
    },
    defaultRole: readVolatile(source.defaultRole),
    roles: readVolatile(source.roles),
    sessionSelections: readVolatile(source.sessionSelections),
  }
}

/** v0.1-only keys v0.2 dropped. The declarative host's one-shot importer refuses a section that carries any of them. */
const V01_ONLY_KEYS = ['subagentProvider', 'backgroundMode', 'maxDepth', 'enableRunInBackground']

/**
 * Point at a pre-upgrade settings document the host's one-shot import could not move.
 *
 * `dsh-settings` renames `<home>/settings.yaml` to `.imported` BEFORE its first write and
 * then imports each section with `settings.update(section, values)`. That write refuses any
 * path which is neither declared nor volatile:
 *
 *     Config field "subagentProvider" is not volatile
 *
 * so a v0.1 section still carrying one of {@link V01_ONLY_KEYS} is rejected AS A WHOLE,
 * taking `defaultRoute` and every `sessionSelections` entry with it — and the only trace is
 * a `logger.warn` nobody reads. This reports the file, the offending keys and the fix.
 * It stays silent when the values did arrive, when the document is gone, or when the home
 * path is unknowable: a diagnostic must never be the reason a plugin misbehaves.
 *
 * @param ctx - the plugin context, used only for `profileContext` and the logger.
 * @param effective - the settings this apply resolved, to tell "refused" from "never set".
 */
export function reportUnimportableLegacyDocument(ctx, effective) {
  try {
    const home = ctx.get('profileContext')?.home
    if (typeof home !== 'string' || home === '') return
    const file = join(home, 'settings.yaml.imported')
    if (!existsSync(file)) return
    const section = /^subagent-conductor:\n(?:[ \t].*\n|\n)*/m.exec(readFileSync(file, 'utf8'))?.[0]
    if (section === undefined) return
    const carried = V01_ONLY_KEYS.filter((key) => new RegExp(`^[ \t]+${key}:`, 'm').test(section))
    if (carried.length === 0) return
    // The section was refused whole, so nothing from it arrived. Once the user has
    // applied the values themselves there is nothing left to report.
    if (effective?.defaultRoute?.provider || effective?.defaultRoute?.model) return
    if (Object.keys(effective?.sessionSelections ?? {}).length > 0) return
    ctx.logger.warn(
      `[${name}] ${file} still carries a "subagent-conductor" section with v0.1-only keys (${carried.join(', ')}): `
      + 'the one-shot settings import refuses the WHOLE section on the first undeclared key, so this entry fell back '
      + 'to defaults and your defaultRoute / sessionSelections were not applied. Re-apply the values you want to keep '
      + 'as an entry config override (a "subagent-conductor" row carrying config.defaultRoute / config.sessionSelections '
      + 'in the profile patch), then restart.',
    )
  } catch {
    // Reporting is best-effort by contract: never fail an apply over it.
  }
}

export function apply(ctx, config) {
  let getSettings = () => normalizeSettings({})
  // The request listener runs once per subagent boundary; a rejected Config is
  // reported once per distinct message instead of on every request.
  let lastConfigWarning

  ctx.inject(['settings'], (sctx) => {
    // ── settings surface: dual-host wiring ──────────────────────────────────
    // ≤ 0.1.5  ctx.settings.register(namespace, schema, options) exists and this
    //          plugin owns its `subagent-conductor` namespace. Every stored value
    //          is validated by validateSettings and read back from the scope, so
    //          routing sees the last accepted write.
    // ≥ 0.1.7  register() is GONE. The namespace exists only as this entry's
    //          `Config`, keyed by the loader entry id; only `.volatile()` fields
    //          are exposed, and the service edits them IN PLACE without
    //          remounting the entry. getSettings therefore reads the plugin's own
    //          `config` argument through readVolatile on every call — caching a
    //          value here would freeze routing at its boot state. This branch
    //          additionally calls configure({ auto: false }, ctx.fiber) so the
    //          official UI does not generate a generic page next to this plugin's
    //          own card; the namespace still reaches the client mirror, so the
    //          card and the composer selector keep working. Passing THIS entry's
    //          fiber is required: the service keys that policy by fiber.
    // Both branches degrade to normalized-empty settings, and every path stays
    // non-throwing when the settings service is absent.
    const settings = sctx.settings
    if (!settings) return

    if (typeof settings.register === 'function') {
      const settingsScope = settings.register(SETTINGS_NAMESPACE, SettingsSchema, {
        base: normalizeSettings({}),
        applies: 'live',
        validate: validateSettings,
      })
      getSettings = () => normalizeSettings(settingsScope.get())
    } else if (typeof settings.configure === 'function') {
      sctx.effect(() => {
        // configure() throws when one fiber registers a policy twice (the
        // settings service was replaced and this callback re-ran). Losing the
        // suppression only restores the generated page, so stay non-fatal.
        try {
          return settings.configure({ auto: false }, ctx.fiber)
        } catch (error) {
          ctx.logger.warn(`[${name}] settings.configure({ auto: false }) was refused: ${String(error?.message || error)}`)
          return undefined
        }
      }, `${name}: settings presentation`)
      getSettings = () => {
        try {
          const effective = validateSettings(readConfiguredSettings(config))
          lastConfigWarning = undefined
          return effective
        } catch (error) {
          const message = String(error?.message || error)
          if (message !== lastConfigWarning) {
            lastConfigWarning = message
            ctx.logger.warn(`[${name}] ignoring invalid entry config: ${message}`)
          }
          return normalizeSettings({})
        }
      }
      // One-time, non-fatal: say so when the host's one-shot import had to refuse a
      // v0.1 document (see reportUnimportableLegacyDocument) instead of silently
      // routing on defaults.
      reportUnimportableLegacyDocument(sctx, getSettings())
    } else {
      return
    }

    sctx.effect(() => () => {
      getSettings = () => normalizeSettings({})
    }, `${name}: settings fallback`)
  })

  ctx.on('agent/request', async (payload, next) => {
    const base = await next()
    const agent = payload?.agent
    if (!isSubagent(agent)) return base
    const settings = getSettings()
    const agents = ctx.get('agents')
    const rootId = findRootSessionId(agent, agents)
    const conductor = resolveRoute({
      session: rootId ? settings.sessionSelections[rootId] : undefined,
      settings,
    })
    const official = officialOptions(agent)
    const intent = decideRequestRoute(base, conductor, official)
    if (!intent) return base
    const changed = intent.provider !== base?.provider || intent.model !== base?.model
    if (!changed && !intent.conductorEffort) return base
    let modelInfo
    try {
      modelInfo = await ctx.llm.resolveModelInfo(intent.provider, intent.model, payload?.signal)
    } catch (error) {
      ctx.logger.warn(`[${name}] ignored conductor route ${intent.provider}/${intent.model}: ${String(error?.message || error)}`)
      return base
    }
    let effort
    if (intent.conductorEffort) {
      effort = normalizeReasoningEffort(modelInfo, intent.conductorEffort)
      if (!effort) {
        ctx.logger.warn(`[${name}] ${intent.provider}/${intent.model} does not publish reasoning effort "${intent.conductorEffort}"; ${changed ? 'switching route without effort' : 'keeping the official request'}`)
        if (!changed) return base
      }
    }
    return applyResolvedRoute(base, intent, effort)
  })
}

// The loader unwraps a default export (`exports.default ?? exports`) before
// applying a plugin, so the default object must carry name/inject/apply itself.
// Its `Config` is the one thing the ≥ 0.1.7 settings service reads from this
// entry — and the reason apply takes a second `config` argument.
//
// `settings` and the renamed settings transport must NEVER join `inject`: cordis
// resolves every inject name as a required gate, so an absent provider would
// leave this fiber INACTIVE and fail the whole Web boot. The optional transport
// stays behind the non-gating `ctx.inject([...], cb)` inside apply, exactly as
// before.
export default { name, inject, apply, Config: SettingsSchema }
