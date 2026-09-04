window.__ModuleLoader__.load({
  id: 'dsh-subagent-conductor',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const e = React.createElement
    const NS = 'subagent-conductor'

    const CSS = [
      '.dscRoot{position:relative;display:inline-flex}',
      '.dscButton{height:28px;border:0;border-radius:24px;padding:0 4px 0 8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;max-width:min(360px,45cqw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;display:flex;align-items:center;gap:4px}',
      '.dscLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dscEffort{color:var(--dsw-alias-label-caption);font-size:13px;font-weight:500;line-height:20px;flex:none}',
      '.dscButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.dscTriggerChevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}.dscTriggerChevronOpen{transform:rotate(180deg)}',
      '.dscMenu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:20;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column}',
      '.dscCell{box-sizing:border-box;width:auto;min-width:100%;height:40px;border:0;border-radius:10px;padding:0 10px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px}.dscCell:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dscCellLabel{white-space:nowrap;flex:none}.dscCellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}.dscCellChevron{color:var(--dsw-alias-label-tertiary);flex:none}',
      '.dscGroups{overflow-y:auto;display:flex;flex-direction:column;padding:2px;gap:6px}.dscGroup{padding:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3)}.dscGroupTitle{margin-bottom:2px;padding:6px 8px;border-radius:7px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:18px;letter-spacing:.01em}',
      '.dscOption{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:8px;padding:7px 8px;text-align:left;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dscOption:hover,.dscSelected{background:var(--dsw-alias-interactive-bg-hover)}.dscOptionCopy{display:flex;flex-direction:column;min-width:0;flex:1}.dscModelName{font-size:13px;font-weight:500;line-height:20px}.dscDescription{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dscCheck{width:16px;color:var(--dsw-alias-brand-primary);flex:none}',
      '.dscOption:disabled{cursor:not-allowed;opacity:.55}.dscOption:disabled:hover{background:transparent}.dscSource{margin-left:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 5px;white-space:nowrap;flex:none}',
      '.dscMenu .dscError,.dscMenu .dscHint{padding:6px 10px;font-size:12px;line-height:18px}.dscField input[type=checkbox]{width:auto;flex:none;margin:0}',
      '.dscCard{font:inherit;color:inherit;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}.dscCard:hover,.dscCardOpen{border-color:var(--dsw-alias-label-dimmed)}.dscCardOpen{background:var(--dsw-alias-bg-layer-2)}',
      '.dscCardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}.dscCardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dscCardHeadText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}.dscCardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dscCardDescription{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dscCardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dscCardOpen .dscCardChevron{transform:rotate(180deg)}.dscCardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:2px 0 8px}',
      '.dscStack{display:flex;flex-direction:column}.dscStack>.dscField{padding:12px 0}.dscStack>.dscField+.dscField{border-top:1px solid var(--dsw-alias-border-l2)}.dscField{font:inherit;display:flex;flex-direction:column;gap:5px;min-width:0}.dscFieldHead{font:inherit;display:flex;align-items:center;gap:6px}.dscFieldLabel{flex:1}.dscField input,.dscField select,.dscField textarea{font:inherit;box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.dscField select:disabled{opacity:.55;cursor:not-allowed;color:var(--dsw-alias-label-dimmed)}.dscHint{font:inherit;color:var(--dsw-alias-label-tertiary)}',
      '.dscModelField{position:relative}.dscModelTrigger{font:inherit;box-sizing:border-box;width:100%;min-height:34px;display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left}.dscModelTrigger:hover{border-color:var(--dsw-alias-label-dimmed)}.dscModelTriggerText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dscModelChevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .16s}.dscModelChevronOpen{transform:rotate(180deg)}.dscSettingsMenu{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:100%;min-width:min(340px,calc(100vw - 64px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column}',
      '.dscHelp{font:inherit;width:22px;height:22px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;padding:0;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-weight:700;line-height:20px;cursor:pointer}.dscHelp:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}',
      '.dscInlinePanel{font:inherit;margin:12px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);padding:14px}.dscDialogHead{display:flex;align-items:center;gap:12px;margin-bottom:12px}.dscDialogTitle{font:inherit;font-weight:600;flex:1}.dscDialogClose{font:inherit;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dscInlinePanel h4{font:inherit;font-weight:600;margin:16px 0 6px}.dscInlinePanel pre{font:inherit;overflow:auto;margin:0;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:12px;background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);white-space:pre-wrap}.dscInlinePanel>textarea{font:inherit;box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dscPriority{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);line-height:1.6}.dscRolesHead{display:flex;align-items:center;gap:8px}.dscRolesHead strong{flex:1}.dscSecondary,.dscRoleActions button,.dscDialogActions button{font:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dscRoleList{display:flex;flex-direction:column;gap:8px}.dscRoleCard{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px;background:var(--dsw-alias-bg-layer-3)}.dscRoleTitle{display:flex;align-items:baseline;gap:8px}.dscRoleTitle strong{flex:1}.dscRoleId,.dscRoleRoute{color:var(--dsw-alias-label-tertiary)}.dscRoleCard p{margin:5px 0}.dscRoleActions{display:flex;justify-content:flex-end;gap:6px}.dscRoleEmpty{margin:0;color:var(--dsw-alias-label-tertiary)}.dscDialogGrid{display:flex;flex-direction:column}.dscDialogGrid>.dscField{padding:10px 0}.dscDialogGrid>.dscField+.dscField{border-top:1px solid var(--dsw-alias-border-l2)}.dscDialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.dscDialogActions button:last-child,.dscRolesHead .dscPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}.dscError{color:var(--dsw-alias-state-error-primary)}',
      '.dscActions{display:flex;justify-content:flex-end;gap:8px;margin-top:0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}.dscActions button{font:inherit;border:0;border-radius:8px;padding:6px 13px;cursor:pointer}',
    ].join('')

    function modelGroups(groups) {
      return (groups || []).map((group) => ({
        id: group.id,
        name: group.name || group.id,
        models: (group.models || []).map((model) => ({
          provider: group.id,
          model: model.id,
          name: model.name || model.id,
          description: model.description || model.id,
          reasoning: model.reasoning,
        })),
      }))
    }

    const cleanString = (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined
    const ROLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const SOURCE_LABELS = { role: '默认角色', session: '根会话选择', default: '全局默认', inherit: '原生继承' }

    function resolveRootSessionId(sessionId, byId) {
      if (typeof sessionId !== 'string' || !sessionId) return { rootId: undefined, blocked: false }
      let id = sessionId
      const visited = new Set()
      while (id) {
        if (visited.has(id)) return { rootId: undefined, blocked: true }
        visited.add(id)
        const summary = byId && byId[id]
        if (!summary) {
          // Without an official summary the Client cannot distinguish a root from
          // an addressed child. Fail closed so it never writes a child-only key.
          return { rootId: undefined, blocked: true }
        }
        if (summary.origin !== 'subagent') return { rootId: id, blocked: false }
        const parentId = summary.parentId
        if (typeof parentId !== 'string' || !parentId) return { rootId: id, blocked: false }
        id = parentId
      }
      return { rootId: undefined, blocked: true }
    }

    function cleanStringArray(items, id, field) {
      if (items === undefined) return undefined
      if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) throw new Error(`角色 "${id}" 的 toolFilter.${field} 必须是字符串数组。`)
      return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
    }

    function normalizeImportedRoles(raw) {
      try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('顶层必须是角色对象。')
        const roles = {}
        for (const [id, record] of Object.entries(raw)) {
          if (typeof id !== 'string' || !ROLE_ID_PATTERN.test(id)) throw new Error(`角色 ID "${id}" 无效：必须是小写 kebab-case。`)
          if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`角色 "${id}" 必须是对象。`)
          const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : ''
          if (!displayName) throw new Error(`角色 "${id}" 缺少非空 displayName。`)
          const description = typeof record.description === 'string' ? record.description.trim() : ''
          if (!description) throw new Error(`角色 "${id}" 缺少非空 description。`)
          const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
          const model = typeof record.model === 'string' ? record.model.trim() : ''
          if (!!provider !== !!model) throw new Error(`角色 "${id}" 的 provider 与 model 必须成对出现。`)
          const reasoningEffort = typeof record.reasoningEffort === 'string' ? record.reasoningEffort.trim() : ''
          if (reasoningEffort && !provider) throw new Error(`角色 "${id}" 的 reasoningEffort 仅在同时指定 provider 与 model 时有效。`)
          const persona = typeof record.persona === 'string' ? record.persona.trim() : ''
          if (record.persona !== undefined && typeof record.persona !== 'string') throw new Error(`角色 "${id}" 的 persona 必须是字符串。`)
          let toolFilter
          if (record.toolFilter !== undefined) {
            if (!record.toolFilter || typeof record.toolFilter !== 'object' || Array.isArray(record.toolFilter)) throw new Error(`角色 "${id}" 的 toolFilter 必须是对象。`)
            const allow = cleanStringArray(record.toolFilter.allow, id, 'allow')
            const deny = cleanStringArray(record.toolFilter.deny, id, 'deny')
            if (allow?.length || deny?.length) toolFilter = { ...(allow?.length ? { allow } : {}), ...(deny?.length ? { deny } : {}) }
          }
          roles[id] = { displayName, description, ...(provider ? { provider } : {}), ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}), ...(persona ? { persona } : {}), ...(toolFilter ? { toolFilter } : {}) }
        }
        return { roles }
      } catch (error) {
        return { error: String(error?.message || error) }
      }
    }

    const ChevronDown14 = (props) => e('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props },
      e('path', { d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z', fill: 'currentColor' }))
    const ChevronRight14 = (props) => e('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props },
      e('path', { d: 'M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z', fill: 'currentColor' }))

    function Selector({ sessionId, useSessions, api, scope }) {
      const [, tick] = React.useReducer((n) => n + 1, 0)
      const [state, setState] = React.useState({ open: false, pane: 'root', groups: [] })
      const ref = React.useRef(null)
      const byId = useSessions((s) => s.byId)
      React.useEffect(() => scope?.subscribe ? scope.subscribe(tick) : undefined, [scope])
      React.useEffect(() => {
        let live = true
        api.llm.models({}).then((models) => {
          if (!live) return
          const groups = models?.result?.ok ? models.result.value.groups : []
          setState((s) => ({ ...s, groups: modelGroups(groups) }))
        }).catch(() => {})
        return () => { live = false }
      }, [sessionId, api])
      React.useEffect(() => {
        if (!state.open) return undefined
        const outside = (event) => { if (!ref.current?.contains(event.target)) setState((s) => ({ ...s, open: false })) }
        const key = (event) => { if (event.key === 'Escape') setState((s) => s.pane !== 'root' ? ({ ...s, pane: 'root' }) : ({ ...s, open: false })) }
        document.addEventListener('mousedown', outside)
        document.addEventListener('keydown', key)
        return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
      }, [state.open])
      const snap = scope?.getSnapshot?.()
      const value = snap?.status === 'ready' ? (snap.value || {}) : {}
      const lineage = resolveRootSessionId(sessionId, byId)
      const rootId = lineage.rootId
      const lineageBlocked = lineage.blocked
      const sessionRoute = rootId ? (value.sessionSelections?.[rootId] || null) : null
      const mutationDisabled = lineageBlocked || !snap?.writable
      const roleRoute = value.roles && value.defaultRole ? (value.roles[value.defaultRole] || {}) : {}
      const layers = [
        ['role', roleRoute],
        ['session', sessionRoute || {}],
        ['default', value.defaultRoute || {}],
      ]
      const field = (name) => {
        for (const [layer, route] of layers) {
          const cleaned = cleanString(route && route[name])
          if (cleaned) return { value: cleaned, layer }
        }
        return { value: undefined, layer: 'inherit' }
      }
      const provider = field('provider')
      const model = field('model')
      const reasoningEffort = field('reasoningEffort')
      const choices = state.groups.flatMap((group) => group.models)
      const effectiveModel = model.value && choices.find((o) => o.provider === provider.value && o.model === model.value)
      const reasoning = effectiveModel?.reasoning
      const explicitEffort = cleanString(sessionRoute?.reasoningEffort)
      const effectiveEffort = reasoningEffort.value || (reasoning ? reasoning.defaultEffort : undefined)
      const effortLabel = reasoning
        ? (reasoning.efforts || []).find((level) => level.id === effectiveEffort)?.name || effectiveEffort || '默认'
        : undefined
      const effortChoices = reasoning ? [
        ...(reasoning.defaultEffort === undefined ? [{ id: undefined, name: '默认' }] : []),
        ...(reasoning.efforts || []),
      ] : []
      const modelLabel = effectiveModel ? effectiveModel.model : (model.value || 'inherit')
      const modelValue = effectiveModel ? `${effectiveModel.name} · ${effectiveModel.provider}` : (model.value ? `${model.value} · ${provider.value}` : '继承主模型')
      const modelSource = provider.layer === model.layer ? SOURCE_LABELS[model.layer] : `混合：${SOURCE_LABELS[provider.layer]}/${SOURCE_LABELS[model.layer]}`
      const effortWritable = !!(sessionRoute && sessionRoute.provider && sessionRoute.model)
      const row = (label, valueText, pane, source) => e('button', { type: 'button', className: 'dscCell', role: 'menuitem', onClick: () => setState((s) => ({ ...s, pane })) },
        e('span', { className: 'dscCellLabel' }, label),
        source && e('span', { className: 'dscSource' }, source),
        e('span', { className: 'dscCellValue' }, valueText),
        e(ChevronRight14, { className: 'dscCellChevron', 'aria-hidden': true }),
      )
      const option = (key, selected, name, description, onClick, disabled) => e('button', { key, type: 'button', className: `dscOption${selected ? ' dscSelected' : ''}`, role: 'menuitemradio', 'aria-checked': selected, disabled, onClick },
        e('span', { className: 'dscOptionCopy' }, e('span', { className: 'dscModelName' }, name), description && e('span', { className: 'dscDescription' }, description)),
        e('span', { className: 'dscCheck', 'aria-hidden': true }, selected ? '✓' : ''),
      )
      async function writeRoute(route, close) {
        if (mutationDisabled || !rootId) return
        const op = route
          ? { op: 'set', path: ['sessionSelections', rootId], value: route }
          : { op: 'unset', path: ['sessionSelections', rootId] }
        const payload = { ns: NS, ops: [op], ...(snap.revision === undefined ? {} : { expectedRevision: snap.revision }) }
        const response = await api.settings.mutate(payload)
        if (response?.result?.ok) setState((s) => ({ ...s, open: close ? false : s.open, pane: 'model' }))
      }
      return e('div', { className: 'dscRoot', ref },
        e('button', { type: 'button', className: 'dscButton', 'aria-haspopup': 'menu', 'aria-expanded': state.open, onClick: () => setState((s) => ({ ...s, open: !s.open, pane: 'root' })) },
          e('span', { className: 'dscLabel' }, `sub丨${modelLabel}`),
          effortLabel !== undefined && e('span', { className: 'dscEffort' }, `· ${effortLabel}`),
          e(ChevronDown14, { className: `dscTriggerChevron${state.open ? ' dscTriggerChevronOpen' : ''}`, 'aria-hidden': true }),
        ),
        state.open && e('div', { className: 'dscMenu', role: 'menu' },
          lineageBlocked && e('p', { className: 'dscError', role: 'alert' }, '无法解析本会话的父级归属（链路缺失或成环），已停用路由选择，避免写入无效会话键。'),
          state.pane === 'root' && e(React.Fragment, null,
            row('模型', modelValue, 'model', modelSource),
            reasoning && row('思考强度', effortLabel, 'effort', SOURCE_LABELS[reasoningEffort.layer]),
          ),
          state.pane === 'model' && e('div', { className: 'dscGroups' },
            option('inherit', !sessionRoute, '继承主模型', '清除本会话选择，恢复默认角色/全局默认或原生继承', () => writeRoute(null, true), mutationDisabled),
            state.groups.map((group) => e('section', { key: group.id, className: 'dscGroup', role: 'group', 'aria-label': group.name },
              e('div', { className: 'dscGroupTitle' }, group.name),
              group.models.map((model) => option(`${group.id}/${model.model}`, !!(sessionRoute && sessionRoute.provider === group.id && sessionRoute.model === model.model), model.name, `${group.id} · ${model.model}${model.description && model.description !== model.model ? ` · ${model.description}` : ''}`, () => writeRoute({ provider: group.id, model: model.model, ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }) }, true), mutationDisabled)),
            )),
          ),
          state.pane === 'effort' && (effortWritable
            ? effortChoices.map((level) => option(level.id || 'default', sessionRoute ? (level.id === undefined ? !explicitEffort : explicitEffort === level.id) : false, level.name || level.id, level.description, () => writeRoute({ ...sessionRoute, ...(level.id === undefined ? {} : { reasoningEffort: level.id }) }, true), mutationDisabled))
            : e('p', { className: 'dscHint' }, '先在本会话选择模型，才能固定思考强度；当前强度来自默认角色、全局默认或模型默认。')),
        ),
      )
    }

    function SettingsCard({ scope, api }) {
      const [, tick] = React.useReducer((n) => n + 1, 0)
      const [draft, setDraft] = React.useState(null)
      const [message, setMessage] = React.useState('')
      const [groups, setGroups] = React.useState([])
      const [open, setOpen] = React.useState(false)
      const [modelOpen, setModelOpen] = React.useState(false)
      const [roleEditor, setRoleEditor] = React.useState(null)
      const [jsonOpen, setJsonOpen] = React.useState(false)
      const [jsonText, setJsonText] = React.useState('')
      const [dialogError, setDialogError] = React.useState('')
      const modelRef = React.useRef(null)
      React.useEffect(() => scope?.subscribe ? scope.subscribe(tick) : undefined, [scope])
      React.useEffect(() => {
        let live = true
        api.llm.models({}).then((response) => {
          if (live && response?.result?.ok) setGroups(modelGroups(response.result.value.groups))
        }).catch(() => {})
        return () => { live = false }
      }, [api])
      React.useEffect(() => {
        if (!roleEditor && !jsonOpen && !modelOpen) return undefined
        const key = (event) => {
          if (event.key !== 'Escape') return
          if (roleEditor) setRoleEditor(null)
          else if (jsonOpen) setJsonOpen(false)
          else setModelOpen(false)
        }
        const outside = (event) => { if (modelOpen && !modelRef.current?.contains(event.target)) setModelOpen(false) }
        document.addEventListener('keydown', key)
        document.addEventListener('mousedown', outside)
        return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', outside) }
      }, [roleEditor, jsonOpen, modelOpen])
      const snap = scope?.getSnapshot?.()
      if (!snap || snap.status !== 'ready') return null
      const value = snap.value || {}
      const form = draft || { provider: value.defaultRoute?.provider || '', model: value.defaultRoute?.model || '', effort: value.defaultRoute?.reasoningEffort || '', providerTransport: value.subagentProvider || 'spawn', backgroundMode: value.backgroundMode || 'one-shot', maxDepth: Number.isSafeInteger(value.maxDepth) && value.maxDepth >= 0 && value.maxDepth <= 32 ? value.maxDepth : 3, enableRunInBackground: value.enableRunInBackground !== false, defaultRole: value.defaultRole || '', roles: value.roles || {} }
      const set = (key, next) => setDraft({ ...form, [key]: next })
      const setRoles = (roles, defaultRole = form.defaultRole) => setDraft({ ...form, roles, defaultRole })
      const selectedModel = groups.flatMap((group) => group.models).find((model) => model.provider === form.provider && model.model === form.model)
      const effortChoices = (selectedModel?.reasoning?.efforts || []).map((effort) => ({ value: effort.id, label: effort.name }))
      const effortAvailable = !!(selectedModel?.reasoning?.efforts?.length)
      const modelRouteLabel = selectedModel ? `${selectedModel.name} · ${selectedModel.provider}` : (form.provider && form.model ? `${form.model} · ${form.provider}（当前值不可用）` : '继承')
      const chooseModel = (provider, model) => {
        setDraft({ ...form, provider, model, effort: '' })
        setModelOpen(false)
      }
      async function save() {
        try {
          const ops = [
            { op: 'set', path: ['defaultRoute'], value: { ...(form.provider.trim() ? { provider: form.provider.trim() } : {}), ...(form.model.trim() ? { model: form.model.trim() } : {}), ...(effortAvailable && form.effort.trim() ? { reasoningEffort: form.effort.trim() } : {}) } },
            { op: 'set', path: ['subagentProvider'], value: form.providerTransport.trim() || 'spawn' },
            { op: 'set', path: ['backgroundMode'], value: form.backgroundMode },
            { op: 'set', path: ['maxDepth'], value: form.maxDepth },
            { op: 'set', path: ['enableRunInBackground'], value: form.enableRunInBackground },
            { op: 'set', path: ['roles'], value: form.roles },
            form.defaultRole ? { op: 'set', path: ['defaultRole'], value: form.defaultRole } : { op: 'unset', path: ['defaultRole'] },
          ]
          const payload = { ns: NS, ops, ...(snap.revision === undefined ? {} : { expectedRevision: snap.revision }) }
          const response = await api.settings.mutate(payload)
          if (!response?.result?.ok) throw new Error(response?.result?.error?.message || 'save rejected')
          setDraft(null); setMessage('已保存；下一次请求边界生效。')
        } catch (error) { setMessage(String(error?.message || error)) }
      }
      const nativeSelect = (label, key, choices, hint, onChange, disabled) => {
        const known = choices.some((item) => item.value === form[key])
        return e('label', { className: 'dscField' },
          e('span', { className: 'dscFieldHead' }, e('span', { className: 'dscFieldLabel' }, label)),
          e('select', { value: form[key], disabled, onChange: (ev) => (onChange || ((next) => set(key, next)))(ev.target.value) },
            e('option', { value: '' }, '继承'),
            form[key] && !known && e('option', { value: form[key] }, `${form[key]}（当前值不可用）`),
            choices.map((item) => e('option', { key: item.value, value: item.value }, item.label)),
          ),
          e('span', { className: 'dscHint' }, hint),
        )
      }
      const modelRouteField = e('div', { className: 'dscField dscModelField', ref: modelRef },
        e('span', { className: 'dscFieldHead' }, e('span', { className: 'dscFieldLabel' }, '默认提供商与模型')),
        e('button', { type: 'button', className: 'dscModelTrigger', 'aria-haspopup': 'menu', 'aria-expanded': modelOpen, onClick: () => setModelOpen((value) => !value) },
          e('span', { className: 'dscModelTriggerText' }, modelRouteLabel),
          e(ChevronDown14, { className: `dscModelChevron${modelOpen ? ' dscModelChevronOpen' : ''}`, 'aria-hidden': true }),
        ),
        modelOpen && e('div', { className: 'dscSettingsMenu', role: 'menu' }, e('div', { className: 'dscGroups' },
          e('button', { type: 'button', className: `dscOption${!form.provider && !form.model ? ' dscSelected' : ''}`, role: 'menuitemradio', 'aria-checked': !form.provider && !form.model, onClick: () => chooseModel('', '') },
            e('span', { className: 'dscOptionCopy' }, e('span', { className: 'dscModelName' }, '继承'), e('span', { className: 'dscDescription' }, '不覆盖主代理或会话路由')),
            e('span', { className: 'dscCheck', 'aria-hidden': true }, !form.provider && !form.model ? '✓' : ''),
          ),
          groups.map((group) => e('section', { key: group.id, className: 'dscGroup', role: 'group', 'aria-label': group.name },
            e('div', { className: 'dscGroupTitle' }, group.name),
            group.models.map((model) => {
              const selected = form.provider === group.id && form.model === model.model
              return e('button', { key: `${group.id}/${model.model}`, type: 'button', className: `dscOption${selected ? ' dscSelected' : ''}`, role: 'menuitemradio', 'aria-checked': selected, onClick: () => chooseModel(group.id, model.model) },
                e('span', { className: 'dscOptionCopy' }, e('span', { className: 'dscModelName' }, model.name), e('span', { className: 'dscDescription' }, `${group.id} · ${model.model}${model.description && model.description !== model.model ? ` · ${model.description}` : ''}`)),
                e('span', { className: 'dscCheck', 'aria-hidden': true }, selected ? '✓' : ''),
              )
            }),
          )),
        )),
        e('span', { className: 'dscHint' }, '提供商与模型在同一列表中选择。'),
      )
      const roleEntries = Object.entries(form.roles)
      const openRoleEditor = (id, role, copy) => {
        const source = role || {}
        let nextId = copy ? `${id}-copy` : (id || '')
        if (copy) { let index = 2; while (form.roles[nextId]) nextId = `${id}-copy-${index++}` }
        setDialogError('')
        setRoleEditor({ originalId: copy ? null : (id || null), id: nextId, displayName: source.displayName || '', description: source.description || '', persona: source.persona || '', provider: source.provider || '', model: source.model || '', reasoningEffort: source.reasoningEffort || '', allow: (source.toolFilter?.allow || []).join(', '), deny: (source.toolFilter?.deny || []).join(', ') })
      }
      const splitTools = (text) => [...new Set(String(text || '').split(',').map((item) => item.trim()).filter(Boolean))]
      const saveRoleEditor = () => {
        const id = roleEditor.id.trim()
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return setDialogError('角色 ID 必须是小写 kebab-case。')
        if (!roleEditor.displayName.trim() || !roleEditor.description.trim()) return setDialogError('显示名称和角色描述不能为空。')
        if (!roleEditor.originalId && form.roles[id]) return setDialogError('该角色 ID 已存在。')
        const allow = splitTools(roleEditor.allow); const deny = splitTools(roleEditor.deny)
        const role = { displayName: roleEditor.displayName.trim(), description: roleEditor.description.trim(), ...(roleEditor.persona.trim() ? { persona: roleEditor.persona.trim() } : {}), ...(roleEditor.provider && roleEditor.model ? { provider: roleEditor.provider, model: roleEditor.model } : {}), ...(roleEditor.provider && roleEditor.model && roleEffortAvailable && roleEditor.reasoningEffort ? { reasoningEffort: roleEditor.reasoningEffort } : {}), ...(allow.length || deny.length ? { toolFilter: { ...(allow.length ? { allow } : {}), ...(deny.length ? { deny } : {}) } } : {}) }
        const roles = { ...form.roles }; if (roleEditor.originalId && roleEditor.originalId !== id) delete roles[roleEditor.originalId]; roles[id] = role
        setRoles(roles, form.defaultRole === roleEditor.originalId ? id : form.defaultRole); setRoleEditor(null); setDialogError('')
      }
      const removeRole = (id) => { const roles = { ...form.roles }; delete roles[id]; setRoles(roles, form.defaultRole === id ? '' : form.defaultRole) }
      const roleModel = roleEditor && groups.flatMap((group) => group.models).find((model) => model.provider === roleEditor.provider && model.model === roleEditor.model)
      const roleEfforts = roleModel?.reasoning?.efforts || []
      const roleEffortAvailable = roleEfforts.length > 0
      const updateRoleEditor = (key, next) => setRoleEditor({ ...roleEditor, [key]: next })
      const advancedField = e('section', { className: 'dscField' },
        e('strong', null, '高级设置'),
        e('label', { className: 'dscField' },
          e('span', { className: 'dscFieldLabel' }, '子代理深度上限（maxDepth）'),
          e('input', { type: 'number', min: 0, max: 32, step: 1, value: form.maxDepth, onChange: (event) => { const raw = event.target.value.trim(); if (!raw) return; const parsed = Math.floor(Number(raw)); set('maxDepth', Number.isFinite(parsed) ? Math.max(0, Math.min(32, parsed)) : form.maxDepth) } }),
          e('span', { className: 'dscHint' }, '单次委派链允许的嵌套深度，0–32。'),
        ),
        e('label', { className: 'dscField' },
          e('span', { className: 'dscFieldHead' }, e('span', { className: 'dscFieldLabel' }, '允许后台运行'), e('input', { type: 'checkbox', checked: form.enableRunInBackground, onChange: (event) => set('enableRunInBackground', event.target.checked) })),
          e('span', { className: 'dscHint' }, '关闭后 subagent_direct 忽略 run_in_background，一律前台执行。'),
        ),
      )
      const rolesField = e('section', { className: 'dscField' },
        e('div', { className: 'dscRolesHead' }, e('strong', null, '角色'), e('button', { type: 'button', className: 'dscSecondary', onClick: () => { setJsonText(JSON.stringify(form.roles, null, 2)); setDialogError(''); setJsonOpen(true) } }, '导入/导出 JSON'), e('button', { type: 'button', className: 'dscSecondary dscPrimary', onClick: () => openRoleEditor('', null, false) }, '+ 新建角色')),
        e('label', { className: 'dscField' }, e('span', { className: 'dscFieldLabel' }, '默认角色'), e('select', { value: form.defaultRole, onChange: (event) => set('defaultRole', event.target.value) }, e('option', { value: '' }, '不指定'), roleEntries.map(([id, role]) => e('option', { key: id, value: id }, `${role.displayName} · ${id}`))), e('span', { className: 'dscHint' }, '默认角色高于输入框会话选择；不指定时，原生子代理不会自动套用角色。')),
        e('div', { className: 'dscRoleList' }, roleEntries.length ? roleEntries.map(([id, role]) => {
          const model = groups.flatMap((group) => group.models).find((item) => item.provider === role.provider && item.model === role.model)
          const route = role.provider && role.model ? `${model?.name || role.model} · ${role.provider}${role.reasoningEffort ? ` · ${role.reasoningEffort}` : ''}` : '继承输入框会话选择或全局默认'
          return e('article', { key: id, className: 'dscRoleCard' }, e('div', { className: 'dscRoleTitle' }, e('strong', null, role.displayName), e('span', { className: 'dscRoleId' }, id)), e('p', null, role.description), e('p', { className: 'dscRoleRoute' }, route), e('div', { className: 'dscRoleActions' }, e('button', { type: 'button', onClick: () => openRoleEditor(id, role, false) }, '编辑'), e('button', { type: 'button', onClick: () => openRoleEditor(id, role, true) }, '复制'), e('button', { type: 'button', onClick: () => removeRole(id) }, '删除')))
        }) : e('p', { className: 'dscRoleEmpty' }, '还没有角色。新建角色后，主代理可通过 subagent_direct 按角色委派。')),
      )
      const roleDialog = roleEditor && e('section', { className: 'dscInlinePanel', role: 'region', 'aria-label': roleEditor.originalId ? '编辑角色' : '新建角色' },
          e('div', { className: 'dscDialogHead' }, e('div', { className: 'dscDialogTitle' }, roleEditor.originalId ? '编辑角色' : '新建角色'), e('button', { type: 'button', className: 'dscDialogClose', 'aria-label': '关闭', onClick: () => setRoleEditor(null) }, '×')),
          e('div', { className: 'dscDialogGrid' },
            e('label', { className: 'dscField' }, e('span', null, '角色 ID'), e('input', { value: roleEditor.id, disabled: !!roleEditor.originalId, placeholder: 'code-reviewer', onChange: (event) => updateRoleEditor('id', event.target.value) }), e('span', { className: 'dscHint' }, '创建后保持稳定；仅允许小写字母、数字和连字符。')),
            e('label', { className: 'dscField' }, e('span', null, '显示名称'), e('input', { value: roleEditor.displayName, onChange: (event) => updateRoleEditor('displayName', event.target.value) })),
            e('label', { className: 'dscField' }, e('span', null, '角色描述'), e('input', { value: roleEditor.description, onChange: (event) => updateRoleEditor('description', event.target.value) })),
            e('label', { className: 'dscField' }, e('span', null, 'Persona / 角色指令'), e('textarea', { rows: 5, value: roleEditor.persona, onChange: (event) => updateRoleEditor('persona', event.target.value) }), e('span', { className: 'dscHint' }, '只应用于直接创建的子代理，不自动传播给孙级。')),
            e('label', { className: 'dscField' }, e('span', null, '提供商与模型'), e('select', { value: roleEditor.provider && roleEditor.model ? `${roleEditor.provider}/${roleEditor.model}` : '', onChange: (event) => { const selected = groups.flatMap((group) => group.models).find((model) => `${model.provider}/${model.model}` === event.target.value); setRoleEditor({ ...roleEditor, provider: selected?.provider || '', model: selected?.model || '', reasoningEffort: '' }) } }, e('option', { value: '' }, '继承输入框会话选择或全局默认'), groups.map((group) => e('optgroup', { key: group.id, label: group.name }, group.models.map((model) => e('option', { key: model.model, value: `${group.id}/${model.model}` }, `${model.name} · ${model.model}`))))), e('span', { className: 'dscHint' }, '提供商与模型成对选择，避免跨层拼接出无效组合。')),
            e('label', { className: 'dscField' }, e('span', null, '思考强度'), e('select', { value: roleEditor.reasoningEffort, disabled: !roleEffortAvailable, onChange: (event) => updateRoleEditor('reasoningEffort', event.target.value) }, e('option', { value: '' }, '继承'), roleEfforts.map((effort) => e('option', { key: effort.id, value: effort.id }, effort.name))), e('span', { className: 'dscHint' }, roleEffortAvailable ? '角色强度高于输入框会话选择。' : '选定模型未公开 reasoning.efforts，无法固定强度。')),
            e('label', { className: 'dscField' }, e('span', null, '允许的工具'), e('input', { value: roleEditor.allow, placeholder: 'read, grep, glob', onChange: (event) => updateRoleEditor('allow', event.target.value) }), e('span', { className: 'dscHint' }, '可选，使用逗号分隔。allow 和 deny 都留空时不创建 toolFilter，保留子代理原本可见的全部工具。')),
            e('label', { className: 'dscField' }, e('span', null, '禁止的工具'), e('input', { value: roleEditor.deny, placeholder: 'write', onChange: (event) => updateRoleEditor('deny', event.target.value) }), e('span', { className: 'dscHint' }, '“全部工具”仍受 agent 预设、父级过滤、权限和运行时能力限制。')),
          ),
          dialogError && e('p', { className: 'dscError', role: 'alert' }, dialogError),
          e('div', { className: 'dscDialogActions' }, e('button', { type: 'button', onClick: () => setRoleEditor(null) }, '取消'), e('button', { type: 'button', onClick: saveRoleEditor }, '应用到草稿')),
      )
      const jsonDialog = jsonOpen && e('section', { className: 'dscInlinePanel', role: 'region', 'aria-label': '导入或导出角色 JSON' },
          e('div', { className: 'dscDialogHead' }, e('div', { className: 'dscDialogTitle' }, '导入/导出角色 JSON'), e('button', { type: 'button', className: 'dscDialogClose', 'aria-label': '关闭', onClick: () => setJsonOpen(false) }, '×')),
          e('p', null, '高级入口：可复制当前 JSON，或粘贴完整角色对象后应用到草稿。每条记录都会先校验（ID、必填字段、provider/model 配对、toolFilter 形状），最终保存仍由 Host 校验。'),
          e('textarea', { rows: 18, value: jsonText, onChange: (event) => setJsonText(event.target.value), style: { width: '100%', boxSizing: 'border-box', font: 'inherit' } }),
          dialogError && e('p', { className: 'dscError', role: 'alert' }, dialogError),
          e('div', { className: 'dscDialogActions' }, e('button', { type: 'button', onClick: () => setJsonOpen(false) }, '取消'), e('button', { type: 'button', onClick: () => { try { const parsed = JSON.parse(jsonText || '{}'); const imported = normalizeImportedRoles(parsed); if (imported.error) throw new Error(imported.error); setRoles(imported.roles, imported.roles[form.defaultRole] ? form.defaultRole : ''); setJsonOpen(false); setDialogError('') } catch (error) { setDialogError(String(error?.message || error)) } } }, '应用到草稿')),
      )
      return e(React.Fragment, null,
        e('li', { className: `dscCard${open ? ' dscCardOpen' : ''}` },
          e('button', { type: 'button', className: 'dscCardHeader', 'aria-expanded': open, 'aria-label': `${open ? '折叠' : '展开'}：子代理指挥`, onClick: () => { setOpen((value) => !value); setModelOpen(false) } },
            e('span', { className: 'dscCardHeadText' },
              e('span', { className: 'dscCardName' }, '子代理指挥 / Subagent Conductor'),
              e('span', { className: 'dscCardDescription' }, '配置全局默认路由和角色模板。候选项来自主模型目录。'),
            ),
            e(ChevronDown14, { className: 'dscCardChevron', 'aria-hidden': true }),
          ),
          open && e('div', { className: 'dscCardBody' },
            e('div', { className: 'dscStack' },
              e('section', { className: 'dscField' }, e('strong', null, '路由优先级'), e('p', { className: 'dscPriority' }, '单次 subagent_direct 参数 ＞ 选定角色 ＞ 输入框当前会话选择 ＞ 本页全局默认 ＞ DSH 原生继承。provider、model 和思考强度分别按此顺序解析；最终组合仍会校验。')),
              modelRouteField,
              nativeSelect('默认思考强度', 'effort', effortChoices, effortAvailable ? '请在提供商与模型选定后选择；继承时使用模型默认强度。' : '当前模型未公开思考强度元数据，无法选择。', undefined, !effortAvailable),
              nativeSelect('子代理传输', 'providerTransport', [{ value: 'spawn', label: 'spawn · 独立上下文' }, { value: 'fork', label: 'fork · 继承父历史' }], '选择子代理的进程内传输方式。'),
              e('label', { className: 'dscField' }, e('span', { className: 'dscFieldHead' }, e('span', { className: 'dscFieldLabel' }, '后台模式')), e('select', { value: form.backgroundMode, onChange: (ev) => set('backgroundMode', ev.target.value) }, e('option', { value: 'one-shot' }, 'one-shot'), e('option', { value: 'continuable' }, 'continuable'))),
              advancedField,
              rolesField,
            ),
            roleDialog,
            jsonDialog,
            message && e('p', { role: 'status' }, message),
            e('div', { className: 'dscActions' }, e('button', { type: 'button', disabled: !draft, onClick: () => setDraft(null) }, '放弃'), e('button', { type: 'button', onClick: save }, '保存')),
          ),
        ),
      )
    }

    function apply(ctx) {
      const style = document.createElement('style')
      style.dataset.pluginCss = `${NS}/style`; style.textContent = CSS; document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), `${NS}: styles`)
      // Compatibility layer: use DSH 0.1.2 fine-grained remotes when present;
      // keep the legacy connection API for older RC hosts.
      const remote = ctx.get('remote')
      const api = remote
        ? { llm: { models: () => remote.session.modelCatalog().then((result) => ({ result })) }, settings: { mutate: (payload) => remote.settings.mutate(payload.ns, payload.ops, payload.expectedRevision).then((result) => ({ result })) } }
        : (ctx.get('connection') && ctx.get('connection').api)
      const scope = ctx.settingsScope.bind({ namespace: NS })
      // DSH 0.1.2 Slot contract supplies standard session-scoped props directly;
      // do not use the removed ownerProps/sessionId injection shape.
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: NS, order: -10 },
        (props) => e(Selector, { ...props, api, scope }),
      ))
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', key: NS, label: 'CONDUCTOR' }, () => e(SettingsCard, { scope, api })))
    }
    exports.name = NS
    exports.inject = ['slots', 'connection', 'settingsScope']
    exports.apply = apply
    return module.exports
  },
})
