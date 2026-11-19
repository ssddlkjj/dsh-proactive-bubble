window.__ModuleLoader__.load({
  id: 'dsh-proactive-bubble',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const ROUTE = '/api/proactive-bubble/state';
    const KEY = 'proactive.bubble.';
    const DEFAULT_SECONDS = 1800;
    const PRESETS = [15, 30, 60, 300, 900, 1800, 3600, 7200];

    function read(sid) {
      try {
        const raw = window.localStorage.getItem(KEY + sid);
        if (!raw) return { enabled: false, seconds: DEFAULT_SECONDS, style: '' };
        const v = JSON.parse(raw);
        const secs = typeof v.seconds === 'number' && v.seconds >= 15 ? v.seconds : DEFAULT_SECONDS;
        return { enabled: !!v.enabled, seconds: secs, style: typeof v.style === 'string' ? v.style : '' };
      } catch (e) { return { enabled: false, seconds: DEFAULT_SECONDS, style: '' }; }
    }
    function write(sid, v) {
      try { window.localStorage.setItem(KEY + sid, JSON.stringify(v)); } catch (e) {}
    }
    function sessionIdOf(props) {
      if (!props) return null;
      if (typeof props.sessionId === 'string' && props.sessionId) return props.sessionId;
      if (props.session && typeof props.session.id === 'string' && props.session.id) return props.session.id;
      return null;
    }
    async function post(body) {
      try {
        const res = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
        });
        return res.status;
      } catch (e) { return 0; }
    }
    function label(seconds) {
      if (seconds < 60) return seconds + ' 秒';
      if (seconds < 3600) return Math.round(seconds / 60) + ' 分钟';
      return Math.round(seconds / 3600) + ' 小时';
    }

    function BubbleToggle(props) {
      const sid = props.sessionId;
      const [cfg, setCfg] = React.useState(function () {
        return sid ? read(sid) : { enabled: false, seconds: DEFAULT_SECONDS, style: '' };
      });
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState('');
      const [menu, setMenu] = React.useState(null);
      const visible = React.useRef(document.visibilityState === 'visible');

      React.useEffect(function () {
        if (!sid) return;
        const report = function () {
          const on = visible.current && document.hasFocus();
          post({ sessionId: sid, focused: on });
        };
        visible.current = document.visibilityState === 'visible';
        report();
        const onVis = function () { visible.current = document.visibilityState === 'visible'; report(); };
        window.addEventListener('focus', report);
        window.addEventListener('blur', report);
        document.addEventListener('visibilitychange', onVis);
        return function () {
          window.removeEventListener('focus', report);
          window.removeEventListener('blur', report);
          document.removeEventListener('visibilitychange', onVis);
          post({ sessionId: sid, focused: false });
        };
      }, [sid]);

      React.useEffect(function () {
        if (!sid) return;
        post({ sessionId: sid, enabled: cfg.enabled, seconds: cfg.seconds, style: cfg.style });
      }, [sid, cfg.enabled, cfg.seconds, cfg.style]);

      React.useEffect(function () {
        if (menu === null) return;
        const close = function () { setMenu(null); };
        window.addEventListener('click', close);
        window.addEventListener('blur', close);
        return function () {
          window.removeEventListener('click', close);
          window.removeEventListener('blur', close);
        };
      }, [menu]);

      if (!sid) return null;

      const toggle = async function () {
        setBusy(true); setNote('');
        const next = { enabled: !cfg.enabled, seconds: cfg.seconds, style: cfg.style };
        setCfg(next); write(sid, next);
        const code = await post({
          sessionId: sid,
          enabled: next.enabled,
          seconds: next.seconds,
          focused: document.visibilityState === 'visible' && document.hasFocus(),
        });
        setNote((next.enabled ? '开 ' : '关 ') + code);
        setTimeout(function () { setBusy(false); setNote(''); }, 3000);
      };

      const pick = function (seconds) {
        const next = { enabled: true, seconds: seconds, style: cfg.style };
        setCfg(next); write(sid, next);
        setMenu(null);
        setNote(label(seconds));
        setTimeout(function () { setNote(''); }, 2500);
      };

      const menuNode = menu === null ? null : ReactDOM.createPortal(h('div', {
        onClick: function (e) { e.stopPropagation(); },
        style: {
          position: 'fixed', left: menu.x + 'px', top: menu.y + 'px',
          zIndex: 99999, minWidth: '132px', padding: '6px',
          borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(28,26,22,0.98)', boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          fontSize: '13px', color: 'rgba(255,255,255,0.82)',
        },
      },
        h('div', { style: { padding: '2px 6px 6px', opacity: 0.5, fontSize: '11px' } }, menu.edit ? '口味（只对这个对话）' : '间隔（只对这个对话）'),
        menu.edit ? null : h('div', {
          onClick: function (e) { e.stopPropagation(); setMenu({ x: menu.x, y: Math.max(8, menu.y - 34), edit: true }); },
          style: { padding: '5px 8px', borderRadius: '5px', cursor: 'pointer', opacity: 0.85 },
        }, '编辑口味…'),
        menu.edit ? h('div', { style: { padding: '4px 6px' } },
          h('input', {
            autoFocus: true,
            defaultValue: cfg.style || '',
            placeholder: '一句风格要求，留空=默认',
            onClick: function (e) { e.stopPropagation(); },
            onKeyDown: function (e) {
              if (e.key === 'Enter') {
                const next = { enabled: cfg.enabled, seconds: cfg.seconds, style: e.currentTarget.value.slice(0, 200) };
                setCfg(next); write(sid, next); setMenu(null);
                setNote(next.style ? '已存口味' : '已清空');
                setTimeout(function () { setNote(''); }, 2500);
              }
            },
            style: {
              width: '100%', boxSizing: 'border-box', padding: '4px 6px',
              borderRadius: '5px', border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)', color: 'inherit', fontSize: '12px', outline: 'none',
            },
          })
        ) : null,
        menu.edit ? null : PRESETS.map(function (m) {
          const active = cfg.seconds === m * 60;
          return h('div', {
            key: m,
            onClick: function () { pick(m); },
            style: {
              padding: '5px 8px', borderRadius: '5px', cursor: 'pointer',
              background: active ? 'rgba(232,196,106,0.16)' : 'transparent',
              color: active ? '#e8c46a' : 'inherit',
            },
          }, label(m));
        })
      ), document.body);

      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        h('button', {
          type: 'button',
          disabled: busy,
          onClick: toggle,
          onContextMenu: function (e) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({ x: Math.max(8, rect.left), y: Math.max(8, rect.top - 8 - PRESETS.length * 30 - 48), edit: false });
          },
          title: '左键开关，右键改间隔（每 ' + label(cfg.seconds) + '）',
          style: {
            padding: '0', border: 'none', margin: '0',
            background: 'transparent',
            color: cfg.enabled ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.45)',
            fontSize: '13px', fontWeight: 400, lineHeight: '1',
            fontFamily: 'inherit', letterSpacing: 'normal', cursor: 'pointer',
          },
        }, cfg.enabled ? '冒泡·开' : '冒泡·停'),
        note ? h('span', { style: { fontSize: '11px', opacity: 0.5 } }, note) : null,
        menuNode);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          ctx.slots.inject('conversation.composer.dock', function () {
            return ctx.slots.register({
              name: 'conversation.composer.dock',
              id: 'proactive-bubble',
              order: 60,
            }, function (props) {
              return h(BubbleToggle, { sessionId: sessionIdOf(props) });
            });
          });
        } catch (e) {
          try { console.warn('[proactive-bubble]', e); } catch (_) {}
        }
      },
    };
  },
});
